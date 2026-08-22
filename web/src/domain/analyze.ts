import { bearingDegrees, distanceMetres, shortestAngle } from "./geo";
import type { FlightData, FlightPoint, FlightSummary } from "./types";

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? (ordered[middle - 1] + ordered[middle]) / 2 : ordered[middle];
};

function localLinearSlope(points: FlightPoint[], centre: number, halfWindowSeconds: number) {
  const centreTime = points[centre].time;
  if (centreTime === null) return null;
  const samples: Array<[number, number]> = [];

  for (let index = centre; index >= 0; index -= 1) {
    const point = points[index];
    if (point.segmentIndex !== points[centre].segmentIndex || point.time === null) break;
    const offset = (point.time - centreTime) / 1_000;
    if (Math.abs(offset) > halfWindowSeconds) break;
    if (point.elevation !== null) samples.unshift([offset, point.elevation]);
  }
  for (let index = centre + 1; index < points.length; index += 1) {
    const point = points[index];
    if (point.segmentIndex !== points[centre].segmentIndex || point.time === null) break;
    const offset = (point.time - centreTime) / 1_000;
    if (Math.abs(offset) > halfWindowSeconds) break;
    if (point.elevation !== null) samples.push([offset, point.elevation]);
  }

  if (samples.length < 3) return null;
  const count = samples.length;
  const sumX = samples.reduce((sum, [x]) => sum + x, 0);
  const sumY = samples.reduce((sum, [, y]) => sum + y, 0);
  const sumXX = samples.reduce((sum, [x]) => sum + x * x, 0);
  const sumXY = samples.reduce((sum, [x, y]) => sum + x * y, 0);
  const denominator = count * sumXX - sumX * sumX;
  if (Math.abs(denominator) < Number.EPSILON) return null;
  return (count * sumXY - sumX * sumY) / denominator;
}

export function analyzeFlight(data: Omit<FlightData, "summary">): FlightData {
  const { points } = data;
  const positiveIntervals: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (
      previous.segmentIndex === point.segmentIndex &&
      previous.time !== null &&
      point.time !== null &&
      point.time > previous.time
    ) {
      positiveIntervals.push((point.time - previous.time) / 1_000);
    }
  }
  const medianInterval = median(positiveIntervals) ?? 1;
  const gapThreshold = Math.max(30, medianInterval * 5);

  let totalDistance = 0;
  let movingDuration = 0;
  let elevationGain = 0;
  let elevationLoss = 0;
  let hasElevationDelta = false;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (previous.segmentIndex !== point.segmentIndex) continue;
    const edgeDistance = distanceMetres(
      previous.latitude,
      previous.longitude,
      point.latitude,
      point.longitude,
    );
    totalDistance += edgeDistance;
    point.distance = totalDistance;
    point.calculatedCourse =
      edgeDistance >= 2
        ? bearingDegrees(previous.latitude, previous.longitude, point.latitude, point.longitude)
        : null;

    if (previous.elevation !== null && point.elevation !== null) {
      const delta = point.elevation - previous.elevation;
      hasElevationDelta = true;
      if (delta > 0) elevationGain += delta;
      else elevationLoss += Math.abs(delta);
    }

    if (previous.time === null || point.time === null) continue;
    const interval = (point.time - previous.time) / 1_000;
    if (interval <= 0) continue;
    point.gapBefore = interval > gapThreshold;
    if (point.gapBefore) continue;
    point.calculatedSpeed = edgeDistance / interval;
    if ((point.sourceSpeed ?? point.calculatedSpeed) > 0.5) movingDuration += interval;
  }

  for (let index = 0; index < points.length; index += 1) {
    points[index].verticalSpeed = localLinearSlope(points, index, 5);
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (
      previous.segmentIndex !== point.segmentIndex ||
      previous.calculatedCourse === null ||
      point.calculatedCourse === null ||
      previous.time === null ||
      point.time === null ||
      (point.calculatedSpeed ?? 0) < 2
    )
      continue;
    const interval = (point.time - previous.time) / 1_000;
    if (interval > 0 && !point.gapBefore) {
      point.turnRate = shortestAngle(previous.calculatedCourse, point.calculatedCourse) / interval;
    }
  }

  const timedPoints = points.filter((point) => point.time !== null);
  const startTime = timedPoints[0]?.time ?? null;
  const endTime = timedPoints.at(-1)?.time ?? null;
  const duration =
    startTime !== null && endTime !== null && endTime >= startTime
      ? (endTime - startTime) / 1_000
      : null;
  const calculatedSpeeds = points.flatMap((point) =>
    point.calculatedSpeed === null ? [] : [point.calculatedSpeed],
  );
  const sourceSpeeds = points.flatMap((point) =>
    point.sourceSpeed === null ? [] : [point.sourceSpeed],
  );
  const verticalSpeeds = points.flatMap((point) =>
    point.verticalSpeed === null ? [] : [point.verticalSpeed],
  );

  const summary: FlightSummary = {
    pointCount: points.length,
    segmentCount: data.segmentStarts.length,
    startTime,
    endTime,
    duration,
    distance: totalDistance,
    movingDuration: timedPoints.length > 1 ? movingDuration : null,
    averageCalculatedSpeed: duration && duration > 0 ? totalDistance / duration : null,
    maximumCalculatedSpeed: calculatedSpeeds.length ? Math.max(...calculatedSpeeds) : null,
    maximumSourceSpeed: sourceSpeeds.length ? Math.max(...sourceSpeeds) : null,
    elevationGain: hasElevationDelta ? elevationGain : null,
    elevationLoss: hasElevationDelta ? elevationLoss : null,
    maximumClimb: verticalSpeeds.length ? Math.max(...verticalSpeeds) : null,
    maximumSink: verticalSpeeds.length ? Math.min(...verticalSpeeds) : null,
  };

  return { ...data, summary };
}
