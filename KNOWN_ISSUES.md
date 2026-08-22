# Limites connues

## Validation attendue

- La démonstration couvre un vol pendulaire de 35,1 km et 49 minutes. Des traces issues d'autres
  appareils et des vols de plusieurs heures restent utiles pour élargir la validation des performances,
  des caméras attachées et du vario.
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
- L'offset manuel et l'action de calage déplacent uniquement le rendu 3D. Les altitudes GPX, le vario
  et les statistiques restent volontairement inchangés.
- Les modèles d'appareil sont des silhouettes low-poly indicatives. Leur roulis et leur tangage sont
  déduits de la trajectoire, sans données d'attitude enregistrées.
- Une trace sans timestamps reste explorable en 3D, mais ne peut pas être rejouée. Une trace sans
  altitude conserve sa géométrie, sans vario ni analyse verticale.

## Services et stockage

- ArcGIS, OpenStreetMap et l'éventuel compte MapTiler n'offrent aucun SLA à cette application. En cas
  d'échec, le globe se replie sur une texture locale et un ellipsoïde sans relief.
- Les bâtiments 3D sont limités aux 40 premiers objets OpenStreetMap dans une petite zone autour de
  l'appareil. Leur altitude de base est échantillonnée au centre de la zone et peut donc être
  approximative sur un terrain très pentu. Les relations multipolygones complexes ne sont pas encore
  affichées. L'option reste désactivée par défaut.
- IndexedDB peut être effacé par l'utilisateur, le navigateur ou le système. Aucun compte ni sauvegarde
  distante n'est fourni dans cette version.
- La taille d'import est limitée à 50 Mo. Les analyses restent en pleine résolution, tandis que la
  trajectoire 3D et les courbes sont réduites pour préserver les performances mobiles.

## Distribution

- Le bundle Cesium pèse environ 4,8 Mo et le modèle EGM96 environ 2,1 Mo. Ces ressources ne sont
  chargées qu'à l'ouverture ou l'import d'un vol, mais un premier usage sur réseau lent reste sensible.
- Les artefacts de production sont committés à la racine car le dépôt publie directement `main` avec
  GitHub Pages. Toute modification source doit être suivie de `npm run build` avant le push.
