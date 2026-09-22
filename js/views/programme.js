/** Programme : séances et exercices (renommer, réordonner, ajouter, supprimer). */

import * as store from '../store.js';
import { h, toast, icon, ICONS } from '../ui.js';
import { sessionNumber, plural, miniBtn, pageHead, newExerciseForm } from './common.js';

// Séances dépliées : conservées d'un rafraîchissement à l'autre.
const openSessions = new Set();

export function viewProgramme() {
  const state = store.getState();

  const sessionBlock = (sess) =>
    h('details', {
      class: 'card prog-session',
      open: openSessions.has(sess.id),
      ontoggle: (e) => { if (e.target.open) openSessions.add(sess.id); else openSessions.delete(sess.id); }
    },
      h('summary', {},
        h('span', { class: 'session-num' }, String(sessionNumber(sess.id))),
        h('div', { class: 'body' },
          h('div', { class: 'name' }, sess.name),
          h('div', { class: 'meta' }, plural(sess.exercises.length, 'exercice', 'exercices'))
        ),
        h('span', { class: 'chev' }, icon(ICONS.chevron, 16))
      ),
      h('div', { class: 'prog-body' },
        h('div', { class: 'manage-row' },
          h('input', {
            type: 'text', value: sess.name, maxlength: 60, 'aria-label': 'Nom de la séance',
            onchange: (e) => store.renameSession(sess.id, e.target.value.trim() || sess.name)
          }),
          h('div', { class: 'mini' },
            miniBtn(ICONS.up, 'Monter la séance', () => store.moveSession(sess.id, -1)),
            miniBtn(ICONS.down, 'Descendre la séance', () => store.moveSession(sess.id, 1)),
            miniBtn(ICONS.close, 'Supprimer la séance', () => {
              if (!confirm(`Supprimer « ${sess.name} » et tout son historique ? C’est irréversible.`)) return;
              store.deleteSession(sess.id);
              toast('Séance supprimée');
            })
          )
        ),
        h('p', { class: 'field-label' }, 'Exercices'),
        h('div', { class: 'ex-list' },
          sess.exercises.length
            ? sess.exercises.map((ex) =>
                h('div', { class: 'manage-row' },
                  h('input', {
                    type: 'text', value: ex.name, maxlength: 80, 'aria-label': 'Nom de l’exercice',
                    onchange: (e) => store.updateExercise(sess.id, ex.id, { name: e.target.value.trim() || ex.name })
                  }),
                  h('select', {
                    'aria-label': 'Type d’exercice',
                    onchange: (e) => store.updateExercise(sess.id, ex.id, { mode: e.target.value })
                  },
                    h('option', { value: 'kg', selected: ex.mode === 'kg' }, 'Charge'),
                    h('option', { value: 'bw', selected: ex.mode === 'bw' }, 'Poids du corps')
                  ),
                  h('div', { class: 'mini' },
                    miniBtn(ICONS.up, 'Monter l’exercice', () => store.moveExercise(sess.id, ex.id, -1)),
                    miniBtn(ICONS.down, 'Descendre l’exercice', () => store.moveExercise(sess.id, ex.id, 1)),
                    miniBtn(ICONS.close, 'Retirer l’exercice', () => {
                      if (!confirm(`Retirer « ${ex.name} » du programme ? Son historique est conservé.`)) return;
                      store.deleteExercise(sess.id, ex.id);
                      toast('Exercice retiré');
                    })
                  )
                )
              )
            : h('p', { class: 'muted' }, 'Aucun exercice.')
        ),
        newExerciseForm((def) => {
          store.addExercise(sess.id, def);
          toast(`« ${def.name} » ajouté`);
        })
      )
    );

  const newSessionName = h('input', { type: 'text', placeholder: 'Nom de la nouvelle séance (ex : Full body)', maxlength: 60 });
  const addSession = () => {
    const name = newSessionName.value.trim();
    if (!name) { newSessionName.focus(); return; }
    const id = store.addSession(name);
    openSessions.add(id);
    toast('Séance créée');
  };
  newSessionName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSession(); } });

  return h('div', { class: 'page' },
    pageHead('Programme', {
      back: { href: '#/seances', label: 'Séances' },
      sub: 'Supprimer un exercice ne touche pas aux séances déjà enregistrées.'
    }),
    h('div', { class: 'stack' },
      state.sessions.map(sessionBlock),
      h('div', { class: 'card section' },
        h('h2', {}, 'Nouvelle séance'),
        h('div', { class: 'inline' },
          newSessionName,
          h('button', { class: 'btn primary', type: 'button', onclick: addSession }, icon(ICONS.plus, 14), 'Créer')
        )
      )
    )
  );
}
