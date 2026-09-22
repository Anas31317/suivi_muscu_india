/** Séances : liste, détail d'une séance, saisie / modification. */

import * as store from '../store.js';
import { formatDate } from '../store.js';
import * as insights from '../insights.js';
import { h, numInput, parseNum, toast, icon, ICONS } from '../ui.js';
import {
  summarizeSets, sessionTitle, sessionNumber, plural, miniBtn, pageHead,
  emptyState, newExerciseForm, logCard
} from './common.js';

/* ------------------------------------------------------------- liste */

export function viewSessions() {
  const state = store.getState();
  const next = insights.nextSession();

  const cards = state.sessions.map((sess) => {
    const last = store.lastLogForSession(sess.id);
    const isNext = next && next.id === sess.id && state.logs.length > 0;
    return h('div', { class: 'card session-card' + (isNext ? ' is-next' : '') },
      h('a', { class: 'session-link', href: `#/seance/${sess.id}` },
        h('span', { class: 'session-num' }, String(sessionNumber(sess.id))),
        h('div', { class: 'body' },
          h('div', { class: 'name' }, sess.name, isNext ? h('span', { class: 'badge' }, 'Prochaine') : null),
          h('div', { class: 'meta' },
            plural(sess.exercises.length, 'exercice', 'exercices'),
            last ? ` · ${insights.relativeDay(last.date)}` : ' · jamais faite'
          )
        )
      ),
      h('a', {
        class: 'btn primary small start-btn', href: `#/seance/${sess.id}/nouveau`,
        'aria-label': `Commencer ${sessionTitle(sess)}`
      }, icon(ICONS.play, 13), 'Commencer')
    );
  });

  return h('div', { class: 'page' },
    pageHead('Séances', {
      sub: 'Choisis ta séance du jour.',
      actions: h('a', { class: 'btn', href: '#/programme' }, icon(ICONS.edit, 14), 'Modifier le programme')
    }),
    state.sessions.length
      ? h('div', { class: 'session-list' }, cards)
      : emptyState('Aucune séance', 'Crée ton programme pour commencer.',
          h('a', { class: 'btn primary', href: '#/programme' }, 'Créer mon programme'))
  );
}

/* ------------------------------------------------------------ détail */

export function viewSession(id) {
  const sess = store.getSession(id);
  if (!sess) return emptyState('Séance introuvable', null, h('a', { class: 'btn', href: '#/seances' }, 'Retour aux séances'));

  const logs = store.logsForSession(id);

  const exList = h('section', { class: 'card list-card' },
    h('div', { class: 'list-head' }, h('h2', {}, 'Exercices')),
    sess.exercises.length
      ? sess.exercises.map((ex) => {
          const last = store.lastEntryForExercise(ex.id);
          return h('a', { class: 'list-row', href: `#/progression/${encodeURIComponent(ex.id)}` },
            h('div', { class: 'body' },
              h('div', { class: 'name' }, ex.name, ex.mode === 'bw' ? h('span', { class: 'tag' }, 'PdC') : null),
              h('div', { class: 'meta' }, last ? `${summarizeSets(last.sets, ex.mode)} · ${formatDate(last.date)}` : 'aucune donnée')
            ),
            h('span', { class: 'chev' }, icon(ICONS.chevron, 16))
          );
        })
      : h('p', { class: 'list-empty' }, 'Aucun exercice. Ajoute-en depuis « Modifier le programme ».')
  );

  const recent = logs.slice(0, 5);
  const history = h('section', { class: 'stack' },
    h('div', { class: 'section-head' },
      h('h2', {}, 'Dernières fois'),
      logs.length > recent.length ? h('a', { class: 'link', href: `#/historique?seance=${encodeURIComponent(id)}` }, `Tout voir (${logs.length})`) : null
    ),
    recent.length
      ? recent.map((log) => logCard(log, { showSession: false }))
      : h('p', { class: 'muted' }, 'Pas encore enregistrée.')
  );

  return h('div', { class: 'page' },
    pageHead(sess.name, {
      back: { href: '#/seances', label: 'Séances' },
      sub: `Séance ${sessionNumber(id)} · ${plural(sess.exercises.length, 'exercice', 'exercices')}`,
      actions: h('a', { class: 'btn primary', href: `#/seance/${id}/nouveau` }, icon(ICONS.play, 14), 'Commencer')
    }),
    h('div', { class: 'stack' }, exList, history)
  );
}

