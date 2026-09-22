/** Progression : vue d'ensemble de tous les exercices, puis détail d'un exercice. */

import * as store from '../store.js';
import { fmtNum, formatDate } from '../store.js';
import * as insights from '../insights.js';
import { mountChart, sparkline } from '../charts.js';
import { h, icon, ICONS } from '../ui.js';
import { summarizeSets, sessionTitle, pageHead, emptyState, plural } from './common.js';

/** Exercices du programme + ceux retirés mais présents dans l'historique. */
function knownExercises() {
  const state = store.getState();
  const programme = store.allExercises();
  const ids = new Set(programme.map((e) => e.id));
  const orphans = [];
  for (const log of state.logs) {
    for (const en of log.entries) {
      if (!ids.has(en.exerciseId)) {
        ids.add(en.exerciseId);
        orphans.push({ id: en.exerciseId, name: en.name, mode: en.mode, sessionId: null });
      }
    }
  }
  return { programme, orphans };
}

function deltaEl(delta, unit) {
  if (delta === null) return h('span', { class: 'delta' }, '—');
  if (delta === 0) return h('span', { class: 'delta' }, '= stable');
  const up = delta > 0;
  return h('span', { class: 'delta ' + (up ? 'up' : 'down') },
    icon(up ? ICONS.up : ICONS.down, 12), `${up ? '+' : ''}${fmtNum(delta, 1)} ${unit}`);
}

/* --------------------------------------------------- vue d'ensemble */

export function viewProgressionIndex() {
  const state = store.getState();
  const { programme, orphans } = knownExercises();
  if (!programme.length && !orphans.length) {
    return h('div', { class: 'page' }, pageHead('Progression'),
      emptyState('Aucun exercice', 'Ajoute des exercices à ton programme.'));
  }

  const row = (ex) => {
    const s = insights.exerciseSummary(ex.id, ex.mode);
    return h('a', { class: 'list-row prog-row', href: `#/progression/${encodeURIComponent(ex.id)}` },
      h('div', { class: 'body' },
        h('div', { class: 'name' }, ex.name),
        h('div', { class: 'meta' },
          s.values.length ? `${s.metric.short} · ${plural(s.values.length, 'séance', 'séances')}` : 'aucune donnée')
      ),
      s.values.length > 1 ? sparkline(s.values.slice(-10)) : h('span', { class: 'spark-empty' }),
      h('div', { class: 'row-value' },
        h('span', { class: 'v' }, s.last === null ? '—' : `${fmtNum(s.last, 1)} ${s.metric.unit}`),
        s.values.length > 1 ? deltaEl(s.delta, s.metric.unit) : null
      ),
      h('span', { class: 'chev' }, icon(ICONS.chevron, 16))
    );
  };

  const groups = state.sessions
    .filter((sess) => sess.exercises.length)
    .map((sess) =>
      h('section', { class: 'card list-card' },
        h('div', { class: 'list-head' }, h('h2', {}, sessionTitle(sess))),
        sess.exercises.map((ex) => row(ex))
      )
    );
  if (orphans.length) {
    groups.push(h('section', { class: 'card list-card' },
      h('div', { class: 'list-head' }, h('h2', {}, 'Retirés du programme')),
      orphans.map(row)));
  }

  const cardioCount = (state.cardio || []).length;
  groups.push(h('a', { class: 'card nav-card', href: '#/cardio' },
    h('span', { class: 'row-icon' }, icon(ICONS.pulse, 18)),
    h('div', { class: 'body' },
      h('div', { class: 'name' }, 'Progression cardio'),
      h('div', { class: 'meta' }, cardioCount ? `${plural(cardioCount, 'séance', 'séances')} · distance, durée, allure` : 'aucune séance cardio pour l’instant')
    ),
    h('span', { class: 'chev' }, icon(ICONS.chevron, 16))
  ));

  return h('div', { class: 'page' },
    pageHead('Progression', { sub: 'Touche un exercice pour voir sa courbe.' }),
    h('div', { class: 'stack' }, groups)
  );
}

