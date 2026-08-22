import { useEffect, useRef, useState } from "react";
import { bankAngle, trajectoryPitch } from "@/domain/attitude";
import type { InterpolatedPoint } from "@/domain/interpolate";
import type { AircraftModelId, FlightData, FlightPoint } from "@/domain/types";
import { aircraftModelUris } from "./aircraftModels";

export type CameraMode = "overview" | "bird" | "chase" | "pilot" | "free";
export type TrackMetric = "altitude" | "speed" | "time" | "heading";
export type MapStatus = "loading" | "online" | "fallback";
export type BuildingsStatus = "idle" | "loading" | "ready" | "empty" | "error";
export type BuildingAnchor = { latitude: number; longitude: number };

type CesiumModule = typeof import("cesium");

type GlobeViewProps = {
  flight: FlightData;
  currentPoint: InterpolatedPoint | null;
  cameraMode: CameraMode;
  trackMetric: TrackMetric;
  altitudeOffset: number;
  aircraftModelId: AircraftModelId;
  pilotLookResetKey: number;
  buildingsEnabled: boolean;
  buildingsAnchor: BuildingAnchor;
  onMapStatus: (status: MapStatus) => void;
  onGroundElevation: (elevation: number | null) => void;
  onDepartureGroundElevation: (elevation: number | null) => void;
  onBuildingsStatus: (status: BuildingsStatus, count: number) => void;
};

const ARCGIS_TERRAIN =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
const ARCGIS_IMAGERY =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
const OVERPASS_APIS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const markerSvg = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <path d="M32 3 40 25 58 33 58 39 39 36 36 54 42 58 42 61 32 59 22 61 22 58 28 54 25 36 6 39 6 33 24 25Z" fill="#ffbd59" stroke="#071319" stroke-width="3" stroke-linejoin="round"/>
  </svg>
`)}`;

const renderHeight = (
  point: Pick<FlightPoint, "elevation" | "ellipsoidElevation">,
  altitudeOffset: number,
) => (point.ellipsoidElevation ?? point.elevation ?? 0) + altitudeOffset;

function flightAttitude(point: FlightPoint) {
  const speed = point.sourceSpeed ?? point.calculatedSpeed;
  return {
    course: point.sourceCourse ?? point.calculatedCourse,
    pitch: trajectoryPitch(point.verticalSpeed, speed),
    roll: bankAngle(speed, point.turnRate),
  };
}

function aircraftTransform(
  C: CesiumModule,
  destination: import("cesium").Cartesian3,
  course: number,
  pitch: number,
  roll: number,
) {
  return C.Transforms.headingPitchRollToFixedFrame(
    destination,
    new C.HeadingPitchRoll(C.Math.toRadians(course - 90), pitch, roll),
  );
}

function movementAxis(C: CesiumModule, destination: import("cesium").Cartesian3, course: number) {
  const heading = C.Math.toRadians(course);
  const localDirection = new C.Cartesian3(Math.sin(heading), Math.cos(heading), 0);
  const transform = C.Transforms.eastNorthUpToFixedFrame(destination);
  return C.Cartesian3.normalize(
    C.Matrix4.multiplyByPointAsVector(transform, localDirection, new C.Cartesian3()),
    new C.Cartesian3(),
  );
}

