/**
 * Suivi Musculation — routeur et vues.
 *
 * Application à une page, sans build : chaque vue construit son DOM et
 * s'abonne au store. Les routes sont dans le hash pour rester compatibles
 * avec GitHub Pages (pas de réécriture serveur).
 *
 *   #/                     liste des séances
 *   #/seance/:id           détail d'une séance + historique
 *   #/seance/:id/nouveau   saisie d'une nouvelle séance
 *   #/log/:logId           modification d'une séance enregistrée
 *   #/progression?ex=:id   courbes de progression
 *   #/reglages             programme, données, synchro
 */

import * as store from './store.js';
import { fmtNum, formatDate } from './store.js';
import { mountChart } from './charts.js';
import { h, numInput, parseNum, toast, icon, ICONS } from './ui.js';
import * as sync from './sync.js';

const app = document.getElementById('app');
let cleanups = [];

/* ------------------------------------------------------------- thème */

const THEME_KEY = 'suivi-muscu:theme';

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current =
      document.documentElement.dataset.theme ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  });
}

/* ------------------------------------------------------------- helpers */

/** "75 kg × 8, 9, 9" ou, si les charges diffèrent, "75×8 · 70×9". */
function summarizeSets(sets, mode) {
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

/** « Séance 2 · Dos + Triceps » — le numéro suit l'ordre du programme. */
function sessionTitle(sess) {
  const i = store.getState().sessions.findIndex((s) => s.id === sess.id);
  return i >= 0 ? `Séance ${i + 1} · ${sess.name}` : sess.name;
}

function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`;
}

function miniBtn(pathD, label, onClick) {
  const b = h('button', { class: 'btn ghost small', type: 'button', title: label, 'aria-label': label, onclick: onClick });
  b.append(icon(pathD, 15));
  return b;
}

/** Formulaire inline « nouvel exercice ». */
function newExerciseForm(onAdd) {
  const name = h('input', { type: 'text', placeholder: 'Nom de l’exercice', autocomplete: 'off' });
  const mode = h('select', {}, h('option', { value: 'kg' }, 'Charge (kg)'), h('option', { value: 'bw' }, 'Poids du corps'));
  const sets = h('select', {}, ...[1, 2, 3, 4, 5, 6].map((n) => h('option', { value: n, selected: n === 3 }, n + ' séries')));

  const submit = () => {
    const value = name.value.trim();
    if (!value) { name.focus(); return; }
    onAdd({ name: value, mode: mode.value, defaultSets: Number(sets.value) });
    name.value = '';
  };

  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

  return h('div', { class: 'manage-row' },
    name, mode, sets,
    h('button', { class: 'btn small primary', type: 'button', onclick: submit }, 'Ajouter')
  );
}

/* ----------------------------------------------------------- vue : accueil */

function viewSessions() {
  const state = store.getState();

  const list = h('div', { class: 'session-list' },
    state.sessions.map((sess) => {
      const last = store.lastLogForSession(sess.id);
      return h('a', { class: 'card session-card', href: `#/seance/${sess.id}` },
        h('div', { class: 'body' },
          h('div', { class: 'name' }, sessionTitle(sess)),
          h('div', { class: 'meta' },
            plural(sess.exercises.length, 'exercice', 'exercices'),
            last ? ` · dernière le ${formatDate(last.date)}` : ' · jamais enregistrée'
          )
        ),
        h('span', { class: 'chev' }, icon(ICONS.chevron, 18))
      );
    })
  );

  return h('div', {},
    h('div', { class: 'page-head' },
      h('h1', {}, 'Mes séances'),
      h('span', { class: 'spacer' })
    ),
    state.sessions.length
      ? list
      : h('div', { class: 'card empty' }, 'Aucune séance. Crée ton programme dans Réglages.')
  );
}

/* ------------------------------------------------------ vue : une séance */

