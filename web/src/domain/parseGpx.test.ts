import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseGpx } from "./parseGpx";

const demo = readFileSync(new URL("../../public/demo.gpx", import.meta.url), "utf8");

describe("parseGpx", () => {
  it("préserve les données source BasicAirData et leur référence verticale", () => {
    const flight = parseGpx(demo, "demo.gpx");

    expect(flight.points).toHaveLength(2_942);
    expect(flight.summary.segmentCount).toBe(1);
    expect(flight.summary.duration).toBe(2_941);
    expect(flight.points[30].sourceSpeed).toBe(0.25);
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
    expect(flight.points[2].distance).toBe(flight.points[1].distance);
    expect(flight.summary.distance).toBeLessThan(250);
  });

  it("lit les extensions de vitesse Garmin v2 dans un GPX 1.1", () => {
    const xml = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v2"><metadata><name>Vol Garmin</name></metadata><trk><trkseg><trkpt lat="45" lon="1"><time>2026-01-01T00:00:00Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:speed>12.5</gpxtpx:speed><gpxtpx:course>359</gpxtpx:course></gpxtpx:TrackPointExtension></extensions></trkpt><trkpt lat="45.001" lon="1.001"><time>2026-01-01T00:00:01Z</time></trkpt></trkseg></trk></gpx>`;
    const flight = parseGpx(xml);

    expect(flight.name).toBe("Vol Garmin");
    expect(flight.points[0].sourceSpeed).toBe(12.5);
    expect(flight.points[0].sourceCourse).toBe(359);
  });

  it("conserve une trace géométrique sans données temporelles ni altitude", () => {
    const xml = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="45" lon="1"/><trkpt lat="45.001" lon="1.001"/></trkseg></trk></gpx>`;
    const flight = parseGpx(xml);

    expect(flight.summary.duration).toBeNull();
    expect(flight.bounds.minElevation).toBeNull();
    expect(flight.summary.distance).toBeGreaterThan(100);
    expect(flight.warnings.join(" ")).toContain("heure exploitable");
  });

  it("marque les interruptions temporelles sans lisser le vario au travers", () => {
    const xml = `<?xml version="1.0"?><gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="45" lon="1"><ele>10</ele><time>2026-01-01T00:00:00Z</time></trkpt><trkpt lat="45.001" lon="1"><ele>11</ele><time>2026-01-01T00:00:01Z</time></trkpt><trkpt lat="45.002" lon="1"><ele>200</ele><time>2026-01-01T00:10:00Z</time></trkpt><trkpt lat="45.003" lon="1"><ele>201</ele><time>2026-01-01T00:10:01Z</time></trkpt></trkseg></trk></gpx>`;
    const flight = parseGpx(xml);

    expect(flight.points[2].gapBefore).toBe(true);
    expect(flight.points[2].calculatedSpeed).toBeNull();
    expect(flight.points[1].verticalSpeed).toBeNull();
    expect(flight.points[2].verticalSpeed).toBeNull();
  });

  it("refuse les déclarations d'entités XML", () => {
    expect(() => parseGpx('<!DOCTYPE gpx [<!ENTITY x "bad">]><gpx>&x;</gpx>')).toThrow(
      "déclaration XML non autorisée",
    );
  });

  it("conserve la valeur zéro comme vitesse enregistrée", () => {
    const xml = `<?xml version="1.0"?><gpx version="1.0" xmlns="http://www.topografix.com/GPX/1/0"><trk><trkseg><trkpt lat="45" lon="1"><time>2026-01-01T00:00:00Z</time><speed>0</speed></trkpt><trkpt lat="45.001" lon="1"><time>2026-01-01T00:00:01Z</time><speed>1</speed></trkpt></trkseg></trk></gpx>`;
    const flight = parseGpx(xml);
    expect(flight.points[0].sourceSpeed).toBe(0);
    expect(flight.points[0].calculatedSpeed).toBeNull();
  });
});
