/**
 * État de l'application + persistance.
 *
 * Source de vérité : un seul objet JSON gardé en mémoire, miroité dans
 * localStorage à chaque mutation. La synchro (voir sync.js) pousse et tire
 * ce même objet vers la ligne Supabase de l'utilisateur connecté.
 *
 * Le cache local est propre à chaque compte (clé suffixée par l'id
 * utilisateur) et il est effacé à la déconnexion : rien ne reste sur un
 * appareil partagé.
 *
 * Forme de l'état :
 * {
 *   version: 1,
 *   updatedAt: ISO string,
 *   sessions: [{ id, name, exercises: [{ id, name, mode, defaultSets }] }],
 *   logs:     [{ id, sessionId, date, note, entries: [
 *                 { exerciseId, name, mode, note, sets: [{ weight, reps }] } ] }]
 * }
 *
 * Chaque log fige le nom et le mode de l'exercice : renommer ou supprimer un
 * exercice ne réécrit donc jamais l'historique déjà enregistré.
 */

import { buildTemplateState } from './seed.js';

const STORAGE_PREFIX = 'suivi-muscu:state:v2:';
// Données de la version sans compte, importables à la 1re connexion.
const LEGACY_KEY = 'suivi-muscu:state:v1';

let state = null;
let storageKey = null;
const listeners = new Set();

/* ------------------------------------------------------------------ util */

