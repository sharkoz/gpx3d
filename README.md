# GPX3D

Application web personnelle pour explorer et rejouer des traces de vol GPX dans un globe 3D.
Elle est publiée sur [sharkoz.github.io/gpx3d](https://sharkoz.github.io/gpx3d/).

## Fonctions

- Import GPX 1.0 et 1.1 dans un Web Worker.
- Bibliothèque de vols locale avec renommage et suppression.
- Terrain 3D et imagerie satellite sans clé, avec replis réseau.
- Caméras trace entière, vue d'oiseau, poursuite, pilote et libre.
- Lecture temporelle de `0,25x` à `20x`, curseur et raccourcis clavier.
- Altitude, vitesse source et calculée, cap, vario lissé, taux de virage et statistiques.
- Courbes synchronisées et trajectoire colorée par altitude, vitesse, temps ou cap.
- Interface française responsive pour ordinateur, tablette et téléphone.
- Conversion locale EGM96 vers hauteur ellipsoïdale lorsque le producteur est identifié.
- Offset vertical persistant et calage de la trajectoire sur le relief au point courant.

## Développement

Prérequis : Node.js 22 ou version ultérieure.

```bash
npm install
npm run dev
```

Le serveur local ouvre l'application sur `http://localhost:5173/gpx3d/`.

```bash
npm run check
```

Cette commande exécute Biome, TypeScript, les tests Vitest, le build de production et les
scénarios Playwright desktop/mobile avec audit Axe.

## Architecture

- `web/src/domain` : parsing GPX, géodésie, analyses et interpolation.
- `web/src/import` : Worker d'import et enrichissement EGM96 en WebAssembly.
- `web/src/storage` : bibliothèque IndexedDB avec Dexie.
- `web/src/components` : accueil, cockpit, graphiques et adaptateur Cesium.
- `e2e` : parcours navigateur et contrôles WCAG automatisables.
- `assets` et `cesium` : build statique commité pour GitHub Pages.

Le build sort volontairement à la racine du dépôt car GitHub Pages est configuré pour publier
la racine de `main`. Les fichiers source restent sous `web/` afin que Vite ne les écrase pas.

## Données et confidentialité

Les fichiers GPX et les vols analysés restent dans IndexedDB sur l'appareil. Ils ne sont envoyés
à aucun serveur. Les fournisseurs du relief et de l'imagerie reçoivent néanmoins les coordonnées
des tuiles consultées.

Le terrain, l'altitude au-dessus du sol et l'attitude synthétique sont indicatifs. Ils ne doivent
jamais servir à la navigation ou à la sécurité d'un vol.

Voir [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) pour les limites connues et les validations restant à
faire avec une trace de vol réelle.
