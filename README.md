# Suivi Musculation

Petit site pour suivre mes séances de muscu : saisie des séries (charge et répétitions),
historique complet, et courbes de progression par exercice.

- **Séances** : les 4 séances du programme. « Enregistrer une séance » ouvre la saisie :
  charges reprises de la dernière fois, et répétitions précédentes affichées en grisé.
- **Progression** : pour chaque exercice, charge max, volume, reps totales ou 1RM estimé
  dans le temps, avec le tableau détaillé.
- **Réglages** : modifier le programme (séances, exercices, ordre), exporter / importer
  les données en JSON, configurer la synchro entre appareils.

Site statique en HTML, CSS et JavaScript, sans build ni dépendance. Il s'installe sur
le téléphone comme une appli et fonctionne hors ligne.

## Mise en ligne (GitHub Pages)

1. Pousser le dépôt sur GitHub.
2. Sur GitHub : **Settings** > **Pages** > *Build and deployment* :
   Source = **Deploy from a branch**, Branch = **main**, dossier **/ (root)** > **Save**.
3. Au bout d'une minute, le site est en ligne sur
   `https://anas31317.github.io/suivi_muscu_india/`.

### Installer sur le téléphone

Ouvre le lien sur le téléphone, puis :
- **Android (Chrome)** : menu ⋮ > *Ajouter à l'écran d'accueil* / *Installer l'application*
- **iPhone (Safari)** : bouton Partager > *Sur l'écran d'accueil*

## Où sont mes données ?

Par défaut, **dans le navigateur de l'appareil** (localStorage). Donc :

- ce que tu saisis sur le téléphone reste sur le téléphone ;
- vider les données du navigateur efface l'historique : exporte en JSON de temps en temps.

Pour avoir les **mêmes données sur le téléphone et l'ordinateur**, active la synchro
gratuite avec Supabase : voir [docs/SYNC.md](docs/SYNC.md).

## Tester en local

Les modules JavaScript ne se chargent pas en ouvrant `index.html` directement depuis le disque.
Lancer un petit serveur à la racine du dépôt :

```sh
python -m http.server 8000
```

puis ouvrir <http://localhost:8000>.

## Organisation du code

| Fichier | Rôle |
|---|---|
| `index.html` | squelette de la page |
| `css/style.css` | tout le style (thème clair / sombre) |
| `js/app.js` | routeur et vues (séances, saisie, progression, réglages) |
| `js/store.js` | état, persistance locale, métriques, import / export |
| `js/seed.js` | programme et perfs de départ |
| `js/charts.js` | graphe de progression (SVG) |
| `js/sync.js` | synchro Supabase optionnelle |
| `js/ui.js` | petits utilitaires DOM |
| `sw.js`, `manifest.webmanifest` | installation sur mobile et mode hors ligne |

Le service worker sert toujours la version en ligne quand il y a du réseau, et la copie en
cache sinon : une modification poussée sur GitHub arrive donc sur le téléphone au prochain
chargement en ligne. Si tu ajoutes un fichier JS ou CSS, ajoute-le aussi à la liste `SHELL`
de `sw.js` pour qu'il soit disponible hors ligne.
