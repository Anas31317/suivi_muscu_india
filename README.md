# Suivi Musculation

Site de suivi de musculation pour un petit groupe : chacun a son compte et son suivi
privé (séries, charges, répétitions), un historique complet et des courbes de progression.

- **Accueil** : prochaine séance à faire, chiffres de la semaine et du mois, activité des
  8 dernières semaines, derniers records.
- **Séances** : chaque séance s'ouvre sur une page unique avec tous ses exercices, séries
  et reps. Pour chaque série, la valeur de la séance précédente est affichée (un tap la
  recopie). Tout s'enregistre automatiquement pendant la saisie, et « Enregistrer la
  séance » valide ; rouvrir la séance le même jour reprend là où on en était.
  Le programme (exercices, nombre de séries, ordre) ne se change que via
  « Modifier la séance », avec un bouton Enregistrer ; l'historique n'est jamais modifié.
- **Cardio** : tapis, course, vélo, rameur… avec durée, distance, vitesse / allure,
  chiffres sur 7 et 30 jours et courbe de progression par activité.
- **Historique** : toutes les séances enregistrées, par mois, filtrables par séance.
- **Progression** : vue d'ensemble de tous les exercices (dernière valeur, évolution,
  mini-courbe), puis pour chacun : charge max, volume, reps totales ou 1RM estimé.
- **Profil** : programme (séances et exercices), apparence (auto / clair / sombre),
  export / import des données, mot de passe, déconnexion.
- **Compte** : inscription réservée aux emails autorisés, connexion, mot de passe oublié.

Site statique (HTML, CSS, JavaScript, sans build), hébergé sur GitHub Pages ; comptes et
données sur Supabase. Il s'installe sur le téléphone comme une appli et reste utilisable
hors ligne.

## Mise en service

1. **Supabase** : suivre [docs/SUPABASE.md](docs/SUPABASE.md) (tables, liste blanche,
   réglages d'authentification, envoi des emails, clé dans `js/config.js`).
2. **GitHub Pages** : **Settings** > **Pages** > Source = *Deploy from a branch*,
   Branch = `main`, dossier `/ (root)`.
3. Le site est en ligne sur `https://anas31317.github.io/suivi_muscu_india/`.

### Installer sur le téléphone

- **Android (Chrome)** : menu ⋮ > *Installer l'application*
- **iPhone (Safari)** : Partager > *Sur l'écran d'accueil*

## Sécurité

- Inscription limitée aux emails de la liste blanche, vérifiée par la base de données.
- Chaque utilisateur ne peut lire et modifier que ses propres données (Row Level Security).
- Confirmation d'email obligatoire ; liens email en flux PKCE, à usage unique.
- Content-Security-Policy stricte ; librairie Supabase hébergée dans le dépôt
  (`js/vendor`, version 2.116.0 vérifiée) plutôt que chargée depuis un CDN.
- À la déconnexion, les données locales de l'appareil sont effacées.

Le détail est dans [docs/SUPABASE.md](docs/SUPABASE.md#ce-qui-protège-les-données).

La clé présente dans `js/config.js` est la clé **publique** (anon) : elle est faite pour
être visible. Ne jamais y mettre la clé `service_role`.

## Tester en local

```sh
python -m http.server 8000
```

puis ouvrir <http://localhost:8000> (ajouter `http://localhost:8000/**` aux Redirect URLs
de Supabase pour que les liens email fonctionnent en local).

## Organisation du code

| Fichier | Rôle |
|---|---|
| `index.html` | squelette de la page, Content-Security-Policy |
| `css/style.css` | tout le style (thème clair / sombre) |
| `js/app.js` | routeur, onglets, garde d'accès, cycle de connexion |
| `js/views/` | une page par fichier : accueil, séances, séance en cours (`workout.js`), modifier la séance (`session-editor.js`), cardio, historique, progression, programme, profil |
| `js/auth.js` | connexion, inscription, mots de passe (Supabase Auth) |
| `js/auth-views.js` | écrans de connexion, inscription, mot de passe oublié, sécurité |
| `js/sync.js` | synchronisation des données du compte |
| `js/store.js` | état, cache local par compte, métriques, import / export |
| `js/insights.js` | calculs de l'accueil : prochaine séance, activité, records |
| `js/seed.js` | programme type des nouveaux comptes |
| `js/charts.js` | graphes SVG (progression, activité, mini-courbes) |
| `js/logo.js`, `js/theme.js` | logo, thème clair / sombre |
| `js/config.js` | URL et clé publique Supabase |
| `js/vendor/` | supabase-js (copie locale) |
| `supabase/` | scripts SQL (tables, règles de sécurité) |
| `sw.js`, `manifest.webmanifest` | installation sur mobile et mode hors ligne |

Si tu ajoutes un fichier JS ou CSS, ajoute-le aussi à la liste `SHELL` de `sw.js` et
incrémente `CACHE` pour qu'il soit disponible hors ligne.
