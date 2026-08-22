# Limites connues

## Validation attendue

- La seule trace disponible pendant le développement mesure 17 m et correspond à un enregistrement
  au sol. Une vraie trace ULM reste nécessaire pour valider les performances, les caméras attachées,
  le vario et le rendu du relief sur plusieurs heures de vol.
- Les extensions propres au futur enregistreur devront être comparées aux canaux GPX 1.0 et Garmin
  v2 déjà pris en charge.

## Données de vol

- Un GPX décrit une position, pas l'attitude de l'appareil. Le roulis de la vue pilote est estimé à
  partir du taux de virage; le tangage et le cap représentent la trajectoire sol, pas nécessairement
  l'assiette et le nez de l'ULM.
- La conversion verticale automatique est volontairement limitée aux traces explicitement reconnues
  comme EGM96, dont BasicAirData. Une référence inconnue reste affichée sans correction silencieuse.
- La hauteur au-dessus du terrain n'apparaît qu'une fois la tuile de relief courante chargée et reste
  indicative malgré la conversion de référence verticale.
- Une trace sans timestamps reste explorable en 3D, mais ne peut pas être rejouée. Une trace sans
  altitude conserve sa géométrie, sans vario ni analyse verticale.

## Services et stockage

- ArcGIS, OpenStreetMap et l'éventuel compte MapTiler n'offrent aucun SLA à cette application. En cas
  d'échec, le globe se replie sur une texture locale et un ellipsoïde sans relief.
- IndexedDB peut être effacé par l'utilisateur, le navigateur ou le système. Aucun compte ni sauvegarde
  distante n'est fourni dans cette version.
- La taille d'import est limitée à 50 Mo. Les analyses restent en pleine résolution, tandis que la
  trajectoire 3D et les courbes sont réduites pour préserver les performances mobiles.

## Distribution

- Le bundle Cesium pèse environ 4,8 Mo et le modèle EGM96 environ 2,1 Mo. Ces ressources ne sont
  chargées qu'à l'ouverture ou l'import d'un vol, mais un premier usage sur réseau lent reste sensible.
- Les artefacts de production sont committés à la racine car le dépôt publie directement `main` avec
  GitHub Pages. Toute modification source doit être suivie de `npm run build` avant le push.
