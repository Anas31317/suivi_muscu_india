/**
 * Graphe de progression : courbe SVG écrite à la main.
 *
 * Pas de librairie : le rendu est fait à la taille réelle du conteneur
 * (ResizeObserver), donc le texte reste net et le site fonctionne hors ligne.
 * Une seule série par graphe, un seul axe Y — jamais deux échelles.
 */

import { fmtNum, formatDate, formatDateShort } from './store.js';

// top laisse la place à l'étiquette du dernier point quand il touche le haut
const PAD = { top: 28, right: 18, bottom: 30, left: 46 };
const HEIGHT = 250;

/* ------------------------------------------------------------- échelles */

function niceTicks(min, max, target = 4) {
  if (min === max) {
    const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.1 : 1;
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 1000; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

function svgEl(name, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
  return el;
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

/* ----------------------------------------------------------------- rendu */

/**
 * @param {HTMLElement} host      conteneur (vidé à chaque rendu)
 * @param {Array} points          [{ iso, x: Date, y: number, sets }]
 * @param {object} opts           { unit, label, mode }
 */
export function renderLineChart(host, points, opts = {}) {
  const unit = opts.unit || '';
  const mode = opts.mode || 'kg';

  host.textContent = '';
  host.classList.add('chart');

  if (!points.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Aucune donnée pour cette métrique.';
    host.append(p);
    return;
  }

  const width = Math.max(280, Math.round(host.clientWidth || host.offsetWidth || 320));
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  const ys = points.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const yScale = (v) => PAD.top + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const t0 = points[0].x.getTime();
  const t1 = points[points.length - 1].x.getTime();
  const xScale = (d) =>
    points.length === 1 ? PAD.left + innerW / 2 : PAD.left + ((d.getTime() - t0) / (t1 - t0 || 1)) * innerW;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${HEIGHT}`,
    width,
    height: HEIGHT,
    role: 'img',
    'aria-label': `${opts.label || 'Progression'} : ${points.length} séance(s), de ${formatDate(points[0].iso)} à ${formatDate(points[points.length - 1].iso)}`
  });

  /* --- grille + axe Y ------------------------------------------------ */
  for (const t of ticks) {
    const y = yScale(t);
    svg.append(
      svgEl('line', {
        x1: PAD.left, x2: width - PAD.right, y1: y, y2: y,
        stroke: 'var(--grid)', 'stroke-width': 1, 'shape-rendering': 'crispEdges'
      })
    );
    const lab = svgEl('text', {
      x: PAD.left - 8, y: y + 4, 'text-anchor': 'end',
      fill: 'var(--ink-muted)', 'font-size': 11, 'font-variant-numeric': 'tabular-nums'
    });
    lab.textContent = fmtNum(t, 1);
    svg.append(lab);
  }

  /* --- axe X : on étiquette au plus 5 dates ------------------------- */
  const maxLabels = Math.max(2, Math.min(5, Math.floor(innerW / 64)));
  const step = Math.max(1, Math.ceil(points.length / maxLabels));
  points.forEach((p, i) => {
    const isLast = i === points.length - 1;
    if (i % step !== 0 && !isLast) return;
    const x = xScale(p.x);
    const lab = svgEl('text', {
      x, y: HEIGHT - 9, 'text-anchor': i === 0 && points.length > 1 ? 'start' : isLast && points.length > 1 ? 'end' : 'middle',
      fill: 'var(--ink-muted)', 'font-size': 11, 'font-variant-numeric': 'tabular-nums'
    });
    lab.textContent = formatDateShort(p.iso);
    svg.append(lab);
  });

  /* --- ligne de base ------------------------------------------------- */
  svg.append(
    svgEl('line', {
      x1: PAD.left, x2: width - PAD.right, y1: PAD.top + innerH, y2: PAD.top + innerH,
      stroke: 'var(--axis)', 'stroke-width': 1, 'shape-rendering': 'crispEdges'
    })
  );

  /* --- aire + courbe ------------------------------------------------- */
  const coords = points.map((p) => [xScale(p.x), yScale(p.y)]);

  if (coords.length > 1) {
    const areaD =
      `M ${coords[0][0]} ${PAD.top + innerH} ` +
      coords.map(([x, y]) => `L ${x} ${y}`).join(' ') +
      ` L ${coords[coords.length - 1][0]} ${PAD.top + innerH} Z`;
    svg.append(svgEl('path', { d: areaD, fill: 'var(--accent)', 'fill-opacity': 0.07, stroke: 'none' }));

    svg.append(
      svgEl('path', {
        d: coords.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' '),
        fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      })
    );
  }

  /* --- crosshair (masqué au repos) ----------------------------------- */
  const cross = svgEl('line', {
    y1: PAD.top, y2: PAD.top + innerH,
    stroke: 'var(--axis)', 'stroke-width': 1, opacity: 0, 'shape-rendering': 'crispEdges'
  });
  svg.append(cross);

  /* --- points -------------------------------------------------------- */
  const dots = coords.map(([x, y]) =>
    svgEl('circle', { cx: x, cy: y, r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2 })
  );
  dots.forEach((d) => svg.append(d));

  /* --- étiquette directe sur le dernier point ------------------------ */
  const last = points[points.length - 1];
  const [lx, ly] = coords[coords.length - 1];
  const endLabel = svgEl('text', {
    x: Math.min(lx + 8, width - PAD.right),
    y: ly - 10,
    'text-anchor': lx > width - PAD.right - 42 ? 'end' : 'start',
    fill: 'var(--ink)', 'font-size': 12, 'font-weight': 600, 'font-variant-numeric': 'tabular-nums'
  });
  endLabel.textContent = fmtNum(last.y, 1) + (unit ? ' ' + unit : '');
  svg.append(endLabel);

  /* --- couche de survol ---------------------------------------------- */
  const hit = svgEl('rect', {
    class: 'hit', x: PAD.left - 10, y: PAD.top, width: innerW + 20, height: innerH,
    fill: 'transparent'
  });
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
    cross.setAttribute('opacity', 1);
    dots.forEach((d, k) => d.setAttribute('r', k === i ? 6 : 4));

    // textContent uniquement : aucune donnée n'est interprétée comme du HTML
    tip.textContent = '';
    for (const [cls, text] of [
      ['d', formatDate(p.iso)],
      ['v', fmtNum(p.y, 1) + (unit ? ' ' + unit : '')],
      ['s', setsLabel(p.sets, mode)]
    ]) {
      const line = document.createElement('div');
      line.className = cls;
      line.textContent = text;
      tip.append(line);
    }
    tip.classList.add('on');

    const scale = host.clientWidth / width || 1;
    const px = Math.max(70, Math.min(host.clientWidth - 70, x * scale));
    tip.style.left = px + 'px';
    tip.style.top = Math.max(34, y * scale - 12) + 'px';
  };

  const hide = () => {
    active = -1;
    cross.setAttribute('opacity', 0);
    dots.forEach((d) => d.setAttribute('r', 4));
    tip.classList.remove('on');
  };

  const nearest = (evt) => {
    const rect = svg.getBoundingClientRect();
    const xIn = ((evt.clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestD = Infinity;
    coords.forEach(([x], i) => {
      const d = Math.abs(x - xIn);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };

  hit.addEventListener('pointermove', (e) => show(nearest(e)));
  hit.addEventListener('pointerdown', (e) => show(nearest(e)));
  hit.addEventListener('pointerleave', hide);
  svg.addEventListener('pointerleave', hide);
}

/**
 * Rend le graphe et le redessine quand la largeur change.
 * Renvoie une fonction de nettoyage.
 */
export function mountChart(host, points, opts) {
  let frame = 0;
  const draw = () => renderLineChart(host, points, opts);

  // 1er rendu après layout, pour lire la vraie largeur du conteneur
  requestAnimationFrame(draw);

  let lastW = 0;
  const ro = new ResizeObserver((entries) => {
    const w = Math.round(entries[0].contentRect.width);
    if (w === lastW || w === 0) return;
    lastW = w;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  });
  ro.observe(host);
  return () => { ro.disconnect(); cancelAnimationFrame(frame); };
}