/* ------------------------------------------------------------- détail */

let chosenMetric = null;

export function viewProgressionDetail(exerciseId, ctx) {
  const { programme, orphans } = knownExercises();
  const exercise = [...programme, ...orphans].find((e) => e.id === exerciseId);
  if (!exercise) {
    return emptyState('Exercice introuvable', null, h('a', { class: 'btn', href: '#/progression' }, 'Progression'));
  }
  const sess = exercise.sessionId ? store.getSession(exercise.sessionId) : null;

  const metrics = store.metricsFor(exercise.mode);
  if (!chosenMetric || !metrics.some((m) => m.key === chosenMetric)) chosenMetric = metrics[0].key;
  const metric = metrics.find((m) => m.key === chosenMetric);
  const points = store.seriesFor(exerciseId, metric.key);
  const history = store.historyForExercise(exerciseId);

  /* --- tuiles -------------------------------------------------------- */
  const lastPt = points[points.length - 1];
  const prevPt = points[points.length - 2];
  const best = points.length ? Math.max(...points.map((p) => p.y)) : null;
  const first = points.length ? points[0].y : null;

  const tile = (label, value, unit, sub) =>
    h('div', { class: 'card tile' },
      h('div', { class: 'label' }, label),
      h('div', { class: 'value' }, value === null ? '—' : fmtNum(value, 1), unit ? h('span', { class: 'unit' }, unit) : null),
      sub || null
    );

  let progress = null;
  if (first && lastPt && points.length > 1) {
    const pct = ((lastPt.y - first) / Math.abs(first)) * 100;
    progress = h('div', { class: 'delta ' + (pct > 0 ? 'up' : pct < 0 ? 'down' : '') },
      `${pct > 0 ? '+' : ''}${fmtNum(pct, 0)} % depuis le début`);
  }

  const tiles = h('div', { class: 'tiles' },
    tile('Dernière', lastPt ? lastPt.y : null, metric.unit,
      lastPt && prevPt ? h('div', {}, deltaEl(lastPt.y - prevPt.y, metric.unit)) : h('div', { class: 'delta' }, lastPt ? 'première mesure' : '')),
    tile('Record', best, metric.unit, progress),
    tile('Séances', history.length, '',
      history.length ? h('div', { class: 'delta' }, `depuis le ${formatDate(history[0].date)}`) : null)
  );

  /* --- graphe -------------------------------------------------------- */
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Valeur affichée' },
    metrics.map((m) =>
      h('button', {
        type: 'button', 'aria-pressed': m.key === metric.key ? 'true' : 'false',
        onclick: () => { chosenMetric = m.key; ctx.render(); }
      }, m.short)
    )
  );
  const chartHost = h('div', {});
  const chartCard = h('section', { class: 'card chart-card' },
    h('div', { class: 'chart-head' },
      h('h2', { class: 'title' }, metric.label),
      h('span', { class: 'spacer' }),
      seg
    ),
    points.length
      ? chartHost
      : h('p', { class: 'list-empty' }, 'Pas encore de données pour cet exercice.'),
    points.length === 1
      ? h('p', { class: 'chart-note' }, 'Une seule séance pour l’instant : la courbe se tracera dès la prochaine.')
      : null
  );
  if (points.length) {
    ctx.onCleanup(mountChart(chartHost, points, { unit: metric.unit, label: metric.label, mode: exercise.mode }));
  }

  /* --- tableau (équivalent texte du graphe) -------------------------- */
  const table = h('section', { class: 'card' },
    h('div', { class: 'list-head' }, h('h2', {}, 'Détail des séances')),
    history.length
      ? h('div', { class: 'table-wrap' },
          h('table', {},
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
        )
      : h('p', { class: 'list-empty' }, 'Aucun historique.')
  );

  return h('div', { class: 'page' },
    pageHead(exercise.name, {
      back: { href: '#/progression', label: 'Progression' },
      sub: sess ? sessionTitle(sess) : 'Retiré du programme'
    }),
    h('div', { class: 'stack' }, tiles, chartCard, table)
  );
}
