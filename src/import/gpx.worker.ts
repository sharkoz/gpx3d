/// <reference lib="webworker" />

import { parseGpx } from "@/domain/parseGpx";

type ParseRequest = {
  xml: string;
  fallbackName: string;
};

self.onmessage = ({ data }: MessageEvent<ParseRequest>) => {
  try {
    const flight = parseGpx(data.xml, data.fallbackName);
    self.postMessage({ ok: true, flight });
  } catch (error) {
    self.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : "Impossible de lire ce fichier GPX.",
    });
  }
};
