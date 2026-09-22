/**
 * Modifier la séance : nom, exercices, type, nombre de séries, ordre.
 *
 * Les changements sont faits sur un brouillon et appliqués uniquement avec
 * « Enregistrer ». Ils ne touchent jamais aux séances déjà enregistrées :
 * l'historique garde les noms et séries d'origine.
 *
 * Route : #/seance/:id/modifier
 */

import * as store from '../store.js';
import { h, toast, icon, ICONS } from '../ui.js';
import { sessionNumber, miniBtn, pageHead, emptyState } from './common.js';

const SET_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 10];

export function viewSessionEditor(sessionId, ctx) {
  const sess = store.getSession(sessionId);
  if (!sess) return emptyState('Séance introuvable', null, h('a', { class: 'btn', href: '#/seances' }, 'Séances'));

  const original = JSON.stringify({ name: sess.name, exercises: sess.exercises });
  const draft = JSON.parse(original);
  let saved = false;
  const isDirty = () => !saved && JSON.stringify(draft) !== original;

  const backHref = `#/seance/${sessionId}`;

  /* --- enregistrer / annuler ----------------------------------------- */
  const doSave = () => {
    const name = draft.name.trim();
    if (!name) { toast('Donne un nom à la séance.'); return false; }
    const empty = draft.exercises.find((e) => !e.name.trim());
    if (empty) { toast('Chaque exercice doit avoir un nom.'); return false; }
    store.saveSessionProgram(sessionId, {
      name,
      exercises: draft.exercises.map((e) => ({ ...e, name: e.name.trim() }))
    });
    saved = true;
    return true;
  };

  const save = () => {
    if (!isDirty()) { location.hash = backHref; return; }
    if (doSave()) {
      toast('Séance modifiée');
      location.hash = backHref;
    }
  };

  const cancel = () => {
    if (isDirty() && !confirm('Abandonner les modifications ?')) return;
    saved = true; // rien à proposer en quittant
    location.hash = backHref;
  };

  // Quitter la page (onglet, retour) avec des changements : on propose d'enregistrer.
  ctx.onCleanup(() => {
    if (isDirty() && confirm('Enregistrer les modifications de la séance avant de quitter ?')) {
      doSave();
      toast('Séance modifiée');
    }
  });

  /* --- liste des exercices ------------------------------------------- */
  const list = h('div', { class: 'edit-list' });

  const draw = () => {
    list.textContent = '';
    if (!draft.exercises.length) {
      list.append(h('p', { class: 'muted edit-empty' }, 'Aucun exercice. Ajoute le premier ci-dessous.'));
    }
    draft.exercises.forEach((ex, i) => {
      const name = h('input', {
        type: 'text', value: ex.name, maxlength: 80, 'aria-label': `Nom de l’exercice ${i + 1}`,
        oninput: () => { ex.name = name.value; }
      });
      const mode = h('select', { 'aria-label': 'Type', onchange: () => { ex.mode = mode.value; } },
        h('option', { value: 'kg', selected: ex.mode === 'kg' }, 'Charge'),
        h('option', { value: 'bw', selected: ex.mode === 'bw' }, 'Poids du corps'));
      const sets = h('select', { 'aria-label': 'Nombre de séries', onchange: () => { ex.defaultSets = Number(sets.value); } },
        ...[...new Set([...SET_CHOICES, ex.defaultSets])].sort((a, b) => a - b)
          .map((n) => h('option', { value: n, selected: n === ex.defaultSets }, `${n} série${n > 1 ? 's' : ''}`)));

      list.append(h('div', { class: 'edit-row' },
        h('span', { class: 'ex-num' }, String(i + 1)),
        h('div', { class: 'edit-fields' },
          name,
          h('div', { class: 'edit-opts' }, mode, sets)
        ),
        h('div', { class: 'mini' },
          miniBtn(ICONS.up, 'Monter', () => {
            if (i === 0) return;
            [draft.exercises[i - 1], draft.exercises[i]] = [draft.exercises[i], draft.exercises[i - 1]];
            draw();
          }),
          miniBtn(ICONS.down, 'Descendre', () => {
            if (i === draft.exercises.length - 1) return;
            [draft.exercises[i + 1], draft.exercises[i]] = [draft.exercises[i], draft.exercises[i + 1]];
            draw();
          }),
          miniBtn(ICONS.close, 'Retirer de la séance', () => {
            if (!confirm(`Retirer « ${ex.name || 'cet exercice'} » de la séance ? Son historique est conservé.`)) return;
            draft.exercises.splice(i, 1);
            draw();
          })
        )
      ));
    });
  };
  draw();

  /* --- ajout --------------------------------------------------------- */
  const newName = h('input', { type: 'text', placeholder: 'Nom du nouvel exercice', maxlength: 80, 'aria-label': 'Nom du nouvel exercice' });
  const newMode = h('select', { 'aria-label': 'Type' }, h('option', { value: 'kg' }, 'Charge'), h('option', { value: 'bw' }, 'Poids du corps'));
  const newSets = h('select', { 'aria-label': 'Nombre de séries' },
    ...SET_CHOICES.map((n) => h('option', { value: n, selected: n === 3 }, `${n} série${n > 1 ? 's' : ''}`)));
  const add = () => {
    const value = newName.value.trim();
    if (!value) { newName.focus(); return; }
    draft.exercises.push({ id: store.uid('e'), name: value, mode: newMode.value, defaultSets: Number(newSets.value) });
    newName.value = '';
    draw();
    newName.focus();
  };
  newName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

  const nameInput = h('input', {
    type: 'text', value: draft.name, maxlength: 60, 'aria-label': 'Nom de la séance',
    oninput: () => { draft.name = nameInput.value; }
  });

  return h('div', { class: 'page page-form' },
    pageHead('Modifier la séance', {
      back: { href: backHref, label: 'Retour à la séance' },
      sub: `Séance ${sessionNumber(sessionId)} · les séances déjà enregistrées ne changent pas.`
    }),
    h('div', { class: 'stack' },
      h('section', { class: 'card section' },
        h('label', { class: 'field-label' }, 'Nom de la séance'),
        nameInput
      ),
      h('section', { class: 'card section' },
        h('h2', {}, 'Exercices'),
        h('p', { class: 'desc' }, 'Ordre, type et nombre de séries tels qu’ils apparaîtront pendant la séance.'),
        list,
        h('div', { class: 'edit-add' },
          newName,
          h('div', { class: 'edit-opts' }, newMode, newSets,
            h('button', { class: 'btn primary small', type: 'button', onclick: add }, icon(ICONS.plus, 14), 'Ajouter'))
        )
      )
    ),
    h('div', { class: 'form-actions' },
      h('button', { class: 'btn ghost', type: 'button', onclick: cancel }, 'Annuler'),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, icon('M5 12.5l4.5 4.5L19 7.5', 15), 'Enregistrer')
    )
  );
}
