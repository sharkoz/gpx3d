const EARTH_RADIUS_METRES = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const normalizeHeading = (degrees: number) => ((degrees % 360) + 360) % 360;

export const shortestAngle = (from: number, to: number) =>
  ((((to - from) % 360) + 540) % 360) - 180;

export function distanceMetres(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const phiA = toRadians(latitudeA);
  const phiB = toRadians(latitudeB);
  const deltaPhi = phiB - phiA;
  const deltaLambda = toRadians(((((longitudeB - longitudeA) % 360) + 540) % 360) - 180);
  const haversine =
    Math.sin(deltaPhi / 2) ** 2 + Math.cos(phiA) * Math.cos(phiB) * Math.sin(deltaLambda / 2) ** 2;

  return 2 * EARTH_RADIUS_METRES * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function bearingDegrees(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const phiA = toRadians(latitudeA);
  const phiB = toRadians(latitudeB);
  const deltaLambda = toRadians(((((longitudeB - longitudeA) % 360) + 540) % 360) - 180);
  const y = Math.sin(deltaLambda) * Math.cos(phiB);
  const x =
    Math.cos(phiA) * Math.sin(phiB) - Math.sin(phiA) * Math.cos(phiB) * Math.cos(deltaLambda);

  if (Math.abs(x) < Number.EPSILON && Math.abs(y) < Number.EPSILON) return null;
  return normalizeHeading((Math.atan2(y, x) * 180) / Math.PI);
}

export function interpolateLongitude(from: number, to: number, fraction: number) {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return ((((from + delta * fraction) % 360) + 540) % 360) - 180;
}
