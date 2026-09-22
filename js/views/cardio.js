/**
 * Cardio : tapis, course à pied, vélo, rameur…
 *
 *   #/cardio            chiffres de la semaine, progression, liste par mois
 *   #/cardio/nouveau    ajouter une séance cardio
 *   #/cardio/:id        modifier une séance cardio
 */

import * as store from '../store.js';
import { fmtNum, formatDate } from '../store.js';
import * as insights from '../insights.js';
import { mountChart } from '../charts.js';
import { h, numInput, parseNum, toast, icon, ICONS } from '../ui.js';
import { pageHead, emptyState, monthLabel, longDate, plural } from './common.js';

/** « 32 min · 5,2 km · 6:09 /km » */
export function cardioSummary(c) {
  const parts = [];
  if (c.duration) parts.push(store.formatDuration(c.duration));
  if (c.distance) parts.push(`${fmtNum(c.distance, 2)} km`);
  const t = store.cardioType(c.type);
  if (c.distance && c.duration) {
    parts.push(t.pace ? `${store.formatPace(store.cardioPace(c))} /km` : `${fmtNum(store.cardioSpeed(c), 1)} km/h`);
  }
  if (c.calories) parts.push(`${fmtNum(c.calories, 0)} kcal`);
  return parts.join(' · ') || '—';
}

const METRICS = {
  distance: { label: 'Distance', unit: 'km', get: (c) => c.distance },
  duration: { label: 'Durée', unit: 'min', get: (c) => c.duration },
  speed: { label: 'Vitesse moyenne', unit: 'km/h', get: (c) => store.cardioSpeed(c) },
  pace: { label: 'Allure (plus bas = plus rapide)', unit: 'min/km', get: (c) => store.cardioPace(c) }
};

let chosenType = null;
let chosenMetric = 'distance';

/* --------------------------------------------------------------- page */

