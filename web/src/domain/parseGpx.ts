import { SaxesParser, type SaxesTagNS } from "saxes";
import { analyzeFlight } from "./analyze";
import type { FlightData, FlightPoint, VerticalReference } from "./types";

const GPX_NAMESPACES = new Set([
  "http://www.topografix.com/GPX/1/0",
  "http://www.topografix.com/GPX/1/1",
  "",
]);
const GARMIN_TRACKPOINT_V2 = "http://www.garmin.com/xmlschemas/TrackPointExtension/v2";

const finiteNumber = (text: string) => {
  if (!text.trim() || text.includes(",")) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
};

const attributeValue = (tag: SaxesTagNS, name: string) => {
  const attribute = tag.attributes[name];
  return typeof attribute === "string" ? attribute : attribute?.value;
};

const emptyPoint = (index: number, segmentIndex: number): FlightPoint => ({
  index,
  segmentIndex,
  latitude: Number.NaN,
  longitude: Number.NaN,
  elevation: null,
  ellipsoidElevation: null,
  time: null,
  sourceSpeed: null,
  sourceCourse: null,
  satellites: null,
  calculatedSpeed: null,
  calculatedCourse: null,
  verticalSpeed: null,
  turnRate: null,
  distance: 0,
  gapBefore: false,
});

function detectVerticalReference(creator: string | null, comments: string[]): VerticalReference {
  const evidence: string[] = [];
  const isBasicAirData = /BasicAirData GPS Logger/i.test(creator ?? "");
  const corrected = comments.find((comment) =>
    /Altitudes?\s*=\s*Corrected\s+using\s+EGM\s*96\s+grid/i.test(comment),
  );
  const raw = comments.find((comment) => /Altitudes?\s*=\s*Raw\b/i.test(comment));

  if (isBasicAirData && corrected && !raw) {
    evidence.push(corrected.trim());
    return { basis: "orthometric", geoidModel: "EGM96", correctionApplied: true, evidence };
  }
  if (isBasicAirData && raw && !corrected) {
    evidence.push(raw.trim());
    return { basis: "ellipsoidal", geoidModel: null, correctionApplied: false, evidence };
  }
  if (corrected) evidence.push(corrected.trim());
  if (raw) evidence.push(raw.trim());
  return { basis: "unknown", geoidModel: null, correctionApplied: null, evidence };
}

