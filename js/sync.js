/**
 * Synchronisation des données de l'utilisateur connecté avec Supabase.
 *
 * Une ligne par compte dans `user_state` ; les règles RLS de la base
 * garantissent qu'un utilisateur ne peut lire ou écrire que la sienne.
 * On tire à la connexion et au retour sur l'onglet, on pousse après chaque
 * modification (debounce). La version la plus récente (`updatedAt`) gagne.
 *
 * Garde-fou : tant que la première lecture en ligne n'a pas réussi, rien
 * n'est envoyé. Un appareil sans cache ne peut donc jamais écraser les
 * données en ligne avec un programme vide.
 */

import { client } from './auth.js';
import * as store from './store.js';

const TABLE = 'user_state';
const PUSH_DELAY = 1200;

let userId = null;
let hadCache = false;
let reconciled = false;
let onFirstLogin = async () => false;
let pushTimer = 0;
let dirty = false;
let applyingRemote = false;
let unsubscribe = null;
const statusListeners = new Set();

/* ------------------------------------------------------------ statut */

let status = { state: 'off', message: '' };

export function onStatus(fn) {
  statusListeners.add(fn);
  fn(status);
  return () => statusListeners.delete(fn);
}

function setStatus(state, message) {
  status = { state, message };
  for (const fn of statusListeners) fn(status);
}

function timeLabel() {
  return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function failed(err) {
  console.error(err);
  setStatus('err', navigator.onLine
    ? 'Synchro impossible · nouvel essai au prochain changement'
    : 'Hors ligne · modifications gardées sur l’appareil');
}

/* ------------------------------------------------------------ réseau */

async function pull() {
  const { data, error } = await client.from(TABLE).select('data').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? data.data : null;
}

async function push(state) {
  const { error } = await client.from(TABLE).upsert({ user_id: userId, data: state }, { onConflict: 'user_id' });
  if (error) throw error;
}

function applyRemote(data) {
  applyingRemote = true;
  try {
    store.replaceState(data, { touch: false });
  } finally {
    applyingRemote = false;
  }
}

/* ---------------------------------------------------------- pilotage */

/**
 * Démarre la synchro pour un utilisateur dont le cache est déjà ouvert.
 * `opts.onFirstLogin(legacy)` est appelé si le compte n'a aucune donnée en
 * ligne ni en local et que l'appareil contient des données de l'ancienne
 * version ; il renvoie true pour les importer.
 */
export async function start(uid, opts) {
  stop();
  userId = uid;
  hadCache = opts.hadCache;
  onFirstLogin = opts.onFirstLogin;
  unsubscribe = store.subscribe(onLocalChange);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', refresh);
  return reconcile();
}

export function stop() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('online', refresh);
  clearTimeout(pushTimer);
  userId = null;
  reconciled = false;
  dirty = false;
  setStatus('off', '');
}

/** Première mise en cohérence local / en ligne. Renvoie ce qui a été fait. */
async function reconcile() {
  setStatus('busy', 'Synchronisation…');
  let remote;
  try {
    remote = await pull();
  } catch (err) {
    failed(err);
    return 'offline';
  }

  if (remote) {
    reconciled = true;
    const local = store.getState();
    // Appareil neuf : la version en ligne fait foi, toujours.
    if (!hadCache || !remote.updatedAt || remote.updatedAt >= local.updatedAt) {
      applyRemote(remote);
      dirty = false;
      setStatus('ok', 'Synchronisé · ' + timeLabel());
      return 'pulled';
    }
    dirty = true;
    await flush();
    return 'pushed';
  }

  // Compte sans aucune donnée en ligne : 1re connexion.
  if (!hadCache) {
    const legacy = store.readLegacy();
    if (legacy && legacy.logs.length && (await onFirstLogin(legacy))) {
      applyRemote(legacy);
      store.clearLegacy();
    }
  }
  reconciled = true;
  dirty = true;
  await flush();
  return 'created';
}

function onLocalChange() {
  if (!userId || applyingRemote) return;
  dirty = true;
  clearTimeout(pushTimer);
  if (!reconciled) return; // envoyé après la première lecture réussie
  setStatus('busy', 'Enregistrement…');
  pushTimer = setTimeout(() => { flush(); }, PUSH_DELAY);
}

/** Envoie immédiatement les modifications en attente. Renvoie true si tout est en ligne. */
export async function flush() {
  clearTimeout(pushTimer);
  if (!userId || !dirty) return true;
  if (!reconciled) return false;
  try {
    await push(store.getState());
    dirty = false;
    setStatus('ok', 'Synchronisé · ' + timeLabel());
    return true;
  } catch (err) {
    failed(err);
    return false;
  }
}

export function hasPendingChanges() {
  return dirty;
}

/** Retour sur l'onglet ou retour du réseau. */
async function refresh() {
  if (!userId) return;
  if (!reconciled) { await reconcile(); return; }
  if (dirty) { await flush(); return; }
  try {
    const remote = await pull();
    if (remote && remote.updatedAt && remote.updatedAt > store.getState().updatedAt) {
      applyRemote(remote);
    }
    setStatus('ok', 'Synchronisé · ' + timeLabel());
  } catch (err) {
    failed(err);
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') refresh();
}
