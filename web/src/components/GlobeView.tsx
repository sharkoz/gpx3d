import { useEffect, useRef, useState } from "react";
import type { InterpolatedPoint } from "@/domain/interpolate";
import type { FlightData, FlightPoint } from "@/domain/types";

export type CameraMode = "overview" | "bird" | "chase" | "pilot" | "free";
export type TrackMetric = "altitude" | "speed" | "time" | "heading";
export type MapStatus = "loading" | "online" | "fallback";

type CesiumModule = typeof import("cesium");

type GlobeViewProps = {
  flight: FlightData;
  currentPoint: InterpolatedPoint | null;
  cameraMode: CameraMode;
  trackMetric: TrackMetric;
  onMapStatus: (status: MapStatus) => void;
  onGroundElevation: (elevation: number | null) => void;
};

const ARCGIS_TERRAIN =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
const ARCGIS_IMAGERY =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";

const markerSvg = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <path d="M32 3 40 25 58 33 58 39 39 36 36 54 42 58 42 61 32 59 22 61 22 58 28 54 25 36 6 39 6 33 24 25Z" fill="#ffbd59" stroke="#071319" stroke-width="3" stroke-linejoin="round"/>
  </svg>
`)}`;

const renderHeight = (point: Pick<FlightPoint, "elevation" | "ellipsoidElevation">) =>
  point.ellipsoidElevation ?? point.elevation ?? 0;

function metricValue(point: FlightPoint, metric: TrackMetric) {
  if (metric === "altitude") return point.elevation;
  if (metric === "speed") {
    const speed = point.sourceSpeed ?? point.calculatedSpeed;
    return speed === null ? null : speed * 3.6;
  }
  if (metric === "heading") return point.sourceCourse ?? point.calculatedCourse;
  return point.time;
}

function metricRange(points: FlightPoint[], metric: TrackMetric) {
  const values = points.flatMap((point) => {
    const value = metricValue(point, metric);
    return value === null || !Number.isFinite(value) ? [] : [value];
  });
  if (!values.length) return [0, 1] as const;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return [minimum, maximum === minimum ? minimum + 1 : maximum] as const;
}

function trackColor(C: CesiumModule, value: number | null, minimum: number, maximum: number) {
  if (value === null) return C.Color.fromCssColorString("#668184").withAlpha(0.7);
  const ratio = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
  return C.Color.fromHsl(0.51 - ratio * 0.43, 0.82, 0.56, 0.96);
}

function directImageryProvider(C: CesiumModule, url: string, credit: string, fallbackUrl?: string) {
  const tilingScheme = new C.WebMercatorTilingScheme();
  return {
    tileWidth: 256,
    tileHeight: 256,
    maximumLevel: 19,
    minimumLevel: 0,
    tilingScheme,
    rectangle: tilingScheme.rectangle,
    tileDiscardPolicy: undefined,
    errorEvent: new C.Event(),
    credit: new C.Credit(credit),
    proxy: undefined,
    hasAlphaChannel: false,
    getTileCredits: () => undefined,
    pickFeatures: () => undefined,
    requestImage: (x: number, y: number, level: number) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        let fallbackAttempted = false;
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => {
          if (fallbackUrl && !fallbackAttempted) {
            fallbackAttempted = true;
            image.src = fallbackUrl
              .replace("{z}", String(level))
              .replace("{x}", String(x))
              .replace("{y}", String(y));
            return;
          }
          reject(new Error(`Tuile indisponible : ${level}/${x}/${y}`));
        };
        image.src = url
          .replace("{z}", String(level))
          .replace("{x}", String(x))
          .replace("{y}", String(y));
      }),
  } as unknown as import("cesium").ImageryProvider;
}

function addTrack(
  C: CesiumModule,
  viewer: import("cesium").Viewer,
  flight: FlightData,
  metric: TrackMetric,
) {
  const collection = viewer.scene.primitives.add(new C.PolylineCollection());
  const [minimum, maximum] = metricRange(flight.points, metric);
  const step = Math.max(1, Math.ceil(flight.points.length / 2_500));

  for (let index = step; index < flight.points.length; index += step) {
    const from = flight.points[index - step];
    const to = flight.points[index];
    if (from.segmentIndex !== to.segmentIndex) continue;
    const fromHeight = renderHeight(from) + 2;
    const toHeight = renderHeight(to) + 2;
    collection.add({
      positions: [
        C.Cartesian3.fromDegrees(from.longitude, from.latitude, fromHeight),
        C.Cartesian3.fromDegrees(to.longitude, to.latitude, toHeight),
      ],
      width: 3.5,
      material: C.Material.fromType("Color", {
        color: trackColor(C, metricValue(to, metric), minimum, maximum),
      }),
    });
  }
  return collection;
}

