import { describe, expect, it } from "vitest";
import { pointAtTime } from "./interpolate";
import type { FlightPoint } from "./types";

const point = (overrides: Partial<FlightPoint>): FlightPoint => ({
  index: 0,
  segmentIndex: 0,
  latitude: 0,
  longitude: 0,
  elevation: 0,
  ellipsoidElevation: 0,
  time: 0,
  sourceSpeed: null,
  sourceCourse: null,
  satellites: null,
  calculatedSpeed: null,
  calculatedCourse: null,
  verticalSpeed: null,
  turnRate: null,
  distance: 0,
  gapBefore: false,
  ...overrides,
});

describe("pointAtTime", () => {
  it("interpole par le chemin court à travers l’antiméridien", () => {
    const result = pointAtTime(
      [point({ longitude: 179, time: 0 }), point({ index: 1, longitude: -179, time: 1_000 })],
      500,
    );
    expect(Math.abs(result?.longitude ?? 0)).toBe(180);
  });

  it("maintient le dernier point avant une interruption", () => {
    const result = pointAtTime(
      [point({ time: 0 }), point({ index: 1, latitude: 10, time: 60_000, gapBefore: true })],
      30_000,
    );
    expect(result?.latitude).toBe(0);
    expect(result?.fraction).toBe(0);
  });

  it("interpole et normalise les caps source et calculé séparément", () => {
    const result = pointAtTime(
      [
        point({ time: 0, sourceCourse: 359, calculatedCourse: 90 }),
        point({ index: 1, time: 1_000, sourceCourse: 1, calculatedCourse: 110 }),
      ],
      500,
    );
    expect(result?.sourceCourse).toBe(0);
    expect(result?.calculatedCourse).toBe(100);
  });
});
