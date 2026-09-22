/**
 * Authentification (Supabase Auth, email + mot de passe).
 *
 * - Flux PKCE : les liens reçus par email (confirmation, mot de passe oublié)
 *   ramènent un code à usage unique, jamais un jeton dans l'URL.
 * - Les messages d'erreur ne révèlent pas si un compte existe.
 * - Le client Supabase vient de js/vendor (version figée, vérifiée), pas d'un CDN.
 */

import { SUPABASE_URL, SUPABASE_ANON_KEY, PASSWORD_MIN_LENGTH } from './config.js';

export const isConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SUPABASE_URL) &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.startsWith('COLLE_ICI');

export const client = isConfigured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'suivi-muscu:auth'
      }
    })
  : null;

/** URL du site sans requête ni ancre : cible des liens envoyés par email. */
export function siteUrl() {
  return location.origin + location.pathname;
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/** Renvoie un message d'erreur, ou null si le mot de passe est acceptable. */
export function checkPassword(password, email) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit faire au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  }
  if (password.length > 72) return 'Le mot de passe doit faire au plus 72 caractères.';
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return 'Le mot de passe doit contenir au moins une lettre et un chiffre.';
  }
  if (email && password.toLowerCase().includes(normalizeEmail(email).split('@')[0])) {
    return 'Le mot de passe ne doit pas contenir ton email.';
  }
  return null;
}

/** Traduit une erreur Supabase en message neutre et utile. */
export function explain(error) {
  if (!error) return '';
  const code = error.code || '';
  const msg = String(error.message || '');
  const status = error.status || 0;

  if (code === 'custom') return msg;
  if (!navigator.onLine || error.name === 'AuthRetryableFetchError') {
    return 'Pas de connexion internet. Réessaie une fois en ligne.';
  }
  if (status === 429 || code.startsWith('over_') || /rate limit/i.test(msg)) {
    return 'Trop de tentatives. Patiente quelques minutes avant de réessayer.';
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
    return 'Email ou mot de passe incorrect.';
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
    return 'Ton email n’est pas encore confirmé. Clique sur le lien reçu par email.';
  }
  if (/email_not_allowed|database error saving new user/i.test(msg) || code === 'unexpected_failure') {
    return 'Cet email n’est pas autorisé à créer un compte. Demande à l’administrateur de l’ajouter.';
  }
  if (code === 'weak_password' || /password/i.test(msg) && /weak|short|characters/i.test(msg)) {
    return 'Mot de passe trop faible : allonge-le ou varie les caractères.';
  }
  if (code === 'same_password') return 'Le nouveau mot de passe doit être différent de l’ancien.';
  if (code === 'otp_expired' || /expired|invalid.*(link|token|code)/i.test(msg)) {
    return 'Ce lien a expiré ou a déjà servi. Redemande un nouvel email.';
  }
  if (/code verifier|flow state/i.test(msg)) {
    return 'Ouvre le lien sur le même appareil et le même navigateur que ta demande, ou redemande un email.';
  }
  console.error(error);
  return 'Une erreur est survenue. Réessaie dans un instant.';
}

/* ---------------------------------------------------------------- actions */

export async function getSession() {
  const { data, error } = await client.auth.getSession();
  if (error) console.warn(error);
  return data ? data.session : null;
}

export function onAuthChange(fn) {
  return client.auth.onAuthStateChange((event, session) => fn(event, session));
}

export async function signIn(email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email: normalizeEmail(email), password });
  return { session: data ? data.session : null, error };
}

export async function signUp(email, password) {
  const { data, error } = await client.auth.signUp({
    email: normalizeEmail(email),
    password,
    options: { emailRedirectTo: siteUrl() }
  });
  return { session: data ? data.session : null, error };
}

export async function resendConfirmation(email) {
  const { error } = await client.auth.resend({
    type: 'signup',
    email: normalizeEmail(email),
    options: { emailRedirectTo: siteUrl() }
  });
  return { error };
}

export async function requestPasswordReset(email) {
  const { error } = await client.auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo: siteUrl() + '?flow=recovery'
  });
  return { error };
}

export async function updatePassword(password) {
  const { error } = await client.auth.updateUser({ password });
  return { error };
}

/** Vérifie le mot de passe actuel avant d'en définir un nouveau. */
export async function changePassword(email, currentPassword, newPassword) {
  const check = await client.auth.signInWithPassword({ email: normalizeEmail(email), password: currentPassword });
  if (check.error) {
    const e = check.error;
    if (e.code === 'invalid_credentials' || /invalid login/i.test(e.message || '')) {
      return { error: { message: 'Mot de passe actuel incorrect.', code: 'custom' } };
    }
    return { error: e };
  }
  return updatePassword(newPassword);
}

/** Déconnexion de CET appareil seulement (les autres restent connectés). */
export async function signOut() {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) console.warn(error);
}
