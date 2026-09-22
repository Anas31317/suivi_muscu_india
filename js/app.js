/**
 * Suivi Musculation — point d'entrée : routeur, navigation, session.
 *
 * Application à une page, sans build. Les routes sont dans le hash pour
 * rester compatibles avec GitHub Pages. Chaque page est dans js/views/.
 *
 *   #/                        accueil (prochaine séance, chiffres, records)
 *   #/seances                 liste des séances
 *   #/seance/:id              séance du jour : saisie en direct, enregistrement auto
 *   #/log/:logId              modification d'une séance passée (même page)
 *   #/historique[?seance=id]  toutes les séances enregistrées
 *   #/progression             vue d'ensemble des exercices
 *   #/progression/:exId       progression d'un exercice
 *   #/programme               gestion des séances et exercices
 *   #/profil                  compte, apparence, données
 *
 * Sans session, seules les pages publiques sont accessibles :
 *   #/connexion  #/inscription  #/mot-de-passe-oublie  #/nouveau-mot-de-passe
 */

import * as store from './store.js';
import * as sync from './sync.js';
import * as auth from './auth.js';
import * as authViews from './auth-views.js';
import { initTheme } from './theme.js';
import { logo } from './logo.js';
import { h, toast, icon, ICONS } from './ui.js';
import { plural } from './views/common.js';
import { viewDashboard } from './views/dashboard.js';
import { viewSessions } from './views/sessions.js';
import { viewWorkout } from './views/workout.js';
import { viewHistory } from './views/history.js';
import { viewProgressionIndex, viewProgressionDetail } from './views/progression.js';
import { viewProgramme } from './views/programme.js';
import { viewProfile } from './views/profile.js';

const app = document.getElementById('app');
let cleanups = [];

/** Utilisateur connecté : { id, email } ou null. */
let currentUser = null;
/** Vrai après un clic sur le lien « mot de passe oublié ». */
let recoveryMode = false;
/** Vrai une fois le démarrage terminé (avant, les événements d'auth sont ignorés). */
let booted = false;

const LAST_USER_KEY = 'suivi-muscu:last-user';
const PUBLIC_ROUTES = new Set(['connexion', 'inscription', 'mot-de-passe-oublie', 'nouveau-mot-de-passe']);

const TABS = [
  { id: 'accueil', href: '#/', label: 'Accueil', icon: ICONS.home },
  { id: 'seances', href: '#/seances', label: 'Séances', icon: ICONS.dumbbell },
  { id: 'historique', href: '#/historique', label: 'Historique', icon: ICONS.history },
  { id: 'progression', href: '#/progression', label: 'Progression', icon: ICONS.chart },
  { id: 'profil', href: '#/profil', label: 'Profil', icon: ICONS.user }
];

/* ------------------------------------------------------------- session */

function rememberUser(user) {
  try {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify({ id: user.id, email: user.email }));
  } catch { /* stockage indisponible : pas de mode hors ligne */ }
}

function lastUser() {
  try {
    const u = JSON.parse(localStorage.getItem(LAST_USER_KEY) || 'null');
    return u && typeof u.id === 'string' && typeof u.email === 'string' ? u : null;
  } catch {
    return null;
  }
}

/** Ouvre les données d'un utilisateur connecté et lance la synchro. */
async function startUser(user) {
  if (currentUser && currentUser.id === user.id && store.isOpen()) return;
  if (currentUser) endUser({ wipe: true });

  currentUser = { id: user.id, email: user.email };
  rememberUser(currentUser);
  const hadCache = store.openForUser(user.id);
  updateChrome();
  render();

  await sync.start(user.id, {
    hadCache,
    onFirstLogin: async (legacy) =>
      confirm(
        `Cet appareil contient des données de l’ancienne version du site ` +
        `(${plural(legacy.logs.length, 'séance enregistrée', 'séances enregistrées')}).\n\n` +
        `Les importer dans le compte ${user.email} ?\n\n` +
        'N’accepte que si ce sont TES données.'
      )
  });
}

/** Ferme la session locale. `wipe` efface le cache de l'appareil. */
function endUser({ wipe }) {
  sync.stop();
  store.closeUser({ wipe });
  if (wipe) localStorage.removeItem(LAST_USER_KEY);
  currentUser = null;
  updateChrome();
}

