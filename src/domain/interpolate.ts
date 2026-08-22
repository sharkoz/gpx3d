import { interpolateLongitude, shortestAngle } from "./geo";
import type { FlightPoint } from "./types";

export type InterpolatedPoint = FlightPoint & { fraction: number };

export function pointAtTime(points: FlightPoint[], time: number): InterpolatedPoint | null {
  const timed = points.filter(
    (point): point is FlightPoint & { time: number } => point.time !== null,
  );
  if (timed.length === 0) return null;
  const first = timed[0];
  const last = timed[timed.length - 1];
  if (time <= first.time) return { ...first, fraction: 0 };
  if (time >= last.time) return { ...last, fraction: 1 };

  let low = 0;
  let high = timed.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (timed[middle].time <= time) low = middle;
    else high = middle;
  }

  const from = timed[low];
  const to = timed[high];
  if (to.segmentIndex !== from.segmentIndex || to.gapBefore || to.time === from.time) {
    return { ...from, fraction: 0 };
  }
  const fraction = (time - from.time) / (to.time - from.time);
  const interpolate = (a: number | null, b: number | null) =>
    a === null || b === null ? (a ?? b) : a + (b - a) * fraction;
  const courseFrom = from.sourceCourse ?? from.calculatedCourse;
  const courseTo = to.sourceCourse ?? to.calculatedCourse;

  return {
    ...from,
    latitude: from.latitude + (to.latitude - from.latitude) * fraction,
    longitude: interpolateLongitude(from.longitude, to.longitude, fraction),
    elevation: interpolate(from.elevation, to.elevation),
    sourceSpeed: interpolate(from.sourceSpeed, to.sourceSpeed),
    calculatedSpeed: interpolate(from.calculatedSpeed, to.calculatedSpeed),
    verticalSpeed: interpolate(from.verticalSpeed, to.verticalSpeed),
    turnRate: interpolate(from.turnRate, to.turnRate),
    distance: from.distance + (to.distance - from.distance) * fraction,
    calculatedCourse:
      courseFrom === null || courseTo === null
        ? (courseFrom ?? courseTo)
        : courseFrom + shortestAngle(courseFrom, courseTo) * fraction,
    fraction,
  };
}