function applyPilotCamera(
  C: CesiumModule,
  viewer: import("cesium").Viewer,
  point: InterpolatedPoint,
  altitudeOffset: number,
  lookOffset: { heading: number; pitch: number },
) {
  const { course, roll } = flightAttitude(point);
  const heading = course ?? 0;
  viewer.camera.setView({
    destination: C.Cartesian3.fromDegrees(
      point.longitude,
      point.latitude,
      renderHeight(point, altitudeOffset) + 5.7,
    ),
    orientation: {
      heading: C.Math.toRadians(heading) + lookOffset.heading,
      pitch: -0.025 + lookOffset.pitch,
      roll,
    },
  });
}

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
    maximumLevel: 16,
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
  altitudeOffset: number,
) {
  const [minimum, maximum] = metricRange(flight.points, metric);
  const step = Math.max(1, Math.ceil(flight.points.length / 1_200));
  const instances: import("cesium").GeometryInstance[] = [];

  for (let index = step; index < flight.points.length; index += step) {
    const from = flight.points[index - step];
    const to = flight.points[index];
    if (from.segmentIndex !== to.segmentIndex) continue;
    const fromHeight = renderHeight(from, altitudeOffset) + 2;
    const toHeight = renderHeight(to, altitudeOffset) + 2;
    instances.push(
      new C.GeometryInstance({
        geometry: new C.PolylineGeometry({
          positions: [
            C.Cartesian3.fromDegrees(from.longitude, from.latitude, fromHeight),
            C.Cartesian3.fromDegrees(to.longitude, to.latitude, toHeight),
          ],
          width: 3.5,
          vertexFormat: C.PolylineColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(
            trackColor(C, metricValue(to, metric), minimum, maximum),
          ),
        },
      }),
    );
  }
  if (instances.length === 0) return null;
  return viewer.scene.primitives.add(
    new C.Primitive({
      geometryInstances: instances,
      appearance: new C.PolylineColorAppearance({ translucent: true }),
      allowPicking: false,
      asynchronous: true,
    }),
  );
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

async function sampleGroundHeight(
  C: CesiumModule,
  viewer: import("cesium").Viewer,
  point: Pick<FlightPoint, "latitude" | "longitude">,
) {
  if (viewer.terrainProvider instanceof C.EllipsoidTerrainProvider) return null;
  const position = C.Cartographic.fromDegrees(point.longitude, point.latitude);
  try {
    const [sampledPosition] = await C.sampleTerrain(viewer.terrainProvider, 14, [position]);
    return Number.isFinite(sampledPosition?.height) ? sampledPosition.height : null;
  } catch {
    const cachedGround = viewer.scene.globe.getHeight(position);
    return Number.isFinite(cachedGround) ? (cachedGround ?? null) : null;
  }
}

type OverpassBuilding = {
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
};

const parseMetres = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

async function loadOsmBuildings(
  C: CesiumModule,
  anchor: BuildingAnchor,
  groundElevation: number,
  signal: AbortSignal,
) {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const latitudeRadius = 0.004;
  const longitudeRadius =
    latitudeRadius / Math.max(0.25, Math.cos(C.Math.toRadians(anchor.latitude)));
  const south = anchor.latitude - latitudeRadius;
  const north = anchor.latitude + latitudeRadius;
  const west = anchor.longitude - longitudeRadius;
  const east = anchor.longitude + longitudeRadius;
  const query = `[out:json][timeout:20];way["building"](${south},${west},${north},${east});out tags geom 40;`;
  let payload: { elements?: OverpassBuilding[] } | null = null;
  for (const endpoint of OVERPASS_APIS) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const requestController = new AbortController();
    const abortRequest = () => requestController.abort();
    const timeout = window.setTimeout(abortRequest, 15_000);
    signal.addEventListener("abort", abortRequest, { once: true });
    try {
      const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, {
        signal: requestController.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) continue;
      payload = (await response.json()) as { elements?: OverpassBuilding[] };
      break;
    } catch (error) {
      if (signal.aborted) throw error;
    } finally {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", abortRequest);
    }
  }
  if (!payload) throw new Error("Overpass unavailable");
  const instances: import("cesium").GeometryInstance[] = [];
  for (const building of payload.elements?.slice(0, 40) ?? []) {
    if (!building.geometry || building.geometry.length < 3) continue;
    const positions = building.geometry.flatMap(({ lon, lat }) => [lon, lat]);
    const levels = parseMetres(building.tags?.["building:levels"]);
    const minimumLevels = parseMetres(building.tags?.["building:min_level"]);
    const minimumHeight = parseMetres(building.tags?.min_height) ?? (minimumLevels ?? 0) * 3;
    const taggedTopHeight = parseMetres(building.tags?.height) ?? (levels ? levels * 3 : null);
    const topHeight = Math.max(minimumHeight + 2.5, taggedTopHeight ?? minimumHeight + 7.5);
    instances.push(
      new C.GeometryInstance({
        id: `osm-building-${building.id}`,
        geometry: new C.PolygonGeometry({
          polygonHierarchy: new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(positions)),
          height: groundElevation + minimumHeight,
          extrudedHeight: groundElevation + topHeight,
          vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(
            C.Color.fromCssColorString("#aeb8b4").withAlpha(0.8),
          ),
        },
      }),
    );
  }
  return {
    count: instances.length,
    primitive:
      instances.length > 0
        ? new C.Primitive({
            geometryInstances: instances,
            appearance: new C.PerInstanceColorAppearance({
              closed: true,
              flat: true,
              translucent: true,
            }),
            allowPicking: false,
            asynchronous: true,
          })
        : null,
  };
}

function fitFlight(
  C: CesiumModule,
  viewer: import("cesium").Viewer,
  flight: FlightData,
  altitudeOffset: number,
  duration = 1.2,
) {
  const stride = Math.max(1, Math.ceil(flight.points.length / 4_000));
  const positions = flight.points
    .filter((_, index) => index % stride === 0)
    .map((point) =>
      C.Cartesian3.fromDegrees(
        point.longitude,
        point.latitude,
        renderHeight(point, altitudeOffset) + 2,
      ),
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
  altitudeOffset,
  aircraftModelId,
  pilotLookResetKey,
  buildingsEnabled,
  buildingsAnchor,
  onMapStatus,
  onGroundElevation,
  onDepartureGroundElevation,
  onBuildingsStatus,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cesiumRef = useRef<CesiumModule | null>(null);
  const viewerRef = useRef<import("cesium").Viewer | null>(null);
  const markerRef = useRef<import("cesium").Entity | null>(null);
  const modelRef = useRef<import("cesium").Model | null>(null);
  const trackRef = useRef<import("cesium").Primitive | null>(null);
  const buildingsRef = useRef<import("cesium").Primitive | null>(null);
  const screenHandlerRef = useRef<import("cesium").ScreenSpaceEventHandler | null>(null);
  const trackMetricRef = useRef(trackMetric);
  const altitudeOffsetRef = useRef(altitudeOffset);
  const currentPointRef = useRef(currentPoint);
  const cameraModeRef = useRef(cameraMode);
  const headingRef = useRef(0);
  const modelGeneration = useRef(0);
  const latestGroundSample = useRef(0);
  const groundSampleId = useRef(0);
  const departureSampleId = useRef(0);
  const pilotDragging = useRef(false);
  const pilotPointer = useRef<{ x: number; y: number } | null>(null);
  const pilotLookOffset = useRef({ heading: 0, pitch: 0 });
  const pilotResetRef = useRef(pilotLookResetKey);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [sceneReady, setSceneReady] = useState(false);
  trackMetricRef.current = trackMetric;
  altitudeOffsetRef.current = altitudeOffset;
  currentPointRef.current = currentPoint;
  cameraModeRef.current = cameraMode;

  useEffect(() => {
    let cancelled = false;
    let viewer: import("cesium").Viewer | null = null;
    setSceneError(null);
    setSceneReady(false);

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
        requestRenderMode: true,
        maximumRenderTimeChange: Number.POSITIVE_INFINITY,
      });
      viewerRef.current = viewer;
      const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
      viewer.scene.globe.baseColor = C.Color.fromCssColorString("#0b171c");
      viewer.scene.globe.depthTestAgainstTerrain = true;
      viewer.scene.globe.maximumScreenSpaceError = coarsePointer ? 14 : 10;
      viewer.scene.highDynamicRange = true;
      viewer.scene.fog.enabled = true;
      viewer.scene.fog.density = 0.0002;
      if (viewer.scene.skyAtmosphere) {
        viewer.scene.skyAtmosphere.hueShift = -0.05;
        viewer.scene.skyAtmosphere.saturationShift = -0.45;
        viewer.scene.skyAtmosphere.brightnessShift = -0.4;
      }
      viewer.shadows = false;
      viewer.resolutionScale = Math.min(window.devicePixelRatio, 1);
      viewer.targetFrameRate = 30;
      headingRef.current =
        flight.points[0].sourceCourse ?? flight.points[0].calculatedCourse ?? headingRef.current;
      pilotLookOffset.current = { heading: 0, pitch: 0 };

      const screenHandler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
      screenHandlerRef.current = screenHandler;
      screenHandler.setInputAction((event: { position: import("cesium").Cartesian2 }) => {
        if (cameraModeRef.current !== "pilot") return;
        pilotDragging.current = true;
        pilotPointer.current = { x: event.position.x, y: event.position.y };
      }, C.ScreenSpaceEventType.LEFT_DOWN);
      screenHandler.setInputAction((movement: { endPosition: import("cesium").Cartesian2 }) => {
        if (!pilotDragging.current || cameraModeRef.current !== "pilot") return;
        const previous = pilotPointer.current;
        pilotPointer.current = { x: movement.endPosition.x, y: movement.endPosition.y };
        if (!previous) return;
        pilotLookOffset.current.heading += (movement.endPosition.x - previous.x) * 0.004;
        pilotLookOffset.current.pitch = Math.max(
          -1.1,
          Math.min(
            1.1,
            pilotLookOffset.current.pitch - (movement.endPosition.y - previous.y) * 0.003,
          ),
        );
        const point = currentPointRef.current;
        const activeViewer = viewerRef.current;
        if (point && activeViewer) {
          applyPilotCamera(
            C,
            activeViewer,
            point,
            altitudeOffsetRef.current,
            pilotLookOffset.current,
          );
          activeViewer.scene.requestRender();
        }
      }, C.ScreenSpaceEventType.MOUSE_MOVE);
      screenHandler.setInputAction(() => {
        pilotDragging.current = false;
        pilotPointer.current = null;
      }, C.ScreenSpaceEventType.LEFT_UP);

      try {
        const localImagery = await C.TileMapServiceImageryProvider.fromUrl(
          `${window.CESIUM_BASE_URL}Assets/Textures/NaturalEarthII`,
        );
        if (!cancelled) viewer.imageryLayers.addImageryProvider(localImagery);
      } catch {
        // The globe base color is the final no-network fallback.
      }

      trackRef.current = addTrack(
        C,
        viewer,
        flight,
        trackMetricRef.current,
        altitudeOffsetRef.current,
      );
      markerRef.current = viewer.entities.add({
        position: C.Cartesian3.fromDegrees(
          flight.points[0].longitude,
          flight.points[0].latitude,
          renderHeight(flight.points[0], altitudeOffsetRef.current) + 4,
        ),
        billboard: {
          image: markerSvg,
          width: 42,
          height: 42,
          rotation: 0,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          distanceDisplayCondition: new C.DistanceDisplayCondition(0, Number.POSITIVE_INFINITY),
          verticalOrigin: C.VerticalOrigin.CENTER,
        },
      });
      fitFlight(
        C,
        viewer,
        flight,
        altitudeOffsetRef.current,
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1.2,
      );
      await configureMap(C, viewer, onMapStatus).catch(() => onMapStatus("fallback"));
      if (!cancelled) setSceneReady(true);
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
      modelGeneration.current += 1;
      groundSampleId.current += 1;
      departureSampleId.current += 1;
      latestGroundSample.current = 0;
      if (screenHandlerRef.current && !screenHandlerRef.current.isDestroyed()) {
        screenHandlerRef.current.destroy();
      }
      screenHandlerRef.current = null;
      viewerRef.current = null;
      markerRef.current = null;
      modelRef.current = null;
      trackRef.current = null;
      buildingsRef.current = null;
      if (viewer && !viewer.isDestroyed()) viewer.destroy();
    };
  }, [flight, onMapStatus]);

  useEffect(() => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!C || !viewer) return;
    if (trackRef.current) viewer.scene.primitives.remove(trackRef.current);
    trackRef.current = addTrack(C, viewer, flight, trackMetric, altitudeOffset);
    viewer.scene.requestRender();
  }, [altitudeOffset, flight, trackMetric]);

  useEffect(() => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    const marker = markerRef.current;
    if (!sceneReady || !C || !viewer || !marker) return;
    const generation = ++modelGeneration.current;
    if (modelRef.current) {
      viewer.scene.primitives.remove(modelRef.current);
      modelRef.current = null;
    }
    if (marker.billboard) {
      marker.billboard.distanceDisplayCondition = new C.ConstantProperty(
        new C.DistanceDisplayCondition(0, Number.POSITIVE_INFINITY),
      );
    }
    const point = currentPointRef.current ?? flight.points[0];
    const destination = C.Cartesian3.fromDegrees(
      point.longitude,
      point.latitude,
      renderHeight(point, altitudeOffsetRef.current) + 4,
    );
    const attitude = flightAttitude(point);
    const course = attitude.course ?? headingRef.current;
    void C.Model.fromGltfAsync({
      url: aircraftModelUris[aircraftModelId],
      modelMatrix: aircraftTransform(C, destination, course, attitude.pitch, attitude.roll),
      upAxis: C.Axis.Z,
      forwardAxis: C.Axis.X,
      minimumPixelSize: 44,
      maximumScale: 1_500,
      distanceDisplayCondition: new C.DistanceDisplayCondition(0, 10_000),
      shadows: C.ShadowMode.DISABLED,
      silhouetteColor: C.Color.fromCssColorString("#071319"),
      silhouetteSize: 1,
    })
      .then((model) => {
        if (generation !== modelGeneration.current || viewer.isDestroyed()) {
          model.destroy();
          return;
        }
        const latestPoint = currentPointRef.current ?? flight.points[0];
        const latestDestination = C.Cartesian3.fromDegrees(
          latestPoint.longitude,
          latestPoint.latitude,
          renderHeight(latestPoint, altitudeOffsetRef.current) + 4,
        );
        const latestAttitude = flightAttitude(latestPoint);
        const latestCourse = latestAttitude.course ?? headingRef.current;
        model.modelMatrix = aircraftTransform(
          C,
          latestDestination,
          latestCourse,
          latestAttitude.pitch,
          latestAttitude.roll,
        );
        modelRef.current = viewer.scene.primitives.add(model);
        viewer.scene.requestRender();
        if (marker.billboard) {
          marker.billboard.distanceDisplayCondition = new C.ConstantProperty(
            new C.DistanceDisplayCondition(10_000, Number.POSITIVE_INFINITY),
          );
        }
      })
      .catch(() => {
        // The oriented billboard remains visible if WebGL cannot load the local model.
      });
    return () => {
      modelGeneration.current += 1;
      if (modelRef.current && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(modelRef.current);
        modelRef.current = null;
      }
    };
  }, [aircraftModelId, flight, sceneReady]);

  useEffect(() => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!sceneReady || !C || !viewer) return;
    const sampleId = ++departureSampleId.current;
    onDepartureGroundElevation(null);
    void sampleGroundHeight(C, viewer, flight.points[0]).then((ground) => {
      if (sampleId === departureSampleId.current) onDepartureGroundElevation(ground);
    });
    return () => {
      departureSampleId.current += 1;
    };
  }, [flight, onDepartureGroundElevation, sceneReady]);

  useEffect(() => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!sceneReady || !C || !viewer) return;
    if (buildingsRef.current) {
      viewer.scene.primitives.remove(buildingsRef.current);
      buildingsRef.current = null;
    }
    if (!buildingsEnabled) {
      onBuildingsStatus("idle", 0);
      return;
    }
    const controller = new AbortController();
    let loadedPrimitive: import("cesium").Primitive | null = null;
    let removeReadyListener: (() => void) | null = null;
    onBuildingsStatus("loading", 0);
    void sampleGroundHeight(C, viewer, buildingsAnchor)
      .then((ground) => {
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        if (ground === null) throw new Error("Terrain unavailable");
        return loadOsmBuildings(C, buildingsAnchor, ground, controller.signal);
      })
      .then(({ count, primitive }) => {
        if (controller.signal.aborted || viewer.isDestroyed()) {
          primitive?.destroy();
          return;
        }
        if (primitive) {
          loadedPrimitive = viewer.scene.primitives.add(primitive);
          buildingsRef.current = loadedPrimitive;
          viewer.scene.requestRender();
          removeReadyListener = viewer.scene.postRender.addEventListener(() => {
            if (!primitive.ready) return;
            removeReadyListener?.();
            removeReadyListener = null;
            onBuildingsStatus("ready", count);
          });
        } else {
          onBuildingsStatus("empty", 0);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) onBuildingsStatus("error", 0);
      });
    return () => {
      controller.abort();
      removeReadyListener?.();
      if (buildingsRef.current === loadedPrimitive) buildingsRef.current = null;
      if (loadedPrimitive && !viewer.isDestroyed()) {
        viewer.scene.primitives.remove(loadedPrimitive);
      }
    };
  }, [buildingsAnchor, buildingsEnabled, onBuildingsStatus, sceneReady]);

  useEffect(() => {
    pilotResetRef.current = pilotLookResetKey;
    pilotLookOffset.current = { heading: 0, pitch: 0 };
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    const point = currentPointRef.current;
    if (C && viewer && point && cameraModeRef.current === "pilot") {
      applyPilotCamera(C, viewer, point, altitudeOffsetRef.current, pilotLookOffset.current);
      viewer.scene.requestRender();
    }
  }, [pilotLookResetKey]);

  useEffect(() => {
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    const marker = markerRef.current;
    if (!sceneReady || !C || !viewer || !marker || !currentPoint) return;
    const height = renderHeight(currentPoint, altitudeOffset) + 4;
    const destination = C.Cartesian3.fromDegrees(
      currentPoint.longitude,
      currentPoint.latitude,
      height,
    );
    marker.position = new C.ConstantPositionProperty(destination);
    const attitude = flightAttitude(currentPoint);
    if (attitude.course !== null) headingRef.current = attitude.course;
    const course = headingRef.current;
    if (marker.billboard) {
      marker.billboard.rotation = new C.ConstantProperty(0);
      marker.billboard.alignedAxis = new C.ConstantProperty(movementAxis(C, destination, course));
    }
    if (modelRef.current) {
      modelRef.current.modelMatrix = aircraftTransform(
        C,
        destination,
        course,
        attitude.pitch,
        attitude.roll,
      );
    }

    const controller = viewer.scene.screenSpaceCameraController;
    controller.enableInputs = cameraMode === "free" || cameraMode === "overview";
    if (cameraMode === "pilot") {
      viewer.camera.cancelFlight();
      applyPilotCamera(C, viewer, currentPoint, altitudeOffset, pilotLookOffset.current);
    } else if (cameraMode === "chase") {
      viewer.camera.cancelFlight();
      viewer.camera.lookAt(
        destination,
        new C.HeadingPitchRange(C.Math.toRadians(course), -0.25, 135),
      );
    } else if (cameraMode === "bird") {
      viewer.camera.cancelFlight();
      viewer.camera.lookAt(
        destination,
        new C.HeadingPitchRange(C.Math.toRadians(course), -1.18, 650),
      );
    } else if (cameraMode === "free") {
      viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
    }
    viewer.scene.requestRender();

    const now = performance.now();
    if (now - latestGroundSample.current > 600) {
      latestGroundSample.current = now;
      const sampleId = ++groundSampleId.current;
      void sampleGroundHeight(C, viewer, currentPoint).then((ground) => {
        if (sampleId === groundSampleId.current) onGroundElevation(ground);
      });
    }
  }, [altitudeOffset, cameraMode, currentPoint, onGroundElevation, sceneReady]);

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
      altitudeOffset,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 0.8,
    );
    viewer.scene.requestRender();
  }, [altitudeOffset, cameraMode, flight]);

  const handlePilotKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (cameraMode !== "pilot") return;
    const headingDelta = event.key === "ArrowLeft" ? -0.12 : event.key === "ArrowRight" ? 0.12 : 0;
    const pitchDelta = event.key === "ArrowUp" ? 0.1 : event.key === "ArrowDown" ? -0.1 : 0;
    const reset = event.key === "Home" || event.key === "0";
    if (headingDelta === 0 && pitchDelta === 0 && !reset) return;
    event.preventDefault();
    pilotLookOffset.current = reset
      ? { heading: 0, pitch: 0 }
      : {
          heading: pilotLookOffset.current.heading + headingDelta,
          pitch: Math.max(-1.1, Math.min(1.1, pilotLookOffset.current.pitch + pitchDelta)),
        };
    const C = cesiumRef.current;
    const viewer = viewerRef.current;
    const point = currentPointRef.current;
    if (C && viewer && point) {
      applyPilotCamera(C, viewer, point, altitudeOffsetRef.current, pilotLookOffset.current);
      viewer.scene.requestRender();
    }
  };

  return (
    <>
      <section
        className={`globe-view ${cameraMode === "pilot" ? "pilot-look-enabled" : ""}`}
        ref={containerRef}
        tabIndex={cameraMode === "pilot" ? 0 : undefined}
        onKeyDown={handlePilotKeyDown}
        aria-label={
          cameraMode === "pilot"
            ? "Vue pilote orientable à la souris ou avec les touches fléchées. Origine pour regarder droit devant."
            : "Vue tridimensionnelle du vol"
        }
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
