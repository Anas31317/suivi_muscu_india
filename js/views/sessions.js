/** Séances : la liste du programme. Chaque séance s'ouvre sur sa page de saisie (workout.js). */

import * as store from '../store.js';
import * as insights from '../insights.js';
import { h, icon, ICONS } from '../ui.js';
import { sessionTitle, sessionNumber, plural, pageHead, emptyState } from './common.js';

/** « Reprendre » si la séance a déjà été commencée aujourd'hui. */
export function startLabel(sessionId) {
  return store.logForSessionOn(sessionId, store.todayISO()) ? 'Reprendre' : 'Commencer';
}

export function viewSessions() {
  const state = store.getState();
  const next = insights.nextSession();

  const cards = state.sessions.map((sess) => {
    const last = store.lastLogForSession(sess.id);
    const isNext = next && next.id === sess.id && state.logs.length > 0;
    const href = `#/seance/${sess.id}`;
    return h('div', { class: 'card session-card' + (isNext ? ' is-next' : '') },
      h('a', { class: 'session-link', href },
        h('span', { class: 'session-num' }, String(sessionNumber(sess.id))),
        h('div', { class: 'body' },
          h('div', { class: 'name' }, sess.name, isNext ? h('span', { class: 'badge' }, 'Prochaine') : null),
          h('div', { class: 'meta' },
            plural(sess.exercises.length, 'exercice', 'exercices'),
            last ? ` · ${insights.relativeDay(last.date)}` : ' · jamais faite'
          )
        )
      ),
      h('a', { class: 'btn primary small start-btn', href, 'aria-label': `${startLabel(sess.id)} ${sessionTitle(sess)}` },
        icon(ICONS.play, 13), startLabel(sess.id))
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
