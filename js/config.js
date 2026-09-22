/**
 * Configuration Supabase.
 *
 * Ces deux valeurs sont PUBLIQUES par conception : elles sont visibles par
 * n'importe quel visiteur du site. La sécurité repose sur l'authentification
 * et les règles RLS de la base (voir supabase/schema.sql), pas sur leur secret.
 *
 * Ne JAMAIS mettre ici la clé "service_role" ou une clé "secret" : elles
 * contournent toutes les règles de sécurité.
 */

export const SUPABASE_URL = 'https://xkdsoqgqwhqnszbbpgen.supabase.co';

// Supabase > Project Settings > API Keys : clé "anon" (eyJ…) ou "publishable" (sb_publishable_…)
export const SUPABASE_ANON_KEY = 'sb_publishable_hlJbeCSEhyeuxzTlgV2-9w_zq4gZ-Zj';

/** Longueur minimale des mots de passe (à régler aussi côté Supabase). */
export const PASSWORD_MIN_LENGTH = 10;