export function uid(prefix = 'id') {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

export function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

export function formatDate(iso) {
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function formatDateShort(iso) {
  const [, m, d] = String(iso).split('-');
  return m && d ? `${d}/${m}` : iso;
}

/** Arrondi d'affichage : 17.50 -> "17,5", 75 -> "75". */
export function fmtNum(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return String(r).replace('.', ',');
}

/* ------------------------------------------------------- chargement / io */

function normalize(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const sessions = Array.isArray(s.sessions) ? s.sessions : [];
  const logs = Array.isArray(s.logs) ? s.logs : [];
  return {
    version: 1,
    updatedAt: s.updatedAt || new Date().toISOString(),
    sessions: sessions.map((sess) => ({
      id: sess.id || uid('s'),
      name: sess.name || 'Séance',
      exercises: (Array.isArray(sess.exercises) ? sess.exercises : []).map((e) => ({
        id: e.id || uid('e'),
        name: e.name || 'Exercice',
        mode: e.mode === 'bw' ? 'bw' : 'kg',
        defaultSets: Number(e.defaultSets) > 0 ? Number(e.defaultSets) : 3
      }))
    })),
    logs: logs.map((l) => ({
      id: l.id || uid('log'),
      sessionId: l.sessionId || '',
      date: l.date || todayISO(),
      note: l.note || '',
      entries: (Array.isArray(l.entries) ? l.entries : []).map((en) => ({
        exerciseId: en.exerciseId || '',
        name: en.name || 'Exercice',
        mode: en.mode === 'bw' ? 'bw' : 'kg',
        note: en.note || '',
        sets: (Array.isArray(en.sets) ? en.sets : []).map((st) => ({
          weight: st.weight === null || st.weight === undefined || st.weight === '' ? null : Number(st.weight),
          reps: st.reps === null || st.reps === undefined || st.reps === '' ? null : Number(st.reps)
        }))
      }))
    }))
  };
}

function readJSON(key) {
  try {
    const txt = localStorage.getItem(key);
    return txt ? JSON.parse(txt) : null;
  } catch (err) {
    console.warn('Données locales illisibles : ' + key, err);
    return null;
  }
}

/**
 * Ouvre le cache local d'un utilisateur. Renvoie true si un cache existait.
 * Sans cache, l'état est le programme type (en mémoire) en attendant la synchro.
 */
export function openForUser(userId) {
  storageKey = STORAGE_PREFIX + userId;
  const raw = readJSON(storageKey);
  state = raw ? normalize(raw) : buildTemplateState();
  return Boolean(raw);
}

export function hasCacheFor(userId) {
  return localStorage.getItem(STORAGE_PREFIX + userId) !== null;
}

/** Ferme la session locale ; `wipe` efface le cache de l'appareil. */
export function closeUser({ wipe = true } = {}) {
  if (wipe && storageKey) localStorage.removeItem(storageKey);
  state = null;
  storageKey = null;
}

export function isOpen() {
  return state !== null;
}

export function readLegacy() {
  const raw = readJSON(LEGACY_KEY);
  return raw && Array.isArray(raw.sessions) ? normalize(raw) : null;
}

export function clearLegacy() {
  localStorage.removeItem(LEGACY_KEY);
}

export function getState() {
  if (!state) throw new Error('Aucun utilisateur connecté.');
  return state;
}

/** Remplace tout l'état (import de fichier, tirage depuis la synchro). */
export function replaceState(next, { touch = true } = {}) {
  state = normalize(next);
  if (touch) state.updatedAt = new Date().toISOString();
  persist(false);
  emit();
  return state;
}

function persist(touch = true) {
  if (touch) state.updatedAt = new Date().toISOString();
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (err) {
    console.error('Écriture localStorage impossible', err);
  }
}

/** Applique une mutation, persiste, prévient les abonnés. */
export function mutate(fn) {
  const s = getState();
  fn(s);
  persist(true);
  emit();
  return s;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch (err) { console.error(err); }
  }
}

/** Repart du programme type, historique vide. */
export function resetToTemplate() {
  state = buildTemplateState();
  persist(false);
  emit();
}

/* ------------------------------------------------------------ lectures */

export function getSession(id) {
  return getState().sessions.find((s) => s.id === id) || null;
}

/** Séances enregistrées, la plus récente d'abord (à date égale : la dernière saisie). */
export function logsForSession(sessionId) {
  return getState().logs
    .map((l, i) => [l, i])
    .filter(([l]) => l.sessionId === sessionId)
    .sort(([a, i], [b, j]) => (a.date < b.date ? 1 : a.date > b.date ? -1 : j - i))
    .map(([l]) => l);
}

export function lastLogForSession(sessionId) {
  return logsForSession(sessionId)[0] || null;
}

/** Historique d'un exercice, du plus ancien au plus récent. */
export function historyForExercise(exerciseId) {
  const out = [];
  for (const log of getState().logs) {
    const entry = log.entries.find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const sets = entry.sets.filter((s) => s.reps !== null || s.weight !== null);
    if (!sets.length) continue;
    out.push({ logId: log.id, date: log.date, note: entry.note, mode: entry.mode, sets });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Dernière perf connue d'un exercice (pour préremplir la saisie). */
export function lastEntryForExercise(exerciseId) {
  const h = historyForExercise(exerciseId);
  return h.length ? h[h.length - 1] : null;
}

/** Tous les exercices, aplatis, avec leur séance — pour la page Progression. */
export function allExercises() {
  const out = [];
  for (const s of getState().sessions) {
    for (const e of s.exercises) {
      out.push({ ...e, sessionId: s.id, sessionName: s.name });
    }
  }
  return out;
}

/* ------------------------------------------------------------- métriques */

export const METRICS = {
  topWeight: {
    key: 'topWeight',
    label: 'Charge max',
    short: 'Charge max',
    unit: 'kg',
    compute: (sets) => {
      const w = sets.map((s) => s.weight).filter((v) => typeof v === 'number' && !Number.isNaN(v));
      return w.length ? Math.max(...w) : null;
    }
  },
  volume: {
    key: 'volume',
    label: 'Volume (charge × reps)',
    short: 'Volume',
    unit: 'kg',
    compute: (sets) => {
      let total = 0;
      let seen = false;
      for (const s of sets) {
        if (typeof s.weight === 'number' && typeof s.reps === 'number') {
          total += s.weight * s.reps;
          seen = true;
        }
      }
      return seen ? total : null;
    }
  },
  reps: {
    key: 'reps',
    label: 'Répétitions totales',
    short: 'Reps totales',
    unit: 'reps',
    compute: (sets) => {
      const r = sets.map((s) => s.reps).filter((v) => typeof v === 'number');
      return r.length ? r.reduce((a, b) => a + b, 0) : null;
    }
  },
  e1rm: {
    key: 'e1rm',
    label: '1RM estimé (Epley)',
    short: '1RM estimé',
    unit: 'kg',
    compute: (sets) => {
      let best = null;
      for (const s of sets) {
        if (typeof s.weight === 'number' && typeof s.reps === 'number' && s.weight > 0 && s.reps > 0) {
          const v = s.weight * (1 + s.reps / 30);
          if (best === null || v > best) best = v;
        }
      }
      return best;
    }
  }
};

/** Métriques pertinentes selon le type d'exercice. */
export function metricsFor(mode) {
  return mode === 'bw'
    ? [METRICS.reps, METRICS.topWeight, METRICS.volume]
    : [METRICS.topWeight, METRICS.volume, METRICS.reps, METRICS.e1rm];
}

/** Série temporelle { x: Date, iso, y } pour un exercice et une métrique. */
export function seriesFor(exerciseId, metricKey) {
  const metric = METRICS[metricKey] || METRICS.topWeight;
  return historyForExercise(exerciseId)
    .map((h) => ({ iso: h.date, x: new Date(h.date + 'T12:00:00'), y: metric.compute(h.sets), sets: h.sets }))
    .filter((p) => p.y !== null && !Number.isNaN(p.y));
}

/* ------------------------------------------------------------ mutations */

export function addSession(name) {
  const id = uid('s');
  mutate((s) => {
    s.sessions.push({ id, name: name || 'Nouvelle séance', exercises: [] });
  });
  return id;
}

export function renameSession(id, name) {
  mutate((s) => {
    const sess = s.sessions.find((x) => x.id === id);
    if (sess) sess.name = name;
  });
}

export function deleteSession(id) {
  mutate((s) => {
    s.sessions = s.sessions.filter((x) => x.id !== id);
    s.logs = s.logs.filter((l) => l.sessionId !== id);
  });
}

export function moveSession(id, dir) {
  mutate((s) => {
    const i = s.sessions.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= s.sessions.length) return;
    [s.sessions[i], s.sessions[j]] = [s.sessions[j], s.sessions[i]];
  });
}

export function addExercise(sessionId, { name, mode = 'kg', defaultSets = 3 }) {
  const id = uid('e');
  mutate((s) => {
    const sess = s.sessions.find((x) => x.id === sessionId);
    if (sess) sess.exercises.push({ id, name: name || 'Nouvel exercice', mode, defaultSets });
  });
  return id;
}

export function updateExercise(sessionId, exerciseId, patch) {
  mutate((s) => {
    const sess = s.sessions.find((x) => x.id === sessionId);
    const ex = sess && sess.exercises.find((x) => x.id === exerciseId);
    if (ex) Object.assign(ex, patch);
  });
}

/**
 * Retire un exercice du programme. L'historique déjà enregistré est conservé
 * (il reste visible dans Progression) sauf si `purgeHistory` est demandé.
 */
export function deleteExercise(sessionId, exerciseId, { purgeHistory = false } = {}) {
  mutate((s) => {
    const sess = s.sessions.find((x) => x.id === sessionId);
    if (sess) sess.exercises = sess.exercises.filter((x) => x.id !== exerciseId);
    if (purgeHistory) {
      for (const log of s.logs) log.entries = log.entries.filter((e) => e.exerciseId !== exerciseId);
    }
  });
}

export function moveExercise(sessionId, exerciseId, dir) {
  mutate((s) => {
    const sess = s.sessions.find((x) => x.id === sessionId);
    if (!sess) return;
    const i = sess.exercises.findIndex((x) => x.id === exerciseId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sess.exercises.length) return;
    [sess.exercises[i], sess.exercises[j]] = [sess.exercises[j], sess.exercises[i]];
  });
}

export function saveLog(log) {
  mutate((s) => {
    const i = s.logs.findIndex((l) => l.id === log.id);
    if (i >= 0) s.logs[i] = log;
    else s.logs.push(log);
  });
}

export function deleteLog(logId) {
  mutate((s) => {
    s.logs = s.logs.filter((l) => l.id !== logId);
  });
}

export function getLog(logId) {
  return getState().logs.find((l) => l.id === logId) || null;
}

/* ------------------------------------------------------ export / import */

export function exportJSON() {
  return JSON.stringify(getState(), null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.sessions)) {
    throw new Error('Fichier invalide : aucune séance trouvée.');
  }
  replaceState(parsed);
}
