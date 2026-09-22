/**
 * Séance en cours : tous les exercices, séries et reps sur une seule page.
 *
 * - Les exercices et le nombre de séries viennent du programme de la séance ;
 *   ils ne se modifient que depuis « Modifier la séance » (session-editor.js).
 *   Ici on ne saisit que les charges, les reps et les notes.
 * - Chaque série affiche ce qui a été fait la séance précédente sur le même
 *   exercice ; un tap sur cette valeur la recopie.
 * - Enregistrement automatique à chaque saisie, et bouton « Enregistrer ».
 * - Rouvrir la même séance le même jour reprend la saisie en cours.
 *
 * Routes : #/seance/:id (séance du jour) et #/log/:logId (séance passée).
 */

import * as store from '../store.js';
import { fmtNum, formatDate } from '../store.js';
import * as sync from '../sync.js';
import { h, numInput, parseNum, toast, icon, ICONS } from '../ui.js';
import { summarizeSets, sessionNumber, plural, pageHead, emptyState, longDate } from './common.js';

const SAVE_DELAY = 500;

const clone = (o) => JSON.parse(JSON.stringify(o));
const numText = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

/** Perf précédente d'un exercice : avant (ou le jour de) la séance, hors séance elle-même. */
function previousEntry(exerciseId, log) {
  const before = store.historyForExercise(exerciseId, log.id).filter((e) => e.date <= log.date);
  return before.length ? before[before.length - 1] : null;
}

/** « 75 × 8 », « 8 » au poids du corps sans lest. */
function setLabel(set, mode) {
  if (!set) return '—';
  const reps = set.reps === null ? '?' : set.reps;
  if (set.weight === null || (mode === 'bw' && set.weight === 0)) return String(reps);
  return `${fmtNum(set.weight)} × ${reps}`;
}

function isDone(entry) {
  return entry.sets.length > 0 && entry.sets.every((s) => s.reps !== null);
}

/** Séries vides du programme, charge reprise de la dernière fois. */
function plannedSets(count, prev, from = 0, fallbackWeight = null) {
  const sets = [];
  for (let i = from; i < count; i++) {
    sets.push({ weight: prev && prev.sets[i] ? prev.sets[i].weight : fallbackWeight, reps: null });
  }
  return sets;
}

/**
 * Brouillon de la séance : exercices et nombre de séries du programme.
 * Une séance déjà enregistrée garde ses séries (jamais tronquées) ; les séries
 * prévues pas encore faites sont ajoutées vides.
 */
function buildDraft(sess, source) {
  const draft = source
    ? clone(source)
    : { id: store.uid('log'), sessionId: sess.id, date: store.todayISO(), note: '', entries: [] };
  if (!sess) return draft;

  const byId = new Map(draft.entries.map((e) => [e.exerciseId, e]));
  const ordered = [];
  for (const ex of sess.exercises) {
    const prev = previousEntry(ex.id, draft);
    const entry = byId.get(ex.id);
    if (entry) {
      byId.delete(ex.id); // nom et type gardés tels qu'enregistrés ce jour-là
      const last = entry.sets[entry.sets.length - 1];
      entry.sets.push(...plannedSets(ex.defaultSets, prev, entry.sets.length, last ? last.weight : null));
      ordered.push(entry);
    } else {
      ordered.push({ exerciseId: ex.id, name: ex.name, mode: ex.mode, note: '', sets: plannedSets(ex.defaultSets, prev) });
    }
  }
  // exercices retirés du programme depuis, mais déjà saisis : on les garde
  draft.entries = [...ordered, ...byId.values()];
  return draft;
}

/**
 * Ce qui est réellement enregistré : les séries faites (reps renseignées) ;
 * une charge préremplie sur une série pas encore faite ne compte pas.
 */
function cleanLog(draft) {
  return {
    id: draft.id,
    sessionId: draft.sessionId,
    date: draft.date,
    note: draft.note || '',
    entries: draft.entries
      .map((en) => ({
        exerciseId: en.exerciseId, name: en.name, mode: en.mode, note: en.note || '',
        sets: en.sets.filter((s) => s.reps !== null)
      }))
      .filter((en) => en.sets.length || en.note)
  };
}