export function viewCardio(ctx) {
  const all = store.cardioList();
  const week = insights.cardioStats(7);
  const month = insights.cardioStats(30);

  const tile = (label, value, sub) =>
    h('div', { class: 'card tile' },
      h('div', { class: 'label' }, label),
      h('div', { class: 'value' }, value),
      sub ? h('div', { class: 'delta' }, sub) : null
    );
  const tiles = h('div', { class: 'tiles tiles-4' },
    tile('7 derniers jours', store.formatDuration(week.minutes), plural(week.count, 'séance', 'séances')),
    tile('Distance · 7 j', `${fmtNum(week.km, 1)} km`, week.count ? 'toutes activités' : '—'),
    tile('30 derniers jours', store.formatDuration(month.minutes), plural(month.count, 'séance', 'séances')),
    tile('Distance · 30 j', `${fmtNum(month.km, 1)} km`, `${plural(all.length, 'séance', 'séances')} au total`)
  );

  const addBtn = h('a', { class: 'btn primary', href: '#/cardio/nouveau' }, icon(ICONS.plus, 14), 'Ajouter une séance');

  if (!all.length) {
    return h('div', { class: 'page' },
      pageHead('Cardio', { sub: 'Tapis, course, vélo, rameur…', actions: addBtn }),
      emptyState('Aucune séance cardio',
        'Enregistre ta première séance : durée, distance, et ta progression apparaîtra ici.',
        h('a', { class: 'btn primary', href: '#/cardio/nouveau' }, icon(ICONS.plus, 14), 'Ajouter une séance'))
    );
  }

  /* --- progression par activité ------------------------------------- */
  const types = [...new Set(all.map((c) => c.type + '|' + store.cardioName(c)))];
  if (!chosenType || !types.includes(chosenType)) chosenType = all[0].type + '|' + store.cardioName(all[0]);
  const [typeId] = chosenType.split('|');
  const ofType = all.filter((c) => c.type + '|' + store.cardioName(c) === chosenType).slice().reverse();

  const usable = Object.entries(METRICS).filter(([key, m]) => {
    if (key === 'pace' && !store.cardioType(typeId).pace) return false;
    if (key === 'speed' && store.cardioType(typeId).pace) return false;
    return ofType.some((c) => m.get(c));
  });
  if (!usable.some(([k]) => k === chosenMetric)) chosenMetric = usable.length ? usable[0][0] : 'duration';
  const metric = METRICS[chosenMetric];

  const points = ofType
    .map((c) => ({ iso: c.date, x: new Date(c.date + 'T12:00:00'), y: metric.get(c), detail: cardioSummary(c) }))
    .filter((p) => p.y !== null && p.y !== undefined && Number.isFinite(p.y));

  const typeSelect = h('select', {
    class: 'filter-select', 'aria-label': 'Activité',
    onchange: () => { chosenType = typeSelect.value; ctx.render(); }
  }, types.map((t) => h('option', { value: t, selected: t === chosenType }, t.split('|')[1])));

  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Valeur affichée' },
    usable.map(([key, m]) => h('button', {
      type: 'button', 'aria-pressed': key === chosenMetric ? 'true' : 'false',
      onclick: () => { chosenMetric = key; ctx.render(); }
    }, m.label.split(' (')[0]))
  );

  const chartHost = h('div', {});
  const chartCard = h('section', { class: 'card chart-card' },
    h('div', { class: 'chart-head' },
      h('h2', { class: 'title' }, 'Progression'),
      h('span', { class: 'spacer' }),
      typeSelect
    ),
    usable.length > 1 ? h('div', { class: 'chart-seg' }, seg) : null,
    points.length
      ? chartHost
      : h('p', { class: 'list-empty' }, 'Renseigne la distance ou la durée pour voir la courbe.'),
    points.length === 1 ? h('p', { class: 'chart-note' }, 'La courbe se tracera dès la prochaine séance de cette activité.') : null
  );
  if (points.length) ctx.onCleanup(mountChart(chartHost, points, { unit: metric.unit, label: metric.label }));

  /* --- liste par mois ------------------------------------------------ */
  const groups = [];
  for (const c of all) {
    const key = c.date.slice(0, 7);
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, items: [] });
    groups[groups.length - 1].items.push(c);
  }
  const list = groups.map((g) =>
    h('section', { class: 'month-group' },
      h('div', { class: 'month-head' },
        h('h2', {}, monthLabel(g.key)),
        h('span', { class: 'muted' }, plural(g.items.length, 'séance', 'séances'))
      ),
      h('div', { class: 'card list-card' },
        g.items.map((c) =>
          h('a', { class: 'list-row', href: `#/cardio/${encodeURIComponent(c.id)}` },
            h('span', { class: 'row-icon' }, icon(ICONS.pulse, 18)),
            h('div', { class: 'body' },
              h('div', { class: 'name' }, store.cardioName(c)),
              h('div', { class: 'meta cap' }, longDate(c.date))
            ),
            h('div', { class: 'row-value' }, h('span', { class: 'v small' }, cardioSummary(c))),
            h('span', { class: 'chev' }, icon(ICONS.chevron, 16))
          )
        )
      )
    )
  );

  return h('div', { class: 'page' },
    pageHead('Cardio', { sub: 'Tapis, course, vélo, rameur…', actions: addBtn }),
    h('div', { class: 'stack' }, tiles, chartCard, ...list)
  );
}

/* ---------------------------------------------------------- formulaire */