async function configureMap(
  C: CesiumModule,
  viewer: import("cesium").Viewer,
  onMapStatus: GlobeViewProps["onMapStatus"],
) {
  const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY;
  let terrainReady = false;
  let imageryReady = false;

  try {
    const terrainProvider = mapTilerKey
      ? await C.CesiumTerrainProvider.fromUrl(
          `https://api.maptiler.com/tiles/terrain-quantized-mesh-v2/?key=${mapTilerKey}`,
        )
      : await C.ArcGISTiledElevationTerrainProvider.fromUrl(ARCGIS_TERRAIN);
    let terrainErrors = 0;
    terrainProvider.errorEvent.addEventListener(() => {
      terrainErrors += 1;
      if (terrainErrors >= 3 && !(viewer.terrainProvider instanceof C.EllipsoidTerrainProvider)) {
        viewer.terrainProvider = new C.EllipsoidTerrainProvider();
        onMapStatus("fallback");
      }
    });
    viewer.terrainProvider = terrainProvider;
    terrainReady = true;
  } catch {
    viewer.terrainProvider = new C.EllipsoidTerrainProvider();
  }

  try {
    const imagery = mapTilerKey
      ? directImageryProvider(
          C,
          `https://api.maptiler.com/maps/satellite-v2/{z}/{x}/{y}.jpg?key=${mapTilerKey}`,
          "MapTiler | © OpenStreetMap contributors",
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        )
      : directImageryProvider(
          C,
          `${ARCGIS_IMAGERY}/tile/{z}/{y}/{x}`,
          "Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics | © OpenStreetMap contributors",
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        );
    viewer.imageryLayers.addImageryProvider(imagery);
    imageryReady = true;
  } catch {
    try {
      viewer.imageryLayers.addImageryProvider(
        directImageryProvider(
          C,
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          "© OpenStreetMap contributors",
        ),
      );
      imageryReady = true;
    } catch {
      // The bundled Natural Earth layer remains available when all tile services fail.
    }
  }
  onMapStatus(terrainReady && imageryReady ? "online" : "fallback");
}

function fitFlight(
  C: CesiumModule,
  viewer: import("cesium").Viewer,
  flight: FlightData,
  duration = 1.2,
) {
  const stride = Math.max(1, Math.ceil(flight.points.length / 4_000));
  const positions = flight.points
    .filter((_, index) => index % stride === 0)
    .map((point) =>
      C.Cartesian3.fromDegrees(point.longitude, point.latitude, renderHeight(point) + 2),
    );
  const sphere = C.BoundingSphere.fromPoints(positions);
  const centre = C.Cartographic.fromCartesian(sphere.center);
  const range = Math.max(260, sphere.radius * 3.4);
  viewer.camera.flyTo({
    destination: C.Cartesian3.fromRadians(centre.longitude, centre.latitude, centre.height + range),
    duration,
    orientation: { heading: 0, pitch: -C.Math.PI_OVER_TWO, roll: 0 },
  });
}

