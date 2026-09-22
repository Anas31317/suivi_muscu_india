/**
 * Séance en cours : tous les exercices, séries et reps sur une seule page.
 *
 * - Chaque série affiche ce qui a été fait la séance précédente sur le même
 *   exercice ; un tap sur cette valeur la recopie.
 * - Enregistrement automatique à chaque saisie (rien à valider à la fin) :
 *   fermer l'appli en pleine séance ne perd rien.
 * - Rouvrir la même séance le même jour reprend la saisie en cours.
 *
 * Routes : #/seance/:id (séance du jour) et #/log/:logId (séance passée).
 */

import * as store from '../store.js';
import { fmtNum, formatDate } from '../store.js';
import * as sync from '../sync.js';
import { h, numInput, parseNum, toast, icon, ICONS } from '../ui.js';
import { summarizeSets, sessionNumber, plural, miniBtn, pageHead, emptyState, newExerciseForm, longDate } from './common.js';

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

/** Brouillon d'une nouvelle séance : le programme, charges de la dernière fois reprises. */
function newDraft(sess) {
  const log = { id: store.uid('log'), sessionId: sess.id, date: store.todayISO(), note: '', entries: [] };
  log.entries = sess.exercises.map((ex) => {
    const prev = previousEntry(ex.id, log);
    const count = prev ? prev.sets.length : ex.defaultSets;
    return {
      exerciseId: ex.id, name: ex.name, mode: ex.mode, note: '',
      sets: Array.from({ length: count }, (_, i) => ({
        weight: prev && prev.sets[i] ? prev.sets[i].weight : null,
        reps: null
      }))
    };
  });
  return log;
}

/**
 * Remet une séance déjà enregistrée dans l'ordre du programme, en ajoutant les
 * exercices du programme qui n'y sont pas encore (non enregistrés tant que vides).
 */
