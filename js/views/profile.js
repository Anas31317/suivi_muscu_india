/** Profil : compte, apparence, programme, données, déconnexion. */

import * as store from '../store.js';
import * as insights from '../insights.js';
import { accountSection } from '../auth-views.js';
import { getTheme, setTheme } from '../theme.js';
import { h, toast, icon, ICONS } from '../ui.js';
import { plural, pageHead } from './common.js';

export function viewProfile(ctx) {
  const state = store.getState();
  const email = ctx.user.email;
  const name = insights.firstName(email);

  /* --- identité ------------------------------------------------------ */
  const identity = h('section', { class: 'card profile-card' },
    h('span', { class: 'avatar', 'aria-hidden': 'true' }, (name || email).charAt(0).toUpperCase()),
    h('div', { class: 'body' },
      h('div', { class: 'name' }, name || 'Mon compte'),
      h('div', { class: 'meta' }, email)
    )
  );

  /* --- apparence ----------------------------------------------------- */
  const current = getTheme();
  const themeSeg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Thème' },
    [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(([value, label]) =>
      h('button', {
        type: 'button', 'aria-pressed': value === current ? 'true' : 'false',
        onclick: () => { setTheme(value); ctx.render(); }
      }, label)
    )
  );
  const appearance = h('section', { class: 'card section' },
    h('div', { class: 'section-row' },
      h('div', {},
        h('h2', {}, 'Apparence'),
        h('p', { class: 'desc' }, 'Auto suit le réglage de ton appareil.')
      ),
      themeSeg
    )
  );

  /* --- programme ----------------------------------------------------- */
  const programme = h('a', { class: 'card nav-card', href: '#/programme' },
    h('span', { class: 'row-icon' }, icon(ICONS.list, 18)),
    h('div', { class: 'body' },
      h('div', { class: 'name' }, 'Mon programme'),
      h('div', { class: 'meta' },
        `${plural(state.sessions.length, 'séance', 'séances')} · ${plural(store.allExercises().length, 'exercice', 'exercices')}`)
    ),
    h('span', { class: 'chev' }, icon(ICONS.chevron, 16))
  );

  /* --- données ------------------------------------------------------- */
  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', class: 'sr-only',
    onchange: async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        if (file.size > 2 * 1024 * 1024) throw new Error('fichier trop gros (2 Mo maximum).');
        if (!confirm('Remplacer toutes tes données actuelles par celles du fichier ?')) return;
        store.importJSON(await file.text());
        toast('Données importées');
      } catch (err) {
        alert('Import impossible : ' + err.message);
      }
    }
  });

  const data = h('section', { class: 'card section' },
    h('h2', {}, 'Mes données'),
    h('p', { class: 'desc' },
      `${plural(state.logs.length, 'séance enregistrée', 'séances enregistrées')}, synchronisées sur tous tes appareils. ` +
      'L’export te donne une copie de sauvegarde.'),
    h('div', { class: 'btn-row' },
      h('button', {
        class: 'btn', type: 'button',
        onclick: () => {
          const blob = new Blob([store.exportJSON()], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: `suivi-muscu-${store.todayISO()}.json` });
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }
      }, icon(ICONS.download, 14), 'Exporter'),
      h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, icon(ICONS.upload, 14), 'Importer'),
      fileInput,
      h('button', {
        class: 'btn danger', type: 'button',
        onclick: () => {
          if (!confirm('Effacer tout ton historique et repartir du programme type ? C’est irréversible (exporte d’abord si besoin).')) return;
          store.resetToTemplate();
          toast('Données réinitialisées');
        }
      }, 'Réinitialiser')
    )
  );

  return h('div', { class: 'page' },
    pageHead('Profil'),
    h('div', { class: 'stack' },
      identity,
      programme,
      appearance,
      data,
      accountSection({ email, onSignOut: ctx.signOut })
    )
  );
}