/* ------------------------------------------------------------ saisie */

export function viewLogForm({ sessionId, logId }) {
  const existing = logId ? store.getLog(logId) : null;
  if (logId && !existing) return emptyState('Séance introuvable', null, h('a', { class: 'btn', href: '#/historique' }, 'Historique'));
  const sid = existing ? existing.sessionId : sessionId;
  const sess = store.getSession(sid);
  if (!sess && !existing) return emptyState('Séance introuvable', null, h('a', { class: 'btn', href: '#/seances' }, 'Retour aux séances'));

  // Brouillon local : rien n'est écrit dans le store avant « Enregistrer ».
  const draft = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
        id: store.uid('log'),
        sessionId: sid,
        date: store.todayISO(),
        note: '',
        entries: sess.exercises.map((ex) => {
          const last = store.lastEntryForExercise(ex.id);
          const count = last ? last.sets.length : ex.defaultSets;
          return {
            exerciseId: ex.id,
            name: ex.name,
            mode: ex.mode,
            note: '',
            // charge reprise de la dernière fois, reps à saisir
            sets: Array.from({ length: count }, (_, i) => ({
              weight: last && last.sets[i] ? last.sets[i].weight : null,
              reps: null
            })),
            _last: last
          };
        })
      };
  if (existing) {
    for (const en of draft.entries) en._last = store.lastEntryForExercise(en.exerciseId);
  }

  const container = h('div', { class: 'stack' });
  const renderEntries = () => {
    container.textContent = '';
    if (!draft.entries.length) container.append(h('p', { class: 'muted' }, 'Aucun exercice dans cette saisie.'));
    draft.entries.forEach((entry, i) => container.append(entryBlock(entry, i)));
  };

  const entryBlock = (entry, entryIndex) => {
    const isBW = entry.mode === 'bw';
    const setsWrap = h('div', { class: 'sets' });

    const drawSets = () => {
      setsWrap.textContent = '';
      setsWrap.append(
        h('div', { class: 'set-row set-head-row' },
          h('span', {}),
          h('span', { class: 'set-head' }, isBW ? 'Lest (kg)' : 'Charge (kg)'),
          h('span', { class: 'set-head' }, 'Reps'),
          h('span', {})
        )
      );
      entry.sets.forEach((set, i) => {
        const last = entry._last && entry._last.sets[i];
        const wInput = numInput({
          value: set.weight === null ? '' : String(set.weight).replace('.', ','),
          placeholder: last && last.weight !== null ? String(last.weight).replace('.', ',') : isBW ? '0' : '',
          'aria-label': `${entry.name}, série ${i + 1}, charge`,
          oninput: () => { set.weight = parseNum(wInput.value); }
        });
        const rInput = numInput({
          value: set.reps === null ? '' : String(set.reps),
          placeholder: last && last.reps !== null ? String(last.reps) : '',
          inputmode: 'numeric',
          'aria-label': `${entry.name}, série ${i + 1}, répétitions`,
          oninput: () => { set.reps = parseNum(rInput.value); }
        });
        setsWrap.append(
          h('div', { class: 'set-row' },
            h('span', { class: 'idx' }, String(i + 1)),
            wInput,
            rInput,
            entry.sets.length > 1
              ? miniBtn(ICONS.close, `Supprimer la série ${i + 1}`, () => { entry.sets.splice(i, 1); drawSets(); })
              : h('span', {})
          )
        );
      });
    };
    drawSets();

    const noteInput = h('input', {
      type: 'text', value: entry.note || '', class: 'entry-note', maxlength: 200,
      placeholder: isBW ? 'Note (ex : + élastique rose, chaîne 10 kg)' : 'Note (optionnel)',
      oninput: () => { entry.note = noteInput.value; }
    });

    return h('div', { class: 'card exercise-block' },
      h('div', { class: 'exercise-head' },
        h('span', { class: 'name' }, entry.name),
        isBW ? h('span', { class: 'tag' }, 'poids du corps') : null,
        miniBtn(ICONS.close, 'Retirer cet exercice de la saisie du jour', () => {
          draft.entries.splice(entryIndex, 1);
          renderEntries();
        })
      ),
      h('div', { class: 'last-perf' },
        entry._last
          ? `Dernière fois (${formatDate(entry._last.date)}) : ${summarizeSets(entry._last.sets, entry.mode)}`
          : 'Première fois sur cet exercice'
      ),
      setsWrap,
      h('div', { class: 'row-actions' },
        h('button', {
          class: 'btn small ghost', type: 'button',
          onclick: () => {
            const prev = entry.sets[entry.sets.length - 1];
            entry.sets.push({ weight: prev ? prev.weight : null, reps: null });
            drawSets();
          }
        }, icon(ICONS.plus, 14), 'Série')
      ),
      noteInput
    );
  };
  renderEntries();

  const dateInput = h('input', {
    type: 'date', value: draft.date, 'aria-label': 'Date de la séance',
    onchange: () => { draft.date = dateInput.value || store.todayISO(); }
  });

  const sessionNote = h('textarea', {
    placeholder: 'Forme du jour, ressenti…', maxlength: 1000,
    oninput: () => { draft.note = sessionNote.value; }
  });
  sessionNote.value = draft.note || '';

  const addForm = newExerciseForm((def) => {
    // Ajouté au programme de la séance ET à la saisie en cours.
    const newId = store.addExercise(sid, def);
    draft.entries.push({
      exerciseId: newId, name: def.name, mode: def.mode, note: '',
      sets: Array.from({ length: def.defaultSets }, () => ({ weight: null, reps: null })),
      _last: null
    });
    renderEntries();
    toast(`« ${def.name} » ajouté à la séance`);
  });

  const save = () => {
    const clean = {
      id: draft.id,
      sessionId: draft.sessionId,
      date: draft.date,
      note: draft.note,
      entries: draft.entries
        .map((en) => ({
          exerciseId: en.exerciseId, name: en.name, mode: en.mode, note: en.note || '',
          sets: en.sets.filter((s) => s.weight !== null || s.reps !== null)
        }))
        .filter((en) => en.sets.length > 0)
    };
    if (!clean.entries.length) {
      toast('Rien à enregistrer : saisis au moins une série.');
      return;
    }
    store.saveLog(clean);
    toast(existing ? 'Séance modifiée' : 'Séance enregistrée');
    location.hash = existing ? '#/historique' : '#/';
  };

  const title = sess ? sess.name : 'Séance';
  return h('div', { class: 'page page-form' },
    pageHead(existing ? `Modifier · ${title}` : title, {
      back: existing ? { href: '#/historique', label: 'Historique' } : { href: `#/seance/${sid}`, label: 'Séance' },
      sub: existing ? null : 'Nouvelle séance',
      actions: h('div', { class: 'date-field' }, dateInput)
    }),
    h('div', { class: 'stack' },
      container,
      h('details', { class: 'card section more' },
        h('summary', {}, icon(ICONS.plus, 14), 'Ajouter un exercice'),
        h('p', { class: 'desc' }, 'Il sera ajouté au programme de cette séance, et à la saisie en cours.'),
        addForm
      ),
      h('div', { class: 'card section' },
        h('h2', {}, 'Note de séance'),
        sessionNote
      )
    ),
    h('div', { class: 'form-actions' },
      h('a', { class: 'btn ghost', href: existing ? '#/historique' : `#/seance/${sid}` }, 'Annuler'),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, existing ? 'Enregistrer les modifications' : 'Enregistrer la séance')
    )
  );
}
