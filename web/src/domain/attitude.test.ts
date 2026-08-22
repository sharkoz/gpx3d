import { describe, expect, it } from "vitest";
import { bankAngle, trajectoryPitch } from "./attitude";

describe("flight attitude", () => {
  it("incline à droite pour un virage à droite", () => {
    expect(bankAngle(30, 6)).toBeGreaterThan(0);
    expect(bankAngle(30, -6)).toBeLessThan(0);
  });

  it("borne les attitudes extrêmes", () => {
    expect(bankAngle(120, 90)).toBeCloseTo(0.44);
    expect(trajectoryPitch(50, 1)).toBeCloseTo(0.35);
    expect(trajectoryPitch(-50, 1)).toBeCloseTo(-0.35);
  });
});