export function GlobeView({
  flight,
  currentPoint,
  cameraMode,
  trackMetric,
  onMapStatus,
  onGroundElevation,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  const viewerRef = useRef<import("cesium").Viewer | null>(null);
  const markerRef = useRef<import("cesium").Entity | null>(null);
  const trackRef = useRef<import("cesium").PolylineCollection | null>(null);
  const trackMetricRef = useRef(trackMetric);
  const latestGroundSample = useRef(0);
  const [sceneError, setSceneError] = useState<string | null>(null);
  trackMetricRef.current = trackMetric;

  useEffect(() => {
    let cancelled = false;
    let viewer: import("cesium").Viewer | null = null;
    setSceneError(null);

    const initialise = async () => {
      const C = await import("cesium");
      if (cancelled || !containerRef.current) return;
      C.Ion.defaultAccessToken = "";
      cesiumRef.current = C;
      viewer = new C.Viewer(containerRef.current, {
        animation: false,
        baseLayer: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        scene3DOnly: true,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        terrainProvider: new C.EllipsoidTerrainProvider(),
      });
      viewerRef.current = viewer;
      viewer.scene.globe.baseColor = C.Color.fromCssColorString("#0b171c");
      viewer.scene.globe.depthTestAgainstTerrain = true;
      viewer.scene.globe.maximumScreenSpaceError = 3;
      viewer.scene.highDynamicRange = true;
      viewer.scene.fog.enabled = true;
      viewer.scene.fog.density = 0.0002;
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.hueShift = -0.05;
        viewer.scene.skyAtmosphere.saturationShift = -0.45;
        viewer.scene.skyAtmosphere.brightnessShift = -0.4;
      }
      viewer.shadows = false;
      viewer.resolutionScale = Math.min(window.devicePixelRatio, 1.5);
      viewer.targetFrameRate = window.matchMedia("(pointer: coarse)").matches ? 30 : 60;

      try {
        const localImagery = await C.TileMapServiceImageryProvider.fromUrl(
          `${window.CESIUM_BASE_URL}Assets/Textures/NaturalEarthII`,
        );
        if (!cancelled) viewer.imageryLayers.addImageryProvider(localImagery);
      } catch {
        // The globe base color is the final no-network fallback.
      }

      trackRef.current = addTrack(C, viewer, flight, trackMetricRef.current);
      markerRef.current = viewer.entities.add({
        position: C.Cartesian3.fromDegrees(
          flight.points[0].longitude,
          flight.points[0].latitude,
          renderHeight(flight.points[0]) + 4,
        ),
        billboard: {
          image: markerSvg,
          width: 42,
          height: 42,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          verticalOrigin: C.VerticalOrigin.CENTER,
        },
      });
      fitFlight(
        C,
        viewer,
        flight,
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.2,
      );
      configureMap(C, viewer, onMapStatus).catch(() => onMapStatus("fallback"));
    };

    initialise().catch((error) => {
      onMapStatus("fallback");
      setSceneError(
        error instanceof Error
          ? error.message
          : "La scène 3D n’est pas disponible dans ce navigateur.",
      );
    });
    return () => {
      cancelled = true;
      viewerRef.current = null;
      markerRef.current = null;
      trackRef.current = null;
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [flight, onMapStatus]);

  useEffect(() => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!C || !viewer) return;
    if (trackRef.current) viewer.scene.primitives.remove(trackRef.current);
    trackRef.current = addTrack(C, viewer, flight, trackMetric);
  }, [flight, trackMetric]);

  useEffect(() => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    const marker = markerRef.current;
    if (!C || !viewer || !marker || !currentPoint) return;
    const height = renderHeight(currentPoint) + 4;
    const destination = C.Cartesian3.fromDegrees(
      currentPoint.longitude,
      currentPoint.latitude,
      height,
    );
    marker.position = new C.ConstantPositionProperty(destination);
    const course = currentPoint.sourceCourse ?? currentPoint.calculatedCourse ?? 0;
    if (marker.billboard) {
      marker.billboard.rotation = new C.ConstantProperty(C.Math.toRadians(-course));
    }

    const controller = viewer.scene.screenSpaceCameraController;
    controller.enableInputs = cameraMode === "free" || cameraMode === "overview";
    if (cameraMode === "pilot") {
      const speed = currentPoint.sourceSpeed ?? currentPoint.calculatedSpeed ?? 0;
      const turnRate = C.Math.toRadians(currentPoint.turnRate ?? 0);
      const roll = Math.max(-0.44, Math.min(0.44, Math.atan((speed * turnRate) / 9.81)));
      viewer.camera.setView({
        destination: C.Cartesian3.fromDegrees(
          currentPoint.longitude,
          currentPoint.latitude,
          height + 1.7,
        ),
        orientation: { heading: C.Math.toRadians(course), pitch: -0.025, roll: -roll },
      });
    } else if (cameraMode === "chase") {
      viewer.camera.lookAt(
        destination,
        new C.HeadingPitchRange(C.Math.toRadians(course + 180), -0.25, 135),
      );
    } else if (cameraMode === "bird") {
      viewer.camera.lookAt(
        destination,
        new C.HeadingPitchRange(C.Math.toRadians(course + 180), -1.18, 650),
      );
    } else if (cameraMode === "free") {
      viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
    }

    const now = performance.now();
    if (now - latestGroundSample.current > 600) {
      latestGroundSample.current = now;
      const ground = viewer.scene.globe.getHeight(
        C.Cartographic.fromDegrees(currentPoint.longitude, currentPoint.latitude),
      );
      onGroundElevation(Number.isFinite(ground) ? (ground ?? null) : null);
    }
  }, [cameraMode, currentPoint, onGroundElevation]);

  useEffect(() => {
    if (cameraMode !== "overview") return;
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!C || !viewer) return;
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
    fitFlight(
      C,
      viewer,
      flight,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.8,
    );
  }, [cameraMode, flight]);

  return (
    <>
      <div
        className="globe-view"
        ref={containerRef}
        role="img"
        aria-label="Vue tridimensionnelle du vol"
      />
      {sceneError && (
        <div className="globe-error" role="alert">
          <strong>Scène 3D indisponible</strong>
          <span>{sceneError}</span>
          <small>La trace et les instruments restent consultables.</small>
        </div>
      )}
    </>
  );
}