async function signOut() {
  const online = await sync.flush();
  if (!online && sync.hasPendingChanges() && !confirm(
    'Tes dernières modifications ne sont pas encore enregistrées en ligne (pas de réseau ?).\n\n' +
    'Si tu te déconnectes maintenant, elles seront perdues. Continuer ?'
  )) return;

  endUser({ wipe: true });
  await auth.signOut();
  recoveryMode = false;
  location.hash = '#/connexion';
  toast('Déconnecté');
}

function handleAuthEvent(event, session) {
  // Pas d'appel Supabase directement dans ce callback (recommandation supabase-js).
  setTimeout(() => {
    if (event === 'PASSWORD_RECOVERY') {
      recoveryMode = true;
      if (session) startUser(session.user);
      location.hash = '#/nouveau-mot-de-passe';
      render();
      return;
    }
    if (!booted) return;
    if (event === 'SIGNED_IN' && session) {
      if (!currentUser || currentUser.id !== session.user.id) {
        startUser(session.user).then(() => {
          if (!recoveryMode) location.hash = '#/';
        });
      }
    } else if (event === 'SIGNED_OUT') {
      if (currentUser) {
        endUser({ wipe: true });
        location.hash = '#/connexion';
        render();
      }
    } else if (event === 'USER_UPDATED' && session && currentUser) {
      currentUser.email = session.user.email;
    }
  }, 0);
}

/* ------------------------------------------------------------- en-tête */

function buildChrome() {
  document.getElementById('brand').append(logo({ size: 30 }));
  const nav = document.getElementById('nav');
  for (const tab of TABS) {
    nav.append(h('a', { href: tab.href, 'data-route': tab.id },
      icon(tab.icon, 20),
      h('span', { class: 'nav-label' }, tab.label)));
  }
}

/** Navigation visible seulement quand on est connecté. */
function updateChrome() {
  const signedIn = Boolean(currentUser);
  document.getElementById('nav').hidden = !signedIn;
  document.body.classList.toggle('signed-in', signedIn);
  document.getElementById('brand').setAttribute('href', signedIn ? '#/' : '#/connexion');
}

function setActiveTab(id) {
  for (const a of document.querySelectorAll('#nav a')) {
    if (a.dataset.route === id) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

/* --------------------------------------------------------------- routeur */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch { return ''; }
  });
  const query = {};
  for (const [k, v] of new URLSearchParams(queryPart || '')) query[k] = v;
  return { parts, query };
}

function publicView(route) {
  switch (route) {
    case 'inscription': return authViews.viewSignUp();
    case 'mot-de-passe-oublie': return authViews.viewForgot();
    case 'nouveau-mot-de-passe':
      return authViews.viewResetPassword({
        hasSession: recoveryMode && Boolean(currentUser),
        email: currentUser && currentUser.email,
        onDone: () => { recoveryMode = false; location.hash = '#/'; }
      });
    default: return authViews.viewSignIn();
  }
}

/** Page connectée pour une route donnée : [vue, onglet actif]. */
function privateView(parts, query, ctx) {
  const [route, a, b] = parts;
  switch (route) {
    case undefined:
    case '':
    case 'accueil':
      return [viewDashboard(ctx), 'accueil'];
    case 'seances':
      return [viewSessions(), 'seances'];
    case 'seance':
      if (a && b) history.replaceState(null, '', `#/seance/${encodeURIComponent(a)}`); // anciens liens …/nouveau
      if (a) return [viewWorkout({ sessionId: a }, ctx), 'seances'];
      return [viewSessions(), 'seances'];
    case 'log':
      return [viewWorkout({ logId: a }, ctx), 'historique'];
    case 'historique':
      return [viewHistory(query), 'historique'];
    case 'progression':
      if (a) return [viewProgressionDetail(a, ctx), 'progression'];
      if (query.ex) { // anciens liens #/progression?ex=…
        history.replaceState(null, '', `#/progression/${encodeURIComponent(query.ex)}`);
        return [viewProgressionDetail(query.ex, ctx), 'progression'];
      }
      return [viewProgressionIndex(), 'progression'];
    case 'programme':
      return [viewProgramme(), 'profil'];
    case 'profil':
    case 'reglages':
      return [viewProfile(ctx), 'profil'];
    default:
      history.replaceState(null, '', '#/');
      return [viewDashboard(ctx), 'accueil'];
  }
}

let lastRoute = '';