export function viewWorkout({ sessionId, logId }, ctx) {
  const existing = logId ? store.getLog(logId) : null;
  if (logId && !existing) {
    return emptyState('Séance introuvable', null, h('a', { class: 'btn', href: '#/historique' }, 'Historique'));
  }
  const sid = existing ? existing.sessionId : sessionId;
  const sess = store.getSession(sid);
  if (!sess && !existing) {
    return emptyState('Séance introuvable', null, h('a', { class: 'btn', href: '#/seances' }, 'Séances'));
  }

  // Séance du jour déjà commencée ? On la reprend.
  const today = !existing ? store.logForSessionOn(sid, store.todayISO()) : null;
  const source = existing || today;
  const draft = buildDraft(sess, source);
  const pastMode = Boolean(existing) && existing.date !== store.todayISO();

  /* --- enregistrement automatique ----------------------------------- */
  const status = h('span', { class: 'save-status', role: 'status' });
  let timer = 0;
  let pending = false;
  const setStatus = (text, cls = '') => { status.textContent = text; status.className = 'save-status ' + cls; };

  const saveNow = () => {
    clearTimeout(timer);
    if (!pending) return;
    pending = false;
    const clean = cleanLog(draft);
    if (clean.entries.length) {
      store.saveLog(clean);
      setStatus('Enregistré', 'ok');
    } else if (store.getLog(draft.id)) {
      store.deleteLog(draft.id);
      setStatus('Rien de saisi', '');
    }
  };
  const changed = () => {
    pending = true;
    setStatus('Enregistrement…', 'busy');
    clearTimeout(timer);
    timer = setTimeout(saveNow, SAVE_DELAY);
  };

  // En quittant la page ou en verrouillant le téléphone : on enregistre tout de suite.
  const onHide = () => {
    if (document.visibilityState === 'hidden') { saveNow(); sync.flush(); }
  };
  document.addEventListener('visibilitychange', onHide);
  ctx.onCleanup(() => { saveNow(); document.removeEventListener('visibilitychange', onHide); });

  setStatus(source ? 'Enregistré' : 'Enregistrement automatique', source ? 'ok' : '');

  /* --- exercices ----------------------------------------------------- */
  const doneCount = h('span', {});
  const updateProgress = () => {
    doneCount.textContent = `${draft.entries.filter(isDone).length}/${draft.entries.length} exercices faits`;
  };

  const exerciseCard = (entry, entryIndex) => {
    const isBW = entry.mode === 'bw';
    const prev = previousEntry(entry.exerciseId, draft);
    const card = h('section', { class: 'card ex-card' });
    const refreshDone = () => { card.classList.toggle('is-done', isDone(entry)); updateProgress(); };

    const rows = h('div', { class: 'sets' },
      h('div', { class: 'set-row set-head-row' },
        h('span', { class: 'set-head' }, '#'),
        h('span', { class: 'set-head' }, 'Dernière fois'),
        h('span', { class: 'set-head' }, isBW ? 'Lest kg' : 'Charge kg'),
        h('span', { class: 'set-head' }, 'Reps')
      )
    );

    entry.sets.forEach((set, i) => {
      const before = prev && prev.sets[i];
      const w = numInput({
        value: numText(set.weight),
        placeholder: before && before.weight !== null ? numText(before.weight) : isBW ? '0' : '',
        'aria-label': `${entry.name}, série ${i + 1}, charge en kg`,
        oninput: () => { set.weight = parseNum(w.value); changed(); }
      });
      const r = numInput({
        value: numText(set.reps),
        placeholder: before && before.reps !== null ? String(before.reps) : '',
        inputmode: 'numeric',
        'aria-label': `${entry.name}, série ${i + 1}, répétitions`,
        oninput: () => { set.reps = parseNum(r.value); refreshDone(); changed(); }
      });
      const prevCell = before
        ? h('button', {
            class: 'prev-cell', type: 'button',
            title: 'Recopier les valeurs de la dernière fois',
            'aria-label': `Recopier la dernière fois : ${setLabel(before, entry.mode)}`,
            onclick: () => {
              set.weight = before.weight;
              set.reps = before.reps;
              w.value = numText(set.weight);
              r.value = numText(set.reps);
              refreshDone();
              changed();
            }
          }, setLabel(before, entry.mode))
        : h('span', { class: 'prev-cell empty' }, '—');

      rows.append(h('div', { class: 'set-row' }, h('span', { class: 'idx' }, String(i + 1)), prevCell, w, r));
    });

    const note = h('input', {
      type: 'text', value: entry.note || '', class: 'entry-note', maxlength: 200,
      placeholder: isBW ? 'Note (ex : + élastique rose, chaîne 10 kg)' : 'Note',
      'aria-label': `${entry.name}, note`,
      oninput: () => { entry.note = note.value; changed(); }
    });

    card.append(
      h('div', { class: 'ex-head' },
        h('span', { class: 'ex-num' }, String(entryIndex + 1)),
        h('div', { class: 'ex-title' },
          h('h2', {}, entry.name, isBW ? h('span', { class: 'tag' }, 'PdC') : null),
          h('p', { class: 'ex-prev' },
            prev ? `Dernière fois (${formatDate(prev.date)}) : ${summarizeSets(prev.sets, entry.mode)}` : 'Première fois sur cet exercice')
        ),
        h('span', { class: 'done-mark', title: 'Exercice fait' }, icon('M5 12.5l4.5 4.5L19 7.5', 14)),
        h('a', {
          class: 'btn ghost small icon-only', href: `#/progression/${encodeURIComponent(entry.exerciseId)}`,
          title: 'Voir la progression', 'aria-label': `Progression de ${entry.name}`
        }, icon(ICONS.chart, 16))
      ),
      rows,
      h('div', { class: 'ex-foot' }, note)
    );
    refreshDone();
    return card;
  };

  const list = h('div', { class: 'stack' },
    draft.entries.length
      ? draft.entries.map(exerciseCard)
      : emptyState('Aucun exercice dans cette séance', 'Ajoute des exercices depuis « Modifier la séance ».',
          sess ? h('a', { class: 'btn primary', href: `#/seance/${sid}/modifier` }, icon(ICONS.edit, 14), 'Modifier la séance') : null)
  );
  updateProgress();

  /* --- date, note ---------------------------------------------------- */
  const dateInput = h('input', {
    type: 'date', value: draft.date, max: store.todayISO(), 'aria-label': 'Date de la séance',
    onchange: () => { draft.date = dateInput.value || store.todayISO(); changed(); }
  });
  const sessionNote = h('textarea', {
    placeholder: 'Forme du jour, ressenti…', maxlength: 1000, 'aria-label': 'Note de séance',
    oninput: () => { draft.note = sessionNote.value; changed(); }
  });
  sessionNote.value = draft.note || '';

  /* --- actions ------------------------------------------------------- */
  // N'écrit que s'il y a eu une modification : une séance ouverte puis
  // enregistrée sans changement reste strictement identique.
  const save = () => {
    saveNow();
    sync.flush();
    if (!store.getLog(draft.id)) {
      toast('Rien à enregistrer : saisis au moins une série.');
      return;
    }
    toast('Séance enregistrée');
    location.hash = existing ? '#/historique' : '#/';
  };

  const remove = () => {
    if (!confirm(`Supprimer la séance du ${formatDate(draft.date)} ? Elle disparaîtra de ton historique.`)) return;
    clearTimeout(timer);
    pending = false;
    if (store.getLog(draft.id)) store.deleteLog(draft.id);
    toast('Séance supprimée');
    location.hash = existing ? '#/historique' : '#/seances';
  };

  const n = sess ? sessionNumber(sess.id) : null;
  const others = sess ? store.logsForSession(sid).filter((l) => l.id !== draft.id).length : 0;

  return h('div', { class: 'page page-form' },
    pageHead(sess ? sess.name : 'Séance', {
      back: existing ? { href: '#/historique', label: 'Historique' } : { href: '#/seances', label: 'Séances' },
      sub: h('span', { class: 'workout-sub' },
        n ? `Séance ${n} · ` : '',
        pastMode ? longDate(draft.date) : 'Aujourd’hui',
        ' · ', doneCount),
      actions: h('div', { class: 'workout-actions' },
        status,
        h('div', { class: 'date-field' }, dateInput),
        sess ? h('a', { class: 'btn', href: `#/seance/${sid}/modifier` }, icon(ICONS.edit, 14), 'Modifier la séance') : null
      )
    }),
    h('div', { class: 'stack' },
      list,
      h('div', { class: 'card section' }, h('h2', {}, 'Note de séance'), sessionNote),
      others
        ? h('a', { class: 'link centered', href: `#/historique?seance=${encodeURIComponent(sid)}` },
            `Voir les ${plural(others, 'séance précédente', 'séances précédentes')}`)
        : null
    ),
    h('div', { class: 'form-actions' },
      source ? h('button', { class: 'btn ghost danger', type: 'button', onclick: remove }, 'Supprimer') : null,
      h('button', { class: 'btn primary', type: 'button', onclick: save }, icon('M5 12.5l4.5 4.5L19 7.5', 15), 'Enregistrer la séance')
    )
  );
}
