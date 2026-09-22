/** Historique : toutes les séances enregistrées, par mois, filtrables. */

import * as store from '../store.js';
import { h, icon, ICONS } from '../ui.js';
import { sessionTitle, monthLabel, pageHead, emptyState, logCard, plural } from './common.js';

export function viewHistory(query) {
  const state = store.getState();
  const filter = state.sessions.some((s) => s.id === query.seance) ? query.seance : '';

  const logs = state.logs
    .map((l, i) => [l, i])
    .filter(([l]) => !filter || l.sessionId === filter)
    .sort(([a, i], [b, j]) => (a.date < b.date ? 1 : a.date > b.date ? -1 : j - i))
    .map(([l]) => l);

  const select = h('select', {
    class: 'filter-select', 'aria-label': 'Filtrer par séance',
    onchange: () => {
      location.hash = select.value ? `#/historique?seance=${encodeURIComponent(select.value)}` : '#/historique';
    }
  },
    h('option', { value: '' }, 'Toutes les séances'),
    state.sessions.map((s) => h('option', { value: s.id, selected: s.id === filter }, sessionTitle(s)))
  );

  let body;
  if (!state.logs.length) {
    body = emptyState('Aucune séance enregistrée',
      'Ton historique se remplira à chaque séance enregistrée.',
      h('a', { class: 'btn primary', href: '#/seances' }, icon(ICONS.play, 14), 'Commencer une séance'));
  } else if (!logs.length) {
    body = emptyState('Rien pour cette séance', 'Choisis une autre séance dans le filtre.');
  } else {
    const groups = [];
    for (const log of logs) {
      const key = log.date.slice(0, 7);
      if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, logs: [] });
      groups[groups.length - 1].logs.push(log);
    }
    body = h('div', { class: 'stack' },
      groups.map((g) =>
        h('section', { class: 'month-group' },
          h('div', { class: 'month-head' },
            h('h2', {}, monthLabel(g.key)),
            h('span', { class: 'muted' }, plural(g.logs.length, 'séance', 'séances'))
          ),
          h('div', { class: 'stack' }, g.logs.map((log) => logCard(log)))
        )
      )
    );
  }

  return h('div', { class: 'page' },
    pageHead('Historique', {
      sub: plural(state.logs.length, 'séance enregistrée', 'séances enregistrées'),
      actions: state.logs.length ? select : null
    }),
    body
  );
}
