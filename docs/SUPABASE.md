# Configuration Supabase (comptes et données)

Le site utilise Supabase pour deux choses :

- **les comptes** (inscription, connexion, mot de passe oublié) via Supabase Auth ;
- **les données** : une ligne par compte dans la table `user_state`, que seul son
  propriétaire peut lire ou modifier.

Tout se règle une fois, dans le tableau de bord Supabase du projet.

---

## 1. Créer les tables et la liste blanche

1. Copie [`supabase/schema.sql`](../supabase/schema.sql) dans Supabase : **SQL Editor** >
   **New query**.
2. Dans l'éditeur Supabase (pas dans le fichier du dépôt, qui est public), remplace les
   5 emails d'exemple par ceux du groupe, **en minuscules**, puis **Run**.
   Résultat attendu : « Success. No rows returned ».

Le script peut être relancé sans risque.

Pour garder la vraie liste sous la main, mets-la dans un fichier finissant par `.local.sql`
(ex. `supabase/liste-blanche.local.sql`) : le `.gitignore` l'empêche d'être poussé.

### Ajouter ou retirer quelqu'un plus tard

```sql
-- autoriser un email
insert into public.allowed_emails (email) values ('nouveau@exemple.com');

-- retirer l'autorisation (empêche une future inscription)
delete from public.allowed_emails where email = 'ancien@exemple.com';
```

Pour supprimer un compte existant : **Authentication** > **Users** > `…` > **Delete user**.
Ses données sont supprimées avec lui.

---

## 2. Régler l'authentification

Dans **Authentication** :

| Où | Réglage | Valeur |
|---|---|---|
| **Sign In / Providers** > **Email** | Enable Email provider | activé |
| | **Confirm email** | **activé** (indispensable, voir plus bas) |
| | Minimum password length | **10** |
| | Password requirements | *Letters and digits* |
| **Sign In / Providers** | Allow anonymous sign-ins | **désactivé** |
| **URL Configuration** | Site URL | `https://anas31317.github.io/suivi_muscu_india/` |
| | Redirect URLs | `https://anas31317.github.io/suivi_muscu_india/**` |

**Pourquoi la confirmation d'email est indispensable** : sans elle, quelqu'un qui connaît
l'email d'un membre du groupe pourrait créer le compte à sa place. Avec la confirmation, il
faut avoir accès à la boîte mail pour activer le compte.

> Pour tester en local (`python -m http.server 8000`), ajoute aussi `http://localhost:8000/**`
> dans les Redirect URLs.

---

## 3. Envoi des emails (SMTP)

L'envoi d'emails fourni par défaut par Supabase **ne fonctionne que pour les adresses des
membres de ton organisation Supabase**, avec une limite de quelques emails par heure. Pour
que les 5 personnes reçoivent la confirmation et le lien « mot de passe oublié », branche un
service d'envoi gratuit. Exemple avec **Brevo** (300 emails par jour gratuits) :

1. Crée un compte sur <https://www.brevo.com>.
2. **Senders, Domains & Dedicated IPs** > **Senders** : ajoute et valide l'adresse d'envoi
   (par exemple ton Gmail).
3. **SMTP & API** > **SMTP** : note le serveur, le login et génère une **clé SMTP**.
4. Dans Supabase : **Authentication** > **Emails** > **SMTP Settings** > **Enable custom SMTP** :
   - Sender email : l'adresse validée à l'étape 2
   - Sender name : `Suivi muscu`
   - Host : `smtp-relay.brevo.com`, Port : `587`
   - Username : le login SMTP Brevo
   - Password : la clé SMTP
5. **Authentication** > **Rate Limits** : passe l'envoi d'emails à `30` par heure.

*Autre option* : ton Gmail avec un « mot de passe d'application » (validation en 2 étapes
requise) : host `smtp.gmail.com`, port `587`.

Optionnel : dans **Authentication** > **Emails** > **Templates**, traduis les emails en
français (« Confirm signup », « Reset password »).

---

## 4. Brancher le site

1. **Project Settings** > **API Keys** : copie la clé **anon** (`eyJ…`) ou **publishable**
   (`sb_publishable_…`).
2. Colle-la dans [`js/config.js`](../js/config.js) (constante `SUPABASE_ANON_KEY`).
3. Commit et push.

Cette clé est **publique par conception** : elle ne permet rien d'autre que ce que les règles
de la base autorisent (s'inscrire si on est sur la liste, puis accéder à ses propres données).

**Ne mets jamais** la clé `service_role` ou une clé `secret` dans le site : elles contournent
toutes les protections.

---

## 5. Première connexion et nettoyage

1. **Anas** : connecte-toi la première fois **sur l'appareil où tu utilisais déjà le site**.
   Le site propose d'importer ces données dans ton compte : accepte.
2. Vérifie que ton historique apparaît bien.
3. Supprime l'ancienne table de synchro (elle était accessible avec la seule clé publique) :
   colle [`supabase/nettoyage-ancienne-synchro.sql`](../supabase/nettoyage-ancienne-synchro.sql)
   dans le SQL Editor, puis **Run**.

---

## Ce qui protège les données

| Menace | Protection |
|---|---|
| Un inconnu trouve le lien du site | Inscription refusée par la base (liste blanche) |
| Quelqu'un s'inscrit avec l'email d'un autre | Confirmation par email obligatoire |
| Un membre essaie de lire les données d'un autre | Règles RLS : chacun ne voit que sa ligne |
| Visiteur non connecté qui interroge l'API | Rôle `anon` sans aucun droit sur les tables |
| Deviner un mot de passe | 10 caractères minimum, limite de tentatives de Supabase |
| Savoir si un email a un compte | Messages identiques (connexion, mot de passe oublié) |
| Lien de réinitialisation intercepté | Flux PKCE : le lien ne marche que dans le navigateur qui l'a demandé, une seule fois, pendant 1 h |
| Script malveillant injecté | Content-Security-Policy stricte, aucun HTML construit depuis les données |
| Librairie compromise sur un CDN | supabase-js hébergé dans le dépôt, version figée et vérifiée |
| Site affiché dans un cadre piégé | Refus de s'afficher dans une iframe |
| Appareil partagé | La déconnexion efface les données locales de l'appareil |