function resumeDraft(log, sess) {
  const draft = clone(log);
  if (!sess) return draft;
  const byId = new Map(draft.entries.map((e) => [e.exerciseId, e]));
  const ordered = [];
  for (const ex of sess.exercises) {
    if (byId.has(ex.id)) {
      const entry = byId.get(ex.id);
      // séries prévues mais pas encore faites : on les remet, charge reprise
      const prev = previousEntry(ex.id, draft);
      const target = Math.max(entry.sets.length, prev ? prev.sets.length : ex.defaultSets);
      for (let i = entry.sets.length; i < target; i++) {
        const last = entry.sets[entry.sets.length - 1];
        entry.sets.push({ weight: prev && prev.sets[i] ? prev.sets[i].weight : last ? last.weight : null, reps: null });
      }
      ordered.push(entry);
      byId.delete(ex.id);
    } else {
      const prev = previousEntry(ex.id, draft);
      const count = prev ? prev.sets.length : ex.defaultSets;
      ordered.push({
        exerciseId: ex.id, name: ex.name, mode: ex.mode, note: '',
        sets: Array.from({ length: count }, (_, i) => ({ weight: prev && prev.sets[i] ? prev.sets[i].weight : null, reps: null }))
      });
    }
  }
  draft.entries = [...ordered, ...byId.values()]; // exercices retirés du programme depuis
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
  const draft = source ? resumeDraft(source, sess) : newDraft(sess);
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
    const stored = store.getLog(draft.id);
    if (clean.entries.length) {
      store.saveLog(clean);
      setStatus('Enregistré', 'ok');
    } else if (stored) {
      store.deleteLog(draft.id);
      setStatus('Séance vide', '');
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

  if (source) setStatus('Enregistré', 'ok');
  else setStatus('Enregistrement automatique', '');

  /* --- exercices ----------------------------------------------------- */
  const list = h('div', { class: 'stack' });
  const doneCount = h('span', {});
  const updateProgress = () => {
    const done = draft.entries.filter(isDone).length;
    doneCount.textContent = `${done}/${draft.entries.length} exercices faits`;
  };

  const renderList = () => {
    list.textContent = '';
    if (!draft.entries.length) list.append(h('p', { class: 'muted' }, 'Aucun exercice. Ajoute-en ci-dessous.'));
    draft.entries.forEach((entry, i) => list.append(exerciseCard(entry, i)));
    updateProgress();
  };

  const exerciseCard = (entry, entryIndex) => {
    const isBW = entry.mode === 'bw';
    const prev = previousEntry(entry.exerciseId, draft);
    const card = h('section', { class: 'card ex-card' });
    const doneMark = h('span', { class: 'done-mark', title: 'Exercice fait' }, icon('M5 12.5l4.5 4.5L19 7.5', 14));
    const refreshDone = () => { card.classList.toggle('is-done', isDone(entry)); updateProgress(); };
    const rows = h('div', { class: 'sets' });

    const drawRows = () => {
      rows.textContent = '';
      rows.append(h('div', { class: 'set-row set-head-row' },
        h('span', { class: 'set-head' }, '#'),
        h('span', { class: 'set-head' }, 'Dernière fois'),
        h('span', { class: 'set-head' }, isBW ? 'Lest kg' : 'Charge kg'),
        h('span', { class: 'set-head' }, 'Reps'),
        h('span', {})
      ));
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
        const prevBtn = before
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

        rows.append(h('div', { class: 'set-row' },
          h('span', { class: 'idx' }, String(i + 1)),
          prevBtn, w, r,
          entry.sets.length > 1
            ? miniBtn(ICONS.close, `Supprimer la série ${i + 1}`, () => {
                entry.sets.splice(i, 1);
                drawRows();
                refreshDone();
                changed();
              })
            : h('span', {})
        ));
      });
    };
    drawRows();

    const note = h('input', {
      type: 'text', value: entry.note || '', class: 'entry-note', maxlength: 200,
      placeholder: isBW ? 'Note (ex : + élastique rose, chaîne 10 kg)' : 'Note',
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
        doneMark,
        miniBtn(ICONS.close, 'Retirer cet exercice de cette séance', () => {
          if (entry.sets.some((s) => s.reps !== null) && !confirm(`Retirer « ${entry.name} » de cette séance ? Ses séries seront effacées.`)) return;
          draft.entries.splice(entryIndex, 1);
          renderList();
          changed();
        })
      ),
      rows,
      h('div', { class: 'ex-foot' },
        h('button', {
          class: 'btn small ghost', type: 'button',
          onclick: () => {
            const last = entry.sets[entry.sets.length - 1];
            entry.sets.push({ weight: last ? last.weight : null, reps: null });
            drawRows();
            refreshDone();
            changed();
          }
        }, icon(ICONS.plus, 14), 'Série'),
        note
      )
    );
    refreshDone();
    return card;
  };
  renderList();

  /* --- date, note, ajout --------------------------------------------- */
  const dateInput = h('input', {
    type: 'date', value: draft.date, max: store.todayISO(), 'aria-label': 'Date de la séance',
    onchange: () => { draft.date = dateInput.value || store.todayISO(); changed(); }
  });

  const sessionNote = h('textarea', {
    placeholder: 'Forme du jour, ressenti…', maxlength: 1000,
    oninput: () => { draft.note = sessionNote.value; changed(); }
  });
  sessionNote.value = draft.note || '';

  const addForm = newExerciseForm((def) => {
    const newId = store.addExercise(sid, def); // ajouté au programme de la séance
    draft.entries.push({
      exerciseId: newId, name: def.name, mode: def.mode, note: '',
      sets: Array.from({ length: def.defaultSets }, () => ({ weight: null, reps: null }))
    });
    renderList();
    toast(`« ${def.name} » ajouté à la séance`);
  });

  const finish = () => {
    saveNow();
    sync.flush();
    const saved = store.getLog(draft.id);
    toast(saved ? 'Séance enregistrée' : 'Rien d’enregistré pour cette séance');
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

  const title = sess ? sess.name : 'Séance';
  const n = sess ? sessionNumber(sess.id) : null;

  return h('div', { class: 'page page-form' },
    pageHead(title, {
      back: existing ? { href: '#/historique', label: 'Historique' } : { href: '#/seances', label: 'Séances' },
      sub: h('span', { class: 'workout-sub' },
        n ? `Séance ${n} · ` : '',
        pastMode ? longDate(draft.date) : 'Aujourd’hui',
        ' · ', doneCount),
      actions: h('div', { class: 'workout-actions' }, status, h('div', { class: 'date-field' }, dateInput))
    }),
    h('div', { class: 'stack' },
      list,
      h('details', { class: 'card section more' },
        h('summary', {}, icon(ICONS.plus, 14), 'Ajouter un exercice'),
        h('p', { class: 'desc' }, 'Il est aussi ajouté au programme de cette séance.'),
        addForm
      ),
      h('div', { class: 'card section' },
        h('h2', {}, 'Note de séance'),
        sessionNote
      ),
      sess && store.logsForSession(sid).filter((l) => l.id !== draft.id).length
        ? h('a', { class: 'link centered', href: `#/historique?seance=${encodeURIComponent(sid)}` },
            `Voir les ${plural(store.logsForSession(sid).filter((l) => l.id !== draft.id).length, 'séance précédente', 'séances précédentes')}`)
        : null
    ),
    h('div', { class: 'form-actions' },
      h('button', { class: 'btn ghost danger', type: 'button', onclick: remove }, 'Supprimer'),
      h('button', { class: 'btn primary', type: 'button', onclick: finish }, existing ? 'Terminé' : 'Terminer la séance')
    )
  );
}