export function viewCardioForm(id) {
  const existing = id ? store.getCardio(id) : null;
  if (id && !existing) return emptyState('Séance introuvable', null, h('a', { class: 'btn', href: '#/cardio' }, 'Cardio'));

  const last = store.cardioList()[0];
  const draft = existing
    ? { ...existing }
    : { id: store.uid('cardio'), date: store.todayISO(), type: last ? last.type : 'tapis', label: last ? last.label : '',
        duration: null, distance: null, calories: null, heartRate: null, note: '' };

  const msg = h('div', { class: 'auth-msg error', role: 'alert', hidden: true });
  const computed = h('p', { class: 'computed' });

  const typeSel = h('select', { 'aria-label': 'Activité' },
    store.CARDIO_TYPES.map((t) => h('option', { value: t.id, selected: t.id === draft.type }, t.label)));
  const labelIn = h('input', { type: 'text', value: draft.label || '', maxlength: 60, placeholder: 'ex : HIIT, boxe, escalade…' });
  const labelField = h('div', { class: 'field' }, h('label', {}, 'Nom de l’activité'), labelIn);
  const dateIn = h('input', { type: 'date', value: draft.date, max: store.todayISO() });

  const totalSec = draft.duration ? Math.round(draft.duration * 60) : null;
  const minIn = numInput({ value: totalSec !== null ? String(Math.floor(totalSec / 60)) : '', placeholder: 'min', inputmode: 'numeric', 'aria-label': 'Durée, minutes' });
  const secIn = numInput({ value: totalSec !== null && totalSec % 60 ? String(totalSec % 60) : '', placeholder: 's', inputmode: 'numeric', 'aria-label': 'Durée, secondes' });
  const distIn = numInput({ value: draft.distance !== null ? String(draft.distance).replace('.', ',') : '', placeholder: 'ex : 5,2' });
  const calIn = numInput({ value: draft.calories !== null ? String(draft.calories) : '', inputmode: 'numeric', placeholder: 'optionnel' });
  const hrIn = numInput({ value: draft.heartRate !== null ? String(draft.heartRate) : '', inputmode: 'numeric', placeholder: 'optionnel' });
  const noteIn = h('textarea', { maxlength: 500, placeholder: 'Inclinaison, résistance, ressenti…' });
  noteIn.value = draft.note || '';

  const read = () => {
    const min = parseNum(minIn.value);
    const sec = parseNum(secIn.value);
    const duration = min === null && sec === null ? null : (min || 0) + (sec || 0) / 60;
    return {
      ...draft,
      type: typeSel.value,
      label: typeSel.value === 'autre' ? labelIn.value.trim() : '',
      date: dateIn.value || store.todayISO(),
      duration,
      distance: parseNum(distIn.value),
      calories: parseNum(calIn.value),
      heartRate: parseNum(hrIn.value),
      note: noteIn.value.trim()
    };
  };

  const refresh = () => {
    labelField.hidden = typeSel.value !== 'autre';
    const c = read();
    const t = store.cardioType(c.type);
    computed.textContent = c.distance && c.duration
      ? (t.pace ? `Allure ${store.formatPace(store.cardioPace(c))} /km · ` : '') + `Vitesse moyenne ${fmtNum(store.cardioSpeed(c), 1)} km/h`
      : '';
  };
  for (const el of [typeSel, minIn, secIn, distIn]) el.addEventListener('input', refresh);
  typeSel.addEventListener('change', refresh);
  refresh();

  const validate = (c) => {
    if (!c.duration || c.duration <= 0) return 'Renseigne la durée.';
    if (c.duration > 24 * 60) return 'Durée trop longue.';
    if (c.distance !== null && (c.distance < 0 || c.distance > 500)) return 'Distance invalide.';
    if (c.calories !== null && (c.calories < 0 || c.calories > 20000)) return 'Calories invalides.';
    if (c.heartRate !== null && (c.heartRate < 30 || c.heartRate > 250)) return 'Fréquence cardiaque invalide.';
    if (c.type === 'autre' && !c.label) return 'Donne un nom à l’activité.';
    return null;
  };

  const save = () => {
    const c = read();
    const problem = validate(c);
    if (problem) { msg.textContent = problem; msg.hidden = false; return; }
    store.saveCardio(c);
    toast(existing ? 'Séance cardio modifiée' : 'Séance cardio enregistrée');
    location.hash = '#/cardio';
  };

  const remove = () => {
    if (!confirm(`Supprimer la séance cardio du ${formatDate(draft.date)} ?`)) return;
    store.deleteCardio(draft.id);
    toast('Séance cardio supprimée');
    location.hash = '#/cardio';
  };

  const field = (label, input, hint) => h('div', { class: 'field' }, h('label', {}, label), input, hint ? h('span', { class: 'hint' }, hint) : null);

  return h('div', { class: 'page page-form' },
    pageHead(existing ? 'Modifier la séance cardio' : 'Nouvelle séance cardio', {
      back: { href: '#/cardio', label: 'Cardio' }
    }),
    h('section', { class: 'card section' },
      h('div', { class: 'form-grid' },
        field('Activité', typeSel),
        labelField,
        field('Date', dateIn),
        field('Durée', h('div', { class: 'duration' }, minIn, h('span', {}, 'min'), secIn, h('span', {}, 's'))),
        field('Distance (km)', distIn, 'Optionnelle, pour la vitesse et l’allure.'),
        field('Calories', calIn),
        field('Fréquence cardiaque moyenne', hrIn, 'En battements par minute.')
      ),
      computed,
      h('div', { class: 'field' }, h('label', {}, 'Note'), noteIn),
      msg
    ),
    h('div', { class: 'form-actions' },
      existing ? h('button', { class: 'btn ghost danger', type: 'button', onclick: remove }, 'Supprimer') : null,
      h('a', { class: 'btn ghost', href: '#/cardio' }, 'Annuler'),
      h('button', { class: 'btn primary', type: 'button', onclick: save }, icon(ICONS.check, 15), 'Enregistrer')
    )
  );
}
