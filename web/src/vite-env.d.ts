/// <reference types="vite/client" />

declare const CESIUM_BASE_URL: string;

interface Window {
  CESIUM_BASE_URL: string;
}

interface ImportMetaEnv {
  readonly VITE_MAPTILER_KEY?: string;
}