function viewSession(id) {
  const sess = store.getSession(id);
  if (!sess) return h('div', { class: 'card empty' }, 'Séance introuvable.');

  const logs = store.logsForSession(id);

  const exList = h('div', { class: 'card' },
    sess.exercises.length
      ? sess.exercises.map((ex) => {
          const last = store.lastEntryForExercise(ex.id);
          return h('a', { class: 'list-row', href: `#/progression?ex=${encodeURIComponent(ex.id)}` },
            h('div', { class: 'body' },
              h('div', { class: 'name' }, ex.name),
              h('div', { class: 'meta' }, last ? summarizeSets(last.sets, ex.mode) + ` · ${formatDate(last.date)}` : 'aucune donnée')
            ),
            h('span', { class: 'chev' }, icon(ICONS.chevron, 16))
          );
        })
      : h('div', { class: 'empty' }, 'Aucun exercice dans cette séance.')
  );

  const history = h('div', { class: 'stack' },
    logs.length
      ? logs.map((log) => {
          const det = h('details', { class: 'card log-item' },
            h('summary', {},
              h('strong', {}, formatDate(log.date)),
              h('span', { class: 'meta' }, plural(log.entries.length, 'exercice', 'exercices'))
            ),
            h('div', { class: 'table-wrap log-detail' },
              h('table', {},
                h('tbody', {},
                  log.entries.map((en) =>
                    h('tr', {},
                      h('td', { class: 'wrap' }, en.name),
                      h('td', { class: 'num' }, summarizeSets(en.sets, en.mode)),
                      h('td', { class: 'note' }, en.note || '')
                    )
                  )
                )
              )
            ),
            log.note ? h('p', { class: 'log-note' }, log.note) : null,
            h('div', { class: 'btn-row log-actions' },
              h('a', { class: 'btn small', href: `#/log/${log.id}` }, 'Modifier'),
              h('button', {
                class: 'btn small danger', type: 'button',
                onclick: () => {
                  if (!confirm(`Supprimer la séance du ${formatDate(log.date)} ? Cette ligne d’historique sera perdue.`)) return;
                  store.deleteLog(log.id);
                  toast('Séance supprimée');
                }
              }, 'Supprimer')
            )
          );
          return det;
        })
      : h('div', { class: 'card empty' }, 'Aucune séance enregistrée pour l’instant.')
  );

  return h('div', {},
    h('a', { class: 'back', href: '#/' }, '← Toutes les séances'),
    h('div', { class: 'page-head' },
      h('h1', {}, sessionTitle(sess)),
      h('span', { class: 'spacer' }),
      h('a', { class: 'btn primary', href: `#/seance/${sess.id}/nouveau` }, 'Enregistrer une séance')
    ),
    h('h2', { class: 'section-title' }, 'Exercices'),
    exList,
    h('h2', { class: 'section-title spaced' }, 'Historique'),
    history
  );
}

/* --------------------------------------------------- vue : saisie séance */

