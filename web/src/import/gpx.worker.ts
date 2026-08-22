/// <reference lib="webworker" />

import { parseGpx } from "@/domain/parseGpx";

type ParseRequest = {
  xml: string;
  fallbackName: string;
};

self.onmessage = async ({ data }: MessageEvent<ParseRequest>) => {
  try {
    const flight = parseGpx(data.xml, data.fallbackName);
    if (
      flight.verticalReference.basis === "orthometric" &&
      flight.verticalReference.geoidModel === "EGM96"
    ) {
      const { default: initialiseGeoid, EmbeddedGeoidCalculator } = await import("@lumikmz/geoid");
      await initialiseGeoid();
      const geoid = new EmbeddedGeoidCalculator();
      for (const point of flight.points) {
        point.ellipsoidElevation =
          point.elevation === null
            ? null
            : geoid.convert_asl_to_hae(point.longitude, point.latitude, point.elevation);
      }
      geoid.free();
      flight.verticalReference.evidence.push(
        "Conversion EGM96 vers hauteur ellipsoïdale appliquée au rendu 3D.",
      );
    } else if (flight.verticalReference.basis === "ellipsoidal") {
      for (const point of flight.points) point.ellipsoidElevation = point.elevation;
    }
    self.postMessage({ ok: true, flight });
  } catch (error) {
    self.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : "Impossible de lire ce fichier GPX.",
    });
  }
};
