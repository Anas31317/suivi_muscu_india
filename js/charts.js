/**
 * Graphes SVG écrits à la main (aucune librairie, fonctionne hors ligne).
 *
 * - courbe de progression d'un exercice (avec survol) ;
 * - histogramme des séances par semaine (accueil) ;
 * - mini-courbe (sparkline) pour la vue d'ensemble.
 *
 * Les couleurs viennent de classes CSS (.c-*) : elles suivent le thème et
 * restent fiables sur tous les navigateurs. Une seule série par graphe,
 * un seul axe Y.
 */

import { fmtNum, formatDate, formatDateShort } from './store.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs) {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
  return el;
}

function text(x, y, content, cls, anchor = 'middle') {
  const t = svgEl('text', { x, y, class: cls, 'text-anchor': anchor });
  t.textContent = content;
  return t;
}

function niceTicks(min, max, target = 4) {
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const ticks = [];
  for (let v = Math.floor(min / step) * step; v <= Math.ceil(max / step) * step + step / 1000; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

function setsLabel(sets, mode) {
  return sets
    .map((s) => {
      const reps = s.reps === null ? '?' : s.reps;
      if (s.weight === null) return `${reps} reps`;
      if (mode === 'bw' && s.weight === 0) return `${reps} (PdC)`;
      return `${fmtNum(s.weight)} kg × ${reps}`;
    })
    .join('  ·  ');
}

/**
 * Dessine `draw(host, width)` à la largeur réelle du conteneur, et redessine
 * quand elle change. Renvoie une fonction de nettoyage.
 */
export function mountResponsive(host, draw) {
  let frame = 0;
  let lastW = 0;
  const run = () => {
    const w = Math.round(host.clientWidth);
    if (!w || w === lastW) return;
    lastW = w;
    draw(host, Math.max(260, w));
  };
  // 1er dessin dès que la page est insérée (sans attendre l'image suivante)
  queueMicrotask(run);
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(run);
  });
  ro.observe(host);
  return () => { ro.disconnect(); cancelAnimationFrame(frame); };
}

/* ------------------------------------------------ courbe de progression */

const LINE_PAD = { top: 28, right: 18, bottom: 30, left: 46 };
const LINE_H = 250;

/**
 * @param {Array} points  [{ iso, x: Date, y: number, sets }]
 * @param {object} opts   { unit, label, mode }
 */
export function mountChart(host, points, opts = {}) {
  host.classList.add('chart');
  return mountResponsive(host, (el, width) => drawLine(el, width, points, opts));
}