function viewLogForm({ sessionId, logId }) {
  const existing = logId ? store.getLog(logId) : null;
  const sid = existing ? existing.sessionId : sessionId;
  const sess = store.getSession(sid);
  if (!sess && !existing) return h('div', { class: 'card empty' }, 'Séance introuvable.');

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
    draft.entries.forEach((entry, entryIndex) => container.append(entryBlock(entry, entryIndex)));
  };

  const entryBlock = (entry, entryIndex) => {
    const isBW = entry.mode === 'bw';
    const setsWrap = h('div', { class: 'sets' });

    const drawSets = () => {
      setsWrap.textContent = '';
      setsWrap.append(
        h('div', { class: 'set-row' },
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
          'aria-label': `Série ${i + 1} — charge`,
          oninput: () => { set.weight = parseNum(wInput.value); }
        });
        const rInput = numInput({
          value: set.reps === null ? '' : String(set.reps),
          placeholder: last && last.reps !== null ? String(last.reps) : '',
          'aria-label': `Série ${i + 1} — répétitions`,
          oninput: () => { set.reps = parseNum(rInput.value); }
        });
        setsWrap.append(
          h('div', { class: 'set-row' },
            h('span', { class: 'idx' }, 'S' + (i + 1)),
            wInput,
            rInput,
            entry.sets.length > 1
              ? miniBtn(ICONS.close, 'Supprimer la série ' + (i + 1), () => { entry.sets.splice(i, 1); drawSets(); })
              : h('span', {})
          )
        );
      });
    };
    drawSets();

    const noteInput = h('input', {
      type: 'text',
      value: entry.note || '',
      placeholder: isBW ? 'Note (ex : + élastique rose, chaîne 10 kg)' : 'Note (optionnel)',
      class: 'entry-note',
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
          class: 'btn small', type: 'button',
          onclick: () => {
            const prev = entry.sets[entry.sets.length - 1];
            entry.sets.push({ weight: prev ? prev.weight : null, reps: null });
            drawSets();
          }
        }, '+ Série')
      ),
      noteInput
    );
  };

  renderEntries();

  const dateInput = h('input', {
    type: 'date', value: draft.date,
    onchange: () => { draft.date = dateInput.value || store.todayISO(); }
  });

  const sessionNote = h('textarea', {
    placeholder: 'Note de séance (forme du jour, ressenti…)',
    oninput: () => { draft.note = sessionNote.value; }
  });
  sessionNote.value = draft.note || '';

  const addForm = newExerciseForm((def) => {
    // Ajouté au programme de la séance ET à la saisie en cours.
    const newId = store.addExercise(sid, def);
    draft.entries.push({
      exerciseId: newId,
      name: def.name,
      mode: def.mode,
      note: '',
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
          exerciseId: en.exerciseId,
          name: en.name,
          mode: en.mode,
          note: en.note || '',
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
    location.hash = `#/seance/${sid}`;
  };

  return h('div', {},
    h('a', { class: 'back', href: `#/seance/${sid}` }, '← ' + (sess ? sessionTitle(sess) : 'Retour')),
    h('div', { class: 'page-head' },
      h('h1', {}, existing ? 'Modifier la séance' : 'Nouvelle séance'),
      h('span', { class: 'spacer' }),
      h('div', { class: 'date-field' }, dateInput)
    ),
    h('div', { class: 'stack' },
    container,
    h('div', { class: 'card section' },
      h('h2', {}, 'Ajouter un exercice'),
      h('p', { class: 'desc' }, 'Il sera ajouté au programme de cette séance, et à la saisie en cours.'),
      addForm
    ),
    h('div', { class: 'card section' },
      h('h2', {}, 'Note de séance'),
      h('p', { class: 'desc' }, 'Optionnel.'),
      sessionNote
    )
    ),
    h('div', { class: 'btn-row form-actions' },
      h('button', { class: 'btn primary', type: 'button', onclick: save }, existing ? 'Enregistrer les modifications' : 'Enregistrer la séance'),
      h('a', { class: 'btn ghost', href: `#/seance/${sid}` }, 'Annuler')
    )
  );
}

/* ---------------------------------------------------- vue : progression */

let progressionMetric = null;

function viewProgression(query) {
  const state = store.getState();
  const programme = store.allExercises();

  // Exercices présents dans l'historique mais retirés du programme.
  const known = new Set(programme.map((e) => e.id));
  const orphans = [];
  for (const log of state.logs) {
    for (const en of log.entries) {
      if (!known.has(en.exerciseId) && !orphans.some((o) => o.id === en.exerciseId)) {
        orphans.push({ id: en.exerciseId, name: en.name, mode: en.mode });
      }
    }
  }

  const all = [...programme, ...orphans];
  if (!all.length) return h('div', { class: 'card empty' }, 'Aucun exercice à afficher.');

  const selectedId = all.some((e) => e.id === query.ex) ? query.ex : all[0].id;
  const exercise = all.find((e) => e.id === selectedId);

  const select = h('select', { class: 'exercise-picker', 'aria-label': 'Exercice', onchange: () => {
    location.hash = `#/progression?ex=${encodeURIComponent(select.value)}`;
  } });
  for (const sess of state.sessions) {
    const group = h('optgroup', { label: sessionTitle(sess) });
    for (const ex of sess.exercises) {
      group.append(h('option', { value: ex.id, selected: ex.id === selectedId }, ex.name));
    }
    if (group.children.length) select.append(group);
  }
  if (orphans.length) {
    const group = h('optgroup', { label: 'Exercices retirés du programme' });
    for (const ex of orphans) group.append(h('option', { value: ex.id, selected: ex.id === selectedId }, ex.name));
    select.append(group);
  }

  const metrics = store.metricsFor(exercise.mode);
  if (!progressionMetric || !metrics.some((m) => m.key === progressionMetric)) {
    progressionMetric = metrics[0].key;
  }
  const metric = metrics.find((m) => m.key === progressionMetric);
  const points = store.seriesFor(selectedId, metric.key);
  const history = store.historyForExercise(selectedId);

  /* --- tuiles ------------------------------------------------------- */
  const lastPt = points[points.length - 1];
  const prevPt = points[points.length - 2];
  const best = points.length ? Math.max(...points.map((p) => p.y)) : null;
  const first = points.length ? points[0].y : null;

  const tile = (label, value, unit, delta) =>
    h('div', { class: 'card tile' },
      h('div', { class: 'label' }, label),
      h('div', { class: 'value' }, value === null ? '—' : fmtNum(value, 1), unit ? h('span', { class: 'unit' }, unit) : null),
      delta || null
    );

  let deltaEl = null;
  if (lastPt && prevPt) {
    const d = lastPt.y - prevPt.y;
    const cls = d > 0 ? 'delta up' : d < 0 ? 'delta down' : 'delta';
    const sign = d > 0 ? '+' : '';
    deltaEl = h('div', { class: cls }, `${sign}${fmtNum(d, 1)} vs séance précédente`);
  } else if (lastPt) {
    deltaEl = h('div', { class: 'delta' }, 'première mesure');
  }

  let progressEl = null;
  if (first !== null && lastPt && first !== 0) {
    const pct = ((lastPt.y - first) / Math.abs(first)) * 100;
    const cls = pct > 0 ? 'delta up' : pct < 0 ? 'delta down' : 'delta';
    progressEl = h('div', { class: cls }, `${pct > 0 ? '+' : ''}${fmtNum(pct, 0)} % depuis le début`);
  }

  const tiles = h('div', { class: 'tiles' },
    tile('Dernière valeur', lastPt ? lastPt.y : null, metric.unit, deltaEl),
    tile('Record', best, metric.unit, progressEl),
    tile('Séances', history.length, '', history.length ? h('div', { class: 'delta' }, `depuis le ${formatDate(history[0].date)}`) : null)
  );

  /* --- sélecteur de métrique ---------------------------------------- */
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Métrique affichée' },
    metrics.map((m) =>
      h('button', {
        type: 'button',
        'aria-pressed': m.key === metric.key ? 'true' : 'false',
        onclick: () => { progressionMetric = m.key; render(); }
      }, m.short)
    )
  );

  /* --- graphe -------------------------------------------------------- */
  const chartHost = h('div', {});
  const chartCard = h('div', { class: 'card chart-card' },
    h('div', { class: 'chart-head' },
      h('div', { class: 'title' }, `${metric.label} — ${exercise.name}`),
      h('span', { class: 'spacer' }),
      seg
    ),
    points.length >= 2
      ? chartHost
      : h('div', { class: 'empty' },
          points.length === 1
            ? 'Une seule séance enregistrée : la courbe apparaîtra dès la prochaine.'
            : 'Pas encore de données pour cet exercice.')
  );

  if (points.length >= 2) {
    cleanups.push(
      mountChart(chartHost, points, { unit: metric.unit, label: metric.label, mode: exercise.mode })
    );
  }

  /* --- tableau (équivalent texte du graphe) -------------------------- */
  const table = h('div', { class: 'card table-wrap' },
    history.length
      ? h('table', {},
          h('thead', {},
            h('tr', {},
              h('th', {}, 'Date'),
              h('th', {}, 'Séries'),
              h('th', { class: 'num' }, 'Charge max'),
              h('th', { class: 'num' }, 'Volume'),
              h('th', { class: 'num' }, 'Reps'),
              h('th', {}, 'Note')
            )
          ),
          h('tbody', {},
            [...history].reverse().map((entry) =>
              h('tr', {},
                h('td', {}, formatDate(entry.date)),
                h('td', {}, summarizeSets(entry.sets, entry.mode)),
                h('td', { class: 'num' }, fmtNum(store.METRICS.topWeight.compute(entry.sets), 1)),
                h('td', { class: 'num' }, fmtNum(store.METRICS.volume.compute(entry.sets), 0)),
                h('td', { class: 'num' }, fmtNum(store.METRICS.reps.compute(entry.sets), 0)),
                h('td', { class: 'note' }, entry.note || '')
              )
            )
          )
        )
      : h('div', { class: 'empty' }, 'Aucun historique.')
  );

  return h('div', {},
    h('div', { class: 'page-head' },
      h('h1', {}, 'Progression'),
      h('span', { class: 'spacer' }),
      select
    ),
    h('div', { class: 'stack' }, tiles, chartCard, table)
  );
}

/* ------------------------------------------------------- vue : réglages */

// Séances dépliées dans Réglages : conservées d'un re-render à l'autre.
const openAccordions = new Set();

function viewSettings() {
  const state = store.getState();

  /* --- programme ----------------------------------------------------- */
  const programme = h('div', { class: 'card section' },
    h('h2', {}, 'Programme'),
    h('p', { class: 'desc' },
      'Renomme, réordonne, ajoute ou supprime séances et exercices. ' +
      'Supprimer un exercice ne touche pas aux séances déjà enregistrées : son historique reste consultable dans Progression.'),
    state.sessions.map((sess) =>
      h('details', {
        class: 'accordion',
        open: openAccordions.has(sess.id),
        ontoggle: (e) => { if (e.target.open) openAccordions.add(sess.id); else openAccordions.delete(sess.id); }
      },
        h('summary', {}, sessionTitle(sess)),
        h('div', { class: 'manage-row' },
          h('input', {
            type: 'text', value: sess.name, 'aria-label': 'Nom de la séance',
            onchange: (e) => store.renameSession(sess.id, e.target.value.trim() || sess.name)
          }),
          h('div', { class: 'mini' },
            miniBtn(ICONS.up, 'Monter la séance', () => store.moveSession(sess.id, -1)),
            miniBtn(ICONS.down, 'Descendre la séance', () => store.moveSession(sess.id, 1)),
            miniBtn(ICONS.close, 'Supprimer la séance', () => {
              if (!confirm(`Supprimer « ${sess.name} » et tout son historique ? Action irréversible.`)) return;
              store.deleteSession(sess.id);
              toast('Séance supprimée');
            })
          )
        ),
        h('div', { class: 'sub-list' },
          sess.exercises.map((ex) =>
            h('div', { class: 'manage-row' },
              h('input', {
                type: 'text', value: ex.name, 'aria-label': 'Nom de l’exercice',
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
                  if (!confirm(`Retirer « ${ex.name} » du programme ? L’historique déjà enregistré est conservé.`)) return;
                  store.deleteExercise(sess.id, ex.id);
                  toast('Exercice retiré');
                })
              )
            )
          ),
          newExerciseForm((def) => {
            store.addExercise(sess.id, def);
            toast(`« ${def.name} » ajouté`);
          })
        )
      )
    ),
    h('div', { class: 'btn-row section-actions' },
      h('button', {
        class: 'btn', type: 'button',
        onclick: () => {
          const name = prompt('Nom de la nouvelle séance ?');
          if (!name) return;
          store.addSession(name.trim());
          toast('Séance créée');
        }
      }, '+ Nouvelle séance')
    )
  );

  /* --- données ------------------------------------------------------- */
  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', class: 'sr-only',
    onchange: async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        store.importJSON(await file.text());
        toast('Données importées');
      } catch (err) {
        alert('Import impossible : ' + err.message);
      }
      e.target.value = '';
    }
  });

  const data = h('div', { class: 'card section' },
    h('h2', {}, 'Mes données'),
    h('p', { class: 'desc' },
      `${plural(state.logs.length, 'séance enregistrée', 'séances enregistrées')}. ` +
      'Les données vivent dans ce navigateur : pense à exporter de temps en temps, ou active la synchro ci-dessous.'),
    h('div', { class: 'btn-row' },
      h('button', {
        class: 'btn', type: 'button',
        onclick: () => {
          const blob = new Blob([store.exportJSON()], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: `suivi-muscu-${store.todayISO()}.json` });
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }
      }, 'Exporter (JSON)'),
      h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, 'Importer…'),
      fileInput,
      h('button', {
        class: 'btn danger', type: 'button',
        onclick: () => {
          if (!confirm('Tout effacer et repartir du programme initial ? Tout ton historique local sera perdu.')) return;
          store.resetToSeed();
          toast('Données réinitialisées');
        }
      }, 'Réinitialiser')
    )
  );

  /* --- synchro ------------------------------------------------------- */
  const cfg = sync.getConfig();
  const urlIn = h('input', { id: 'sync-url', type: 'text', value: cfg.url, placeholder: 'https://xxxxx.supabase.co', autocomplete: 'off' });
  const keyIn = h('input', { id: 'sync-key', type: 'password', value: cfg.key, placeholder: 'clé anon publique', autocomplete: 'off' });
  const idIn = h('input', { id: 'sync-id', type: 'text', value: cfg.id, placeholder: 'identifiant de sauvegarde', autocomplete: 'off' });
  const enabledIn = h('input', { type: 'checkbox', id: 'sync-enabled', checked: cfg.enabled });

  const syncSection = h('div', { class: 'card section' },
    h('h2', {}, 'Synchro entre appareils'),
    h('p', { class: 'desc' },
      'Optionnel et gratuit : avec un projet Supabase, tes séances se retrouvent sur le téléphone et sur l’ordinateur. ' +
      'La marche à suivre est dans docs/SYNC.md du dépôt.'),
    h('div', { class: 'stack' },
      h('div', { class: 'field' }, h('label', { for: 'sync-url' }, 'URL du projet'), urlIn),
      h('div', { class: 'field' }, h('label', { for: 'sync-key' }, 'Clé anon'), keyIn),
      h('div', { class: 'field' },
        h('label', { for: 'sync-id' }, 'Identifiant de sauvegarde'),
        h('div', { class: 'inline' },
          idIn,
          h('button', { class: 'btn small', type: 'button', onclick: () => { idIn.value = sync.randomId(); } }, 'Générer')
        ),
        h('span', { class: 'hint' }, 'Le même identifiant sur tous tes appareils. Garde-le pour toi : il donne accès à tes données.')
      ),
      h('label', { class: 'check' }, enabledIn, 'Activer la synchro')
    ),
    h('div', { class: 'btn-row section-actions' },
      h('button', {
        class: 'btn primary', type: 'button',
        onclick: async () => {
          sync.setConfig({ url: urlIn.value, key: keyIn.value, id: idIn.value, enabled: enabledIn.checked });
          if (!enabledIn.checked) { toast('Synchro désactivée'); return; }
          try {
            const result = await sync.syncNow();
            toast(result === 'pulled' ? 'Données récupérées depuis le cloud' : 'Données envoyées vers le cloud');
          } catch {
            toast('Échec : vérifie l’URL, la clé et la table.');
          }
        }
      }, 'Enregistrer et synchroniser'),
      h('button', {
        class: 'btn', type: 'button',
        onclick: async () => {
          if (!sync.isConfigured()) { toast('Configure d’abord la synchro.'); return; }
          try { await sync.syncNow(); toast('Synchronisé'); } catch { toast('Échec de la synchro.'); }
        }
      }, 'Synchroniser maintenant')
    )
  );

  return h('div', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Réglages')),
    h('div', { class: 'stack' }, programme, data, syncSection)
  );
}

