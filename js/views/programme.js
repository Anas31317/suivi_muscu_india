/**
 * Programme : liste des séances (ordre, création, suppression).
 * Le contenu d'une séance se modifie dans « Modifier la séance » (session-editor.js).
 * Aucune action ici ne touche aux séances déjà enregistrées.
 */

import * as store from '../store.js';
import { h, toast, icon, ICONS } from '../ui.js';
import { sessionNumber, plural, miniBtn, pageHead } from './common.js';

export function viewProgramme() {
  const state = store.getState();

  const row = (sess, i) =>
    h('div', { class: 'card prog-row-card' },
      h('span', { class: 'session-num' }, String(sessionNumber(sess.id))),
      h('div', { class: 'body' },
        h('div', { class: 'name' }, sess.name),
        h('div', { class: 'meta' },
          sess.exercises.length ? sess.exercises.map((e) => e.name).join(' · ') : 'aucun exercice')
      ),
      h('div', { class: 'mini' },
        miniBtn(ICONS.up, 'Monter la séance', () => { if (i > 0) store.moveSession(sess.id, -1); }),
        miniBtn(ICONS.down, 'Descendre la séance', () => { if (i < state.sessions.length - 1) store.moveSession(sess.id, 1); }),
        miniBtn(ICONS.close, 'Retirer la séance du programme', () => {
          if (!confirm(`Retirer « ${sess.name} » du programme ?\n\nLes séances déjà enregistrées restent dans ton historique.`)) return;
          store.deleteSession(sess.id);
          toast('Séance retirée du programme');
        })
      ),
      h('a', { class: 'btn small', href: `#/seance/${sess.id}/modifier` }, icon(ICONS.edit, 14), 'Modifier')
    );

  const newName = h('input', { type: 'text', placeholder: 'Nom de la nouvelle séance (ex : Full body)', maxlength: 60, 'aria-label': 'Nom de la nouvelle séance' });
  const create = () => {
    const name = newName.value.trim();
    if (!name) { newName.focus(); return; }
    const id = store.addSession(name);
    location.hash = `#/seance/${id}/modifier`;
  };
  newName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } });

  return h('div', { class: 'page' },
    pageHead('Programme', {
      back: { href: '#/seances', label: 'Séances' },
      sub: `${plural(state.sessions.length, 'séance', 'séances')} · l’historique n’est jamais modifié.`
    }),
    h('div', { class: 'stack' },
      state.sessions.map(row),
      h('section', { class: 'card section' },
        h('h2', {}, 'Nouvelle séance'),
        h('div', { class: 'inline' },
          newName,
          h('button', { class: 'btn primary', type: 'button', onclick: create }, icon(ICONS.plus, 14), 'Créer')
        )
      )
    )
  );
}
