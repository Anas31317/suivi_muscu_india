/**
 * Calculs pour l'accueil et la vue d'ensemble : prochaine séance, compteurs,
 * activité par semaine, records, résumé par exercice.
 */

import * as store from './store.js';

const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (iso) => new Date(iso + 'T12:00:00');

/** Lundi de la semaine d'une date. */
export function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Séance enregistrée la plus récente (à date égale, la dernière saisie). */
export function lastLog() {
  const logs = store.getState().logs;
  let best = null;
  logs.forEach((l) => { if (!best || l.date >= best.date) best = l; });
  return best;
}

/** La séance qui suit la dernière faite, dans l'ordre du programme. */
export function nextSession() {
  const { sessions } = store.getState();
  if (!sessions.length) return null;
  const last = lastLog();
  if (!last) return sessions[0];
  const i = sessions.findIndex((s) => s.id === last.sessionId);
  return sessions[(i + 1) % sessions.length] || sessions[0];
}

export function counts() {
  const logs = store.getState().logs;
  const now = new Date();
  const weekStart = toISO(mondayOf(now));
  const monthStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  return {
    week: logs.filter((l) => l.date >= weekStart).length,
    month: logs.filter((l) => l.date >= monthStart).length,
    total: logs.length
  };
}

/** Nombre de jours écoulés depuis une date ISO (0 = aujourd'hui). */
export function daysSince(iso) {
  const today = fromISO(toISO(new Date()));
  return Math.round((today - fromISO(iso)) / 86400000);
}

export function relativeDay(iso) {
  const n = daysSince(iso);
  if (n <= 0) return 'aujourd’hui';
  if (n === 1) return 'hier';
  if (n < 7) return `il y a ${n} jours`;
  if (n < 14) return 'il y a 1 semaine';
  if (n < 60) return `il y a ${Math.floor(n / 7)} semaines`;
  return `il y a ${Math.floor(n / 30)} mois`;
}

/** Séances par semaine sur les `n` dernières semaines (la dernière = semaine en cours). */
export function weeklyActivity(n = 8) {
  const logs = store.getState().logs;
  const current = mondayOf(new Date());
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(current);
    start.setDate(start.getDate() - 7 * i);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const a = toISO(start);
    const b = toISO(end);
    weeks.push({ iso: a, count: logs.filter((l) => l.date >= a && l.date < b).length });
  }
  return weeks;
}

/** Valeur suivie pour un exercice : charge max, ou reps totales au poids du corps. */
export function keyMetric(mode) {
  return mode === 'bw' ? store.METRICS.reps : store.METRICS.topWeight;
}

/** Résumé d'un exercice pour la vue d'ensemble. */
export function exerciseSummary(exerciseId, mode) {
  const metric = keyMetric(mode);
  const values = store.historyForExercise(exerciseId)
    .map((h) => metric.compute(h.sets))
    .filter((v) => v !== null);
  const last = values.length ? values[values.length - 1] : null;
  const prev = values.length > 1 ? values[values.length - 2] : null;
  return {
    metric,
    values,
    last,
    delta: last !== null && prev !== null ? last - prev : null,
    best: values.length ? Math.max(...values) : null
  };
}

/**
 * Records récents : chaque fois qu'un exercice dépasse son meilleur résultat
 * précédent (charge max, ou reps au poids du corps). La 1re séance d'un
 * exercice ne compte pas comme un record.
 */
export function recentRecords(limit = 5) {
  const seen = new Map();
  for (const log of store.getState().logs) {
    for (const en of log.entries) if (!seen.has(en.exerciseId)) seen.set(en.exerciseId, en);
  }
  const records = [];
  for (const [id, sample] of seen) {
    const metric = keyMetric(sample.mode);
    let best = null;
    for (const h of store.historyForExercise(id)) {
      const v = metric.compute(h.sets);
      if (v === null) continue;
      if (best !== null && v > best) {
        records.push({ exerciseId: id, name: sample.name, date: h.date, value: v, gain: v - best, unit: metric.unit });
      }
      if (best === null || v > best) best = v;
    }
  }
  return records.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, limit);
}

/** Prénom déduit de l'email : « anas.hadouche@… » -> « Anas ». */
export function firstName(email) {
  const local = String(email || '').split('@')[0].split(/[._-]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : '';
}