/* --------------------------------------------------------------- routeur */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const query = {};
  for (const [k, v] of new URLSearchParams(queryPart || '')) query[k] = v;
  return { parts, query };
}

function render() {
  cleanups.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });
  cleanups = [];

  const { parts, query } = parseHash();
  let view;
  let active = 'seances';

  try {
    if (parts[0] === 'seance' && parts[1] && parts[2] === 'nouveau') {
      view = viewLogForm({ sessionId: parts[1] });
    } else if (parts[0] === 'seance' && parts[1]) {
      view = viewSession(parts[1]);
    } else if (parts[0] === 'log' && parts[1]) {
      view = viewLogForm({ logId: parts[1] });
    } else if (parts[0] === 'progression') {
      view = viewProgression(query);
      active = 'progression';
    } else if (parts[0] === 'reglages') {
      view = viewSettings();
      active = 'reglages';
    } else {
      view = viewSessions();
    }
  } catch (err) {
    console.error(err);
    view = h('div', { class: 'card empty' }, 'Erreur d’affichage : ' + err.message);
  }

  app.textContent = '';
  app.append(view);

  for (const a of document.querySelectorAll('#nav a')) {
    if (a.dataset.route === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

/* ------------------------------------------------------------ démarrage */

function initStatusBar() {
  const el = document.getElementById('sync-status');
  sync.onStatus((s) => {
    el.className = 'sync-status ' + (s.state === 'off' ? '' : s.state);
    el.textContent = s.message;
  });
}

function main() {
  initTheme();
  store.load();
  initStatusBar();

  window.addEventListener('hashchange', render);

  // Les vues se redessinent à chaque mutation du store, sauf pendant la
  // saisie d'une séance (le brouillon n'écrit rien tant qu'on n'enregistre pas,
  // mais l'ajout d'un exercice, lui, passe par le store : on évite le re-render
  // qui viderait les champs en cours).
  store.subscribe(() => {
    const { parts } = parseHash();
    const editing = (parts[0] === 'seance' && parts[2] === 'nouveau') || parts[0] === 'log';
    if (!editing) render();
  });

  render();
  sync.initSync();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

main();
