/**
 * Synchronisation optionnelle via Supabase (offre gratuite).
 *
 * Principe : tout l'état tient dans une seule ligne (`id`, `data` jsonb,
 * `updated_at`). On tire au chargement et au retour sur l'onglet, on pousse
 * après chaque modification (debounce). Le plus récent `updatedAt` gagne —
 * suffisant pour un usage mono-utilisateur sur deux appareils.
 *
 * Sans configuration, l'appli reste 100 % locale. Voir docs/SYNC.md.
 */

import { getState, replaceState, subscribe } from './store.js';

const CONFIG_KEY = 'suivi-muscu:sync:v1';
const TABLE = 'muscu_state';
const PUSH_DELAY = 1200;

let config = null;
let applyingRemote = false;
let pushTimer = 0;
let unsubscribe = null;
const statusListeners = new Set();

/* ---------------------------------------------------------- config i/o */

export function getConfig() {
  if (config) return config;
  try {
    config = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
  } catch {
    config = null;
  }
  if (!config) config = { enabled: false, url: '', key: '', id: '' };
  return config;
}

export function setConfig(next) {
  config = { ...getConfig(), ...next };
  config.url = (config.url || '').trim().replace(/\/+$/, '');
  config.key = (config.key || '').trim();
  config.id = (config.id || '').trim();
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  restart();
  return config;
}

export function isConfigured() {
  const c = getConfig();
  return Boolean(c.enabled && c.url && c.key && c.id);
}

export function randomId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------------------------------------------------------- statut ui */

let status = { state: 'off', message: 'Stockage local (aucune synchro)' };

export function getStatus() {
  return status;
}

export function onStatus(fn) {
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}

function setStatus(state, message) {
  status = { state, message };
  for (const fn of statusListeners) fn(status);
}

/* ------------------------------------------------------------- réseau */

function headers() {
  const c = getConfig();
  return {
    apikey: c.key,
    Authorization: 'Bearer ' + c.key,
    'Content-Type': 'application/json',
    // lu par la policy RLS : on ne voit que la ligne dont on connaît l'id
    'x-sync-id': c.id
  };
}

async function request(path, init) {
  const c = getConfig();
  const res = await fetch(`${c.url}/rest/v1/${path}`, { ...init, headers: { ...headers(), ...(init && init.headers) } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 200) : ''}`);
  }
  return res;
}

/** Tire l'état distant. Renvoie l'objet, ou null si la ligne n'existe pas. */
export async function pull() {
  const c = getConfig();
  const res = await request(`${TABLE}?id=eq.${encodeURIComponent(c.id)}&select=data`, { method: 'GET' });
  const rows = await res.json();
  return rows.length ? rows[0].data : null;
}

/** Pousse l'état local (upsert sur la clé primaire). */
export async function push(state) {
  const c = getConfig();
  await request(TABLE, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: c.id, data: state, updated_at: new Date().toISOString() })
  });
}

/* ------------------------------------------------------------ pilotage */

/** Tire, et remplace l'état local si le distant est plus récent. */
export async function syncNow({ quiet = false } = {}) {
  if (!isConfigured()) return;
  if (!quiet) setStatus('busy', 'Synchronisation…');
  try {
    const remote = await pull();
    const local = getState();
    if (remote && remote.updatedAt && remote.updatedAt > local.updatedAt) {
      applyingRemote = true;
      replaceState(remote, { touch: false });
      applyingRemote = false;
      setStatus('ok', 'Données récupérées · ' + timeLabel());
      return 'pulled';
    }
    await push(local);
    setStatus('ok', 'Synchronisé · ' + timeLabel());
    return 'pushed';
  } catch (err) {
    applyingRemote = false;
    console.error(err);
    setStatus('err', 'Synchro impossible : ' + err.message);
    throw err;
  }
}

function timeLabel() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function schedulePush() {
  if (!isConfigured() || applyingRemote) return;
  clearTimeout(pushTimer);
  setStatus('busy', 'Enregistrement…');
  pushTimer = setTimeout(async () => {
    try {
      await push(getState());
      setStatus('ok', 'Synchronisé · ' + timeLabel());
    } catch (err) {
      console.error(err);
      setStatus('err', 'Synchro impossible : ' + err.message);
    }
  }, PUSH_DELAY);
}

function onVisible() {
  if (document.visibilityState === 'visible') syncNow({ quiet: true }).catch(() => {});
}

function restart() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  document.removeEventListener('visibilitychange', onVisible);
  clearTimeout(pushTimer);

  if (!isConfigured()) {
    setStatus('off', 'Stockage local (aucune synchro)');
    return;
  }
  unsubscribe = subscribe(schedulePush);
  document.addEventListener('visibilitychange', onVisible);
  syncNow({ quiet: false }).catch(() => {});
}

export function initSync() {
  restart();
}
