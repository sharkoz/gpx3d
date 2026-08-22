import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseGpx } from "./parseGpx";

const demo = readFileSync(new URL("../../demo.gpx", import.meta.url), "utf8");

describe("parseGpx", () => {
  it("préserve les données source BasicAirData et leur référence verticale", () => {
    const flight = parseGpx(demo, "demo.gpx");

    expect(flight.points).toHaveLength(91);
    expect(flight.summary.segmentCount).toBe(1);
    expect(flight.summary.duration).toBe(90);
    expect(flight.points[30].sourceSpeed).toBe(0.68);
    expect(flight.verticalReference).toMatchObject({
      basis: "orthometric",
      geoidModel: "EGM96",
      correctionApplied: true,
    });
  });

  it("ne calcule pas de liaison entre deux segments", () => {
    const xml = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="0" lon="0"><ele>10</ele><time>2026-01-01T00:00:00Z</time></trkpt><trkpt lat="0" lon="0.001"><ele>11</ele><time>2026-01-01T00:00:01Z</time></trkpt></trkseg><trkseg><trkpt lat="1" lon="1"><ele>12</ele><time>2026-01-01T00:00:02Z</time></trkpt><trkpt lat="1" lon="1.001"><ele>13</ele><time>2026-01-01T00:00:03Z</time></trkpt></trkseg></trk></gpx>`;
    const flight = parseGpx(xml);

    expect(flight.summary.segmentCount).toBe(2);
    expect(flight.points[2].calculatedSpeed).toBeNull();
    expect(flight.summary.distance).toBeLessThan(250);
  });

  it("refuse les déclarations d'entités XML", () => {
    expect(() => parseGpx('<!DOCTYPE gpx [<!ENTITY x "bad">]><gpx>&x;</gpx>')).toThrow(
      "déclaration XML non autorisée",
    );
  });

  it("conserve la valeur zéro comme vitesse enregistrée", () => {
    const flight = parseGpx(demo);
    expect(flight.points[0].sourceSpeed).toBe(0);
    expect(flight.points[0].calculatedSpeed).toBeNull();
  });
});
