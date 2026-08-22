# GPX3D

Visualiseur de vols GPX en trois dimensions, entièrement exécuté dans le navigateur.

## Développement

```bash
npm install
npm run dev
```

La commande `npm run check` exécute le lint, le typage, les tests et la construction de la
version GitHub Pages.

## Données et confidentialité

Les fichiers GPX importés sont analysés et conservés localement avec IndexedDB. Ils ne sont
envoyés à aucun serveur. Les fournisseurs du terrain et de l'imagerie reçoivent néanmoins les
coordonnées des tuiles affichées.

Le terrain et l'imagerie utilisent des services publics sans clé. Ces données ne doivent jamais
servir à la navigation ou à la sécurité du vol.