function drawLine(host, width, points, opts) {
  const unit = opts.unit || '';
  const mode = opts.mode || 'kg';
  const P = LINE_PAD;
  const innerW = width - P.left - P.right;
  const innerH = LINE_H - P.top - P.bottom;
  host.textContent = '';

  const ys = points.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const yScale = (v) => P.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;
  const t0 = points[0].x.getTime();
  const t1 = points[points.length - 1].x.getTime();
  const xScale = (d) => (points.length === 1 ? P.left + innerW / 2 : P.left + ((d.getTime() - t0) / (t1 - t0 || 1)) * innerW);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${LINE_H}`, width, height: LINE_H, role: 'img',
    'aria-label': `${opts.label || 'Progression'} : ${points.length} séances, du ${formatDate(points[0].iso)} au ${formatDate(points[points.length - 1].iso)}`
  });

  for (const t of ticks) {
    const y = yScale(t);
    svg.append(svgEl('line', { x1: P.left, x2: width - P.right, y1: y, y2: y, class: 'c-grid' }));
    svg.append(text(P.left - 8, y + 4, fmtNum(t, 1), 'c-tick', 'end'));
  }

  const maxLabels = Math.max(2, Math.min(5, Math.floor(innerW / 64)));
  const step = Math.max(1, Math.ceil(points.length / maxLabels));
  points.forEach((p, i) => {
    const isLast = i === points.length - 1;
    if (i % step !== 0 && !isLast) return;
    const anchor = points.length > 1 && i === 0 ? 'start' : points.length > 1 && isLast ? 'end' : 'middle';
    svg.append(text(xScale(p.x), LINE_H - 9, formatDateShort(p.iso), 'c-tick', anchor));
  });

  svg.append(svgEl('line', { x1: P.left, x2: width - P.right, y1: P.top + innerH, y2: P.top + innerH, class: 'c-base' }));

  const coords = points.map((p) => [xScale(p.x), yScale(p.y)]);
  if (coords.length > 1) {
    const base = P.top + innerH;
    svg.append(svgEl('path', {
      class: 'c-area',
      d: `M ${coords[0][0]} ${base} ` + coords.map(([x, y]) => `L ${x} ${y}`).join(' ') + ` L ${coords[coords.length - 1][0]} ${base} Z`
    }));
    svg.append(svgEl('path', { class: 'c-line', d: coords.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ') }));
  }

  const cross = svgEl('line', { y1: P.top, y2: P.top + innerH, class: 'c-cross' });
  svg.append(cross);
  const dots = coords.map(([x, y]) => svgEl('circle', { cx: x, cy: y, r: 4, class: 'c-dot' }));
  dots.forEach((d) => svg.append(d));

  // étiquette directe sur la dernière valeur uniquement
  const [lx, ly] = coords[coords.length - 1];
  const nearRight = lx > width - P.right - 42;
  svg.append(text(nearRight ? lx : lx + 8, ly - 10, fmtNum(points[points.length - 1].y, 1) + (unit ? ' ' + unit : ''), 'c-end', nearRight ? 'end' : 'start'));

  const hit = svgEl('rect', { class: 'hit', x: P.left - 10, y: P.top, width: innerW + 20, height: innerH, fill: 'transparent' });
  svg.append(hit);
  host.append(svg);

  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  host.append(tip);

  let active = -1;
  const show = (i) => {
    if (i === active) return;
    active = i;
    const p = points[i];
    const [x, y] = coords[i];
    cross.setAttribute('x1', x);
    cross.setAttribute('x2', x);
    cross.classList.add('on');
    dots.forEach((d, k) => d.setAttribute('r', k === i ? 6 : 4));
    tip.textContent = '';
    for (const [cls, content] of [
      ['d', formatDate(p.iso)],
      ['v', fmtNum(p.y, 1) + (unit ? ' ' + unit : '')],
      ['s', setsLabel(p.sets, mode)]
    ]) {
      const line = document.createElement('div');
      line.className = cls;
      line.textContent = content;
      tip.append(line);
    }
    tip.classList.add('on');
    const scale = host.clientWidth / width || 1;
    tip.style.left = Math.max(70, Math.min(host.clientWidth - 70, x * scale)) + 'px';
    tip.style.top = Math.max(34, y * scale - 12) + 'px';
  };
  const hide = () => {
    active = -1;
    cross.classList.remove('on');
    dots.forEach((d) => d.setAttribute('r', 4));
    tip.classList.remove('on');
  };
  const nearest = (evt) => {
    const rect = svg.getBoundingClientRect();
    const xIn = ((evt.clientX - rect.left) / rect.width) * width;
    let best = 0;
    coords.forEach(([x], i) => { if (Math.abs(x - xIn) < Math.abs(coords[best][0] - xIn)) best = i; });
    return best;
  };
  hit.addEventListener('pointermove', (e) => show(nearest(e)));
  hit.addEventListener('pointerdown', (e) => show(nearest(e)));
  svg.addEventListener('pointerleave', hide);
}

/* -------------------------------------------- séances par semaine (barres) */

const BAR_PAD = { top: 22, right: 4, bottom: 24, left: 4 };
const BAR_H = 150;

/** @param {Array} weeks [{ iso: 'YYYY-MM-DD' (lundi), count }], du plus ancien au plus récent */
export function mountWeekBars(host, weeks) {
  host.classList.add('chart');
  return mountResponsive(host, (el, width) => drawBars(el, width, weeks));
}

function drawBars(host, width, weeks) {
  const P = BAR_PAD;
  const innerW = width - P.left - P.right;
  const innerH = BAR_H - P.top - P.bottom;
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const band = innerW / weeks.length;
  const barW = Math.min(34, band * 0.62);
  const base = P.top + innerH;
  host.textContent = '';

  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${BAR_H}`, width, height: BAR_H, role: 'img',
    'aria-label': 'Séances par semaine : ' + weeks.map((w) => `semaine du ${formatDateShort(w.iso)} : ${w.count}`).join(', ')
  });
  svg.append(svgEl('line', { x1: P.left, x2: width - P.right, y1: base, y2: base, class: 'c-base' }));

  weeks.forEach((w, i) => {
    const cx = P.left + band * i + band / 2;
    const current = i === weeks.length - 1;
    const g = svgEl('g', { class: 'c-band' });
    const title = svgEl('title', {});
    title.textContent = `Semaine du ${formatDateShort(w.iso)} : ${w.count} séance${w.count > 1 ? 's' : ''}`;
    g.append(title);
    // zone de survol plus large que la barre
    g.append(svgEl('rect', { x: cx - band / 2, y: P.top - 6, width: band, height: innerH + 6, fill: 'transparent' }));
    if (w.count > 0) {
      const hgt = Math.max(4, (w.count / max) * innerH);
      const x = cx - barW / 2;
      const y = base - hgt;
      const r = Math.min(4, barW / 2, hgt);
      // coins arrondis en haut seulement, ancrée sur la ligne de base
      g.append(svgEl('path', {
        class: current ? 'c-bar' : 'c-bar c-bar-past',
        d: `M ${x} ${base} V ${y + r} Q ${x} ${y} ${x + r} ${y} H ${x + barW - r} Q ${x + barW} ${y} ${x + barW} ${y + r} V ${base} Z`
      }));
      // valeur écrite sur la semaine en cours seulement ; les autres au survol
      if (current) g.append(text(cx, y - 6, String(w.count), 'c-end'));
    }
    const showLabel = weeks.length <= 8 || i % 2 === (weeks.length - 1) % 2;
    if (showLabel) g.append(text(cx, BAR_H - 7, current ? 'Cette sem.' : formatDateShort(w.iso), 'c-tick'));
    svg.append(g);
  });
  host.append(svg);
}

/* ----------------------------------------------------------- sparkline */

/** Mini-courbe statique (80 × 28), dernier point marqué. */
export function sparkline(values, { width = 80, height = 28 } = {}) {
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'spark', 'aria-hidden': 'true' });
  if (values.length < 2) return svg;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 4;
  const x = (i) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v) => (max === min ? height / 2 : height - pad - ((v - min) / (max - min)) * (height - pad * 2));
  svg.append(svgEl('path', { class: 'c-line', d: values.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ') }));
  svg.append(svgEl('circle', { class: 'c-dot', cx: x(values.length - 1), cy: y(values[values.length - 1]), r: 3 }));
  return svg;
}
