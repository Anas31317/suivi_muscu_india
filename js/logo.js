/**
 * Logo : une haltère blanche sur un carré bleu arrondi, et le nom du site.
 * Mêmes proportions que icons/icon.svg (repère 32 × 32).
 */

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Le symbole seul. */
export function logoMark(size = 28) {
  const svg = el('svg', { viewBox: '0 0 32 32', width: size, height: size, 'aria-hidden': 'true', class: 'logo-mark' });
  svg.append(el('rect', { class: 'logo-bg', x: 0, y: 0, width: 32, height: 32, rx: 8 }));
  for (const [x, y, w, hgt] of [
    [6, 10, 3, 12], [9.75, 12, 2.5, 8],    // disques gauche
    [19.75, 12, 2.5, 8], [23, 10, 3, 12]   // disques droite
  ]) {
    svg.append(el('rect', { class: 'logo-fg', x, y, width: w, height: hgt, rx: 1.2 }));
  }
  svg.append(el('rect', { class: 'logo-fg', x: 12.25, y: 15, width: 7.5, height: 2, rx: 1 }));
  return svg;
}

/** Symbole + nom, pour l'en-tête et la page de connexion. */
export function logo({ size = 28, large = false } = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'logo' + (large ? ' logo-large' : '');
  const text = document.createElement('span');
  text.className = 'logo-text';
  const name = document.createElement('span');
  name.className = 'logo-name';
  name.textContent = 'Suivi Muscu';
  const tag = document.createElement('span');
  tag.className = 'logo-tag';
  tag.textContent = 'India';
  text.append(name, tag);
  wrap.append(logoMark(size), text);
  return wrap;
}
