import type { FlightData, FlightRecord } from "@/domain/types";

const MAX_FILE_SIZE = 50 * 1_024 * 1_024;

async function digest(text: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(hash)]
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseInWorker(xml: string, fallbackName: string) {
  return new Promise<FlightData>((resolve, reject) => {
    const worker = new Worker(new URL("./gpx.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.ok) resolve(data.flight);
      else reject(new Error(data.message));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("Le module d’analyse GPX n’a pas pu démarrer."));
    };
    worker.postMessage({ xml, fallbackName });
  });
}

export async function importFlightFile(file: File): Promise<FlightRecord> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Ce fichier dépasse la limite actuelle de 50 Mo.");
  }
  const originalGpx = await file.text();
  if (!/<(?:\w+:)?gpx(?:\s|>)/i.test(originalGpx.slice(0, 32_768))) {
    throw new Error("Le contenu ne ressemble pas à un fichier GPX.");
  }
  const data = await parseInWorker(originalGpx, file.name.replace(/\.gpx$/i, ""));
  const id = await digest(originalGpx);

  return {
    id,
    displayName: data.name,
    sourceFilename: file.name,
    importedAt: Date.now(),
    altitudeOffset: 0,
    originalGpx,
    data,
  };
}

export async function loadDemoFlight() {
  const response = await fetch(`${import.meta.env.BASE_URL}demo.gpx`);
  if (!response.ok) throw new Error("La trace de démonstration est indisponible.");
  const blob = await response.blob();
  return importFlightFile(new File([blob], "demo.gpx", { type: "application/gpx+xml" }));
}