function render() {
  // Les nettoyages peuvent enregistrer des données (page de séance), et donc
  // relancer render() : on vide la liste avant de les exécuter.
  const pending = cleanups;
  cleanups = [];
  pending.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });

  const { parts, query } = parseHash();
  const route = parts[0] || '';
  const ctx = {
    user: currentUser,
    render,
    signOut,
    onCleanup: (fn) => cleanups.push(fn)
  };
  let view;
  let active = null;

  try {
    if (!auth.isConfigured) {
      view = authViews.viewNotConfigured();
    } else if (route === 'nouveau-mot-de-passe') {
      view = publicView(route);
    } else if (!currentUser || !store.isOpen()) {
      // Garde d'accès : sans session, seules les pages publiques s'affichent.
      if (!PUBLIC_ROUTES.has(route)) history.replaceState(null, '', '#/connexion');
      view = publicView(PUBLIC_ROUTES.has(route) ? route : 'connexion');
    } else if (PUBLIC_ROUTES.has(route)) {
      history.replaceState(null, '', '#/');
      [view, active] = privateView([], {}, ctx);
    } else {
      [view, active] = privateView(parts, query, ctx);
    }
  } catch (err) {
    console.error(err);
    view = h('div', { class: 'card empty-state' }, h('p', { class: 'empty-title' }, 'Erreur d’affichage'),
      h('p', { class: 'empty-text' }, 'Recharge la page.'));
  }

  app.textContent = '';
  app.append(view);
  setActiveTab(active);

  // Nouvelle page : on remonte en haut (pas lors d'un simple rafraîchissement).
  const key = location.hash.split('?')[0];
  if (key !== lastRoute) {
    lastRoute = key;
    window.scrollTo(0, 0);
  }
}

/* ------------------------------------------------------------ démarrage */

function initStatusBar() {
  const el = document.getElementById('sync-status');
  sync.onStatus((s) => {
    el.className = 'sync-status ' + (s.state === 'off' ? '' : s.state);
    el.textContent = s.message;
    el.hidden = !s.message;
  });
}

/** Supprime les réglages de l'ancienne synchro sans compte (clé et identifiant). */
function removeLegacySettings() {
  try { localStorage.removeItem('suivi-muscu:sync:v1'); } catch { /* ignore */ }
}

/** Refuse l'affichage dans un cadre (protection contre le clickjacking). */
function isFramed() {
  try { return window.top !== window.self; } catch { return true; }
}

async function main() {
  if (isFramed()) {
    app.textContent = 'Ce site ne peut pas être affiché dans un cadre.';
    return;
  }

  initTheme();
  buildChrome();
  initStatusBar();
  removeLegacySettings();
  updateChrome();

  window.addEventListener('hashchange', render);

  // Les pages se redessinent à chaque modification des données, sauf la page
  // de séance : elle s'enregistre à chaque saisie et gère son propre affichage
  // (un rafraîchissement ferait perdre le champ en cours de frappe).
  store.subscribe(() => {
    const { parts } = parseHash();
    const editing = (parts[0] === 'seance' && parts[1]) || parts[0] === 'log';
    if (!editing) render();
  });

  if (!auth.isConfigured) {
    render();
    return;
  }

  app.append(h('div', { class: 'loading' }, 'Chargement…'));

  // Retour d'un lien « mot de passe oublié » : ?flow=recovery (+ ?code= traité par supabase-js).
  const url = new URL(location.href);
  if (url.searchParams.get('flow') === 'recovery') {
    recoveryMode = true;
    url.searchParams.delete('flow');
    history.replaceState(null, '', url.pathname + url.search + '#/nouveau-mot-de-passe');
  }

  auth.onAuthChange(handleAuthEvent);
  const session = await auth.getSession(); // attend aussi l'échange du code des liens email

  if (session) {
    booted = true;
    await startUser(session.user);
  } else {
    const last = lastUser();
    if (!navigator.onLine && last && store.hasCacheFor(last.id)) {
      // Hors ligne avec une session expirée : on garde l'accès au cache de
      // cet appareil ; la reconnexion sera demandée au retour du réseau.
      currentUser = last;
      store.openForUser(last.id);
      updateChrome();
      window.addEventListener('online', async () => {
        const s = await auth.getSession();
        if (s && s.user.id === last.id) {
          sync.start(last.id, { hadCache: true, onFirstLogin: async () => false });
        } else {
          endUser({ wipe: false }); // garde les modifs locales, poussées après reconnexion
          render();
        }
      }, { once: true });
    }
    booted = true;
  }

  if (recoveryMode && !session) recoveryMode = false;
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

main();
