# Synchro entre appareils (Supabase, gratuit)

Sans configuration, le site garde tes données **dans le navigateur** de l'appareil
utilisé. Pour retrouver les mêmes séances sur ton téléphone et sur ton ordinateur,
branche une base Supabase gratuite. Compte environ 10 minutes, une seule fois.

## 1. Créer le projet

1. Va sur <https://supabase.com> et crée un compte gratuit (connexion GitHub possible).
2. **New project** : donne un nom (ex. `suivi-muscu`), choisis un mot de passe de base
   (tu n'en auras pas besoin ensuite) et la région **West EU (Paris)** ou la plus proche.
3. Attends que le projet soit prêt (1 à 2 minutes).

## 2. Créer la table

Dans le menu de gauche : **SQL Editor** > **New query**, colle ce bloc puis **Run** :

```sql
create table if not exists public.muscu_state (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.muscu_state enable row level security;

-- Le site envoie l'identifiant de sauvegarde dans l'en-tête "x-sync-id".
-- On ne peut lire ou écrire que la ligne dont on connaît l'identifiant :
-- impossible de lister les autres lignes, même avec la clé.
create policy "acces par identifiant" on public.muscu_state
  for all to anon
  using      (id = (current_setting('request.headers', true)::json ->> 'x-sync-id'))
  with check (id = (current_setting('request.headers', true)::json ->> 'x-sync-id'));
```

## 3. Récupérer l'URL et la clé

**Project Settings** > **API** (ou **Data API**) :

- **Project URL** : du type `https://abcdefgh.supabase.co`
- **anon public key** : une longue chaîne qui commence par `eyJ…`
  (sur les projets récents, c'est la **publishable key** `sb_publishable_…` : elle marche aussi)

## 4. Configurer le site

Sur **le premier appareil** (celui qui a déjà tes données) :

1. Ouvre le site > **Réglages** > **Synchro entre appareils**.
2. Colle l'URL et la clé.
3. Clique **Générer** pour créer un identifiant de sauvegarde, et **note-le**.
4. Coche **Activer la synchro** puis **Enregistrer et synchroniser**.
   Le pied de page doit afficher « Synchronisé · hh:mm ».

Sur **le téléphone** : mêmes étapes, mais colle **le même identifiant** au lieu d'en
générer un nouveau. Au premier « Enregistrer et synchroniser », le téléphone récupère les
données du cloud.

> Astuce : pour éviter de retaper l'URL et la clé sur le téléphone, envoie-les-toi
> par message (elles ne sont pas secrètes, seul l'identifiant l'est).

## Comment ça marche

- Tout l'état (programme + historique) est stocké dans **une seule ligne** de la table.
- À l'ouverture du site et à chaque retour sur l'onglet, le site récupère la version
  cloud si elle est plus récente que la version locale.
- Après chaque modification, la version locale est envoyée au cloud (au bout d'environ une seconde).
- Hors ligne, tout continue de fonctionner localement ; la synchro reprend au retour du réseau
  (ouvre ou recharge le site pour la déclencher).
- En cas de modifications sur deux appareils sans synchro entre-temps, **la version la plus
  récente gagne** et remplace l'autre. Pour un usage perso c'est suffisant ; si tu as un doute,
  fais un **Exporter (JSON)** avant.

## Sécurité

- La clé `anon` est faite pour être publique : elle ne donne que les droits définis par les
  policies ci-dessus.
- La policy n'ouvre une ligne qu'à celui qui envoie son identifiant exact : avec la clé seule,
  on ne voit rien. Quelqu'un qui connaîtrait ta clé **et** ton identifiant pourrait en revanche
  lire ou modifier tes séances. L'identifiant généré fait 24 caractères aléatoires :
  impossible à deviner, mais ne le publie pas (ne le mets pas dans le dépôt GitHub).
- La configuration est gardée dans le navigateur de chaque appareil, jamais dans le code.

## Offre gratuite

L'offre gratuite de Supabase suffit très largement (quelques Ko de données). Un projet
inactif pendant une longue période peut être mis en pause par Supabase : il suffit alors
de le relancer depuis le tableau de bord, les données sont conservées.