export function parseGpx(xml: string, fallbackName = "Vol sans titre"): FlightData {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error("Ce fichier contient une déclaration XML non autorisée.");
  }

  const parser = new SaxesParser({ xmlns: true });
  const stack: SaxesTagNS[] = [];
  const comments: string[] = [];
  const warnings: string[] = [];
  const points: FlightPoint[] = [];
  const segmentStarts: number[] = [];
  let currentPoint: FlightPoint | null = null;
  let text = "";
  let segmentIndex = -1;
  let rootSeen = false;
  let creator: string | null = null;
  let gpxVersion: string | null = null;
  let documentName: string | null = null;
  let trackName: string | null = null;

  parser.on("comment", (comment) => {
    if (comments.join("").length < 16_384) comments.push(comment);
  });
  parser.on("opentag", (tag) => {
    stack.push(tag);
    text = "";
    if (stack.length > 32) throw new Error("Ce fichier GPX est trop profondément imbriqué.");
    if (tag.local === "gpx") {
      rootSeen = true;
      creator = attributeValue(tag, "creator") ?? null;
      gpxVersion = attributeValue(tag, "version") ?? null;
      if (!GPX_NAMESPACES.has(tag.uri)) {
        warnings.push(`Espace de noms GPX inhabituel : ${tag.uri}`);
      }
    } else if (tag.local === "trkseg") {
      segmentIndex += 1;
      segmentStarts.push(points.length);
    } else if (tag.local === "trkpt") {
      currentPoint = emptyPoint(points.length, Math.max(0, segmentIndex));
      const latitude = finiteNumber(attributeValue(tag, "lat") ?? "");
      const longitude = finiteNumber(attributeValue(tag, "lon") ?? "");
      currentPoint.latitude = latitude ?? Number.NaN;
      currentPoint.longitude = longitude ?? Number.NaN;
    }
  });
  parser.on("text", (value) => {
    text += value;
  });
  parser.on("cdata", (value) => {
    text += value;
  });
  parser.on("closetag", (tag) => {
    const parent = stack.at(-2);
    const value = text.trim();
    const isGpxElement = GPX_NAMESPACES.has(tag.uri);
    const isSourceMetric = isGpxElement || tag.uri === GARMIN_TRACKPOINT_V2;

    if (currentPoint) {
      if (isGpxElement && tag.local === "ele") currentPoint.elevation = finiteNumber(value);
      else if (isGpxElement && tag.local === "time") {
        const hasTimezone = /(Z|[+-]\d{2}:\d{2})$/i.test(value);
        const parsed = hasTimezone ? Date.parse(value) : Number.NaN;
        currentPoint.time = Number.isFinite(parsed) ? parsed : null;
        if (value && currentPoint.time === null) warnings.push(`Horodatage non reconnu : ${value}`);
      } else if (isSourceMetric && tag.local === "speed") {
        const speed = finiteNumber(value);
        currentPoint.sourceSpeed = speed !== null && speed >= 0 ? speed : null;
        if (isGpxElement && gpxVersion === "1.1") {
          warnings.push("Vitesse directe non standard rencontrée dans un GPX 1.1.");
        }
      } else if (isSourceMetric && tag.local === "course") {
        const course = finiteNumber(value);
        currentPoint.sourceCourse = course !== null && course >= 0 && course <= 360 ? course : null;
      } else if (isGpxElement && tag.local === "sat") {
        const satellites = finiteNumber(value);
        currentPoint.satellites = satellites !== null ? Math.round(satellites) : null;
      }
    }

    if (tag.local === "name" && (parent?.local === "gpx" || parent?.local === "metadata"))
      documentName = value || null;
    if (tag.local === "name" && parent?.local === "trk" && !trackName) trackName = value || null;
    if (tag.local === "trkpt" && currentPoint) {
      if (
        Number.isFinite(currentPoint.latitude) &&
        currentPoint.latitude >= -90 &&
        currentPoint.latitude <= 90 &&
        Number.isFinite(currentPoint.longitude) &&
        currentPoint.longitude >= -180 &&
        currentPoint.longitude <= 180
      ) {
        points.push(currentPoint);
      } else {
        warnings.push(`Point ${currentPoint.index + 1} ignoré : coordonnées invalides.`);
      }
      currentPoint = null;
    }
    stack.pop();
    text = "";
  });
  parser.write(xml).close();

  if (!rootSeen) throw new Error("Ce fichier ne contient pas de racine GPX valide.");
  if (points.length < 2) throw new Error("La trace doit contenir au moins deux points valides.");
  if (segmentStarts.length === 0) segmentStarts.push(0);

  const elevations = points.flatMap((point) => (point.elevation === null ? [] : [point.elevation]));
  const bounds = {
    south: Math.min(...points.map((point) => point.latitude)),
    west: Math.min(...points.map((point) => point.longitude)),
    north: Math.max(...points.map((point) => point.latitude)),
    east: Math.max(...points.map((point) => point.longitude)),
    minElevation: elevations.length ? Math.min(...elevations) : null,
    maxElevation: elevations.length ? Math.max(...elevations) : null,
  };
  if (points.some((point) => point.time === null)) {
    warnings.push("Certains points n’ont pas d’heure exploitable; la lecture sera limitée.");
  }
  if (elevations.length !== points.length) {
    warnings.push(
      "Certains points n’ont pas d’altitude; les mesures verticales seront partielles.",
    );
  }

  return analyzeFlight({
    schemaVersion: 2,
    name: trackName ?? documentName ?? fallbackName,
    creator,
    gpxVersion,
    verticalReference: detectVerticalReference(creator, comments),
    points,
    segmentStarts,
    bounds,
    warnings: [...new Set(warnings)],
  });
}
