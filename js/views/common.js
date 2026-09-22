/** Briques partagées par les pages. */

import * as store from '../store.js';
import { fmtNum, formatDate } from '../store.js';
import { h, icon, ICONS, toast } from '../ui.js';

/** "75 kg × 8, 9, 9" ou, si les charges diffèrent, "75×8 · 70×9". */
export function summarizeSets(sets, mode) {
  const valid = sets.filter((s) => s.reps !== null || s.weight !== null);
  if (!valid.length) return '—';
  const weights = [...new Set(valid.map((s) => s.weight))];
  const reps = valid.map((s) => (s.reps === null ? '?' : s.reps)).join(', ');
  if (weights.length === 1) {
    const w = weights[0];
    if (w === null) return reps + ' reps';
    if (mode === 'bw' && w === 0) return reps + ' reps (poids du corps)';
    return `${fmtNum(w)} kg × ${reps}`;
  }
  return valid
    .map((s) => `${s.weight === null ? '—' : fmtNum(s.weight)}×${s.reps === null ? '?' : s.reps}`)
    .join(' · ');
}

/** Numéro de la séance dans le programme (1, 2…), ou null. */
export function sessionNumber(sessionId) {
  const i = store.getState().sessions.findIndex((s) => s.id === sessionId);
  return i >= 0 ? i + 1 : null;
}

/** « Séance 2 · Dos + Triceps » */
export function sessionTitle(sess) {
  const n = sessionNumber(sess.id);
  return n ? `Séance ${n} · ${sess.name}` : sess.name;
}

export function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`;
}

/** « mardi 22 septembre » */
export function longDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return formatDate(iso);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** « Septembre 2026 » */
export function monthLabel(iso) {
  const d = new Date(iso.slice(0, 7) + '-15T12:00:00');
  const s = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function miniBtn(pathD, label, onClick) {
  return h('button', { class: 'btn ghost small icon-only', type: 'button', title: label, 'aria-label': label, onclick: onClick },
    icon(pathD, 15));
}

/** En-tête de page : lien retour optionnel, titre, sous-titre, actions. */
export function pageHead(title, { back, sub, actions } = {}) {
  return h('div', { class: 'page-top' },
    back ? h('a', { class: 'back', href: back.href }, icon(ICONS.back, 14), back.label) : null,
    h('div', { class: 'page-head' },
      h('div', { class: 'page-title' },
        h('h1', {}, title),
        sub ? h('p', { class: 'sub' }, sub) : null
      ),
      actions ? h('div', { class: 'page-actions' }, actions) : null
    )
  );
}

export function emptyState(title, text, action) {
  return h('div', { class: 'card empty-state' },
    h('p', { class: 'empty-title' }, title),
    text ? h('p', { class: 'empty-text' }, text) : null,
    action || null
  );
}

/**
 * Carte d'une séance enregistrée, dépliable : détail des exercices,
 * boutons Modifier / Supprimer.
 */
export function logCard(log, { showSession = true } = {}) {
  const sess = store.getSession(log.sessionId);
  const title = showSession ? (sess ? sessionTitle(sess) : 'Séance supprimée du programme') : longDate(log.date);
  const meta = showSession ? longDate(log.date) : plural(log.entries.length, 'exercice', 'exercices');

  return h('details', { class: 'card log-item' },
    h('summary', {},
      h('div', { class: 'log-main' },
        h('span', { class: 'log-title' }, title),
        h('span', { class: 'log-meta' }, meta)
      ),
      h('span', { class: 'log-count' }, showSession ? plural(log.entries.length, 'exo', 'exos') : ''),
      h('span', { class: 'chev' }, icon(ICONS.chevron, 16))
    ),
    h('div', { class: 'log-body' },
      h('div', { class: 'table-wrap' },
        h('table', {},
          h('tbody', {},
            log.entries.map((en) =>
              h('tr', {},
                h('td', { class: 'wrap strong' }, en.name),
                h('td', { class: 'num' }, summarizeSets(en.sets, en.mode)),
                h('td', { class: 'note' }, en.note || '')
              )
            )
          )
        )
      ),
      log.note ? h('p', { class: 'log-note' }, log.note) : null,
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn small', href: `#/log/${log.id}` }, icon(ICONS.edit, 14), 'Modifier'),
        h('button', {
          class: 'btn small danger', type: 'button',
          onclick: () => {
            if (!confirm(`Supprimer la séance du ${formatDate(log.date)} ? Elle disparaîtra de ton historique.`)) return;
            store.deleteLog(log.id);
            toast('Séance supprimée');
          }
        }, 'Supprimer')
      )
    )
  );
}
