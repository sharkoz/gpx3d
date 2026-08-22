import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "web",
  base: "/gpx3d/",
  publicDir: "public",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./web/src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: "../node_modules/cesium/Build/Cesium/{Workers,Assets,ThirdParty,Widgets}/**/*",
          dest: "cesium",
          rename: { stripBase: 4 },
        },
        { src: "public/**/*", dest: ".", rename: { stripBase: 1 } },
      ],
    }),
  ],
  build: {
    outDir: "..",
    emptyOutDir: false,
    copyPublicDir: false,
    chunkSizeWarningLimit: 5_000,
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
        manualChunks: (id) => (id.includes("node_modules/cesium") ? "cesium" : undefined),
      },
    },
  },
  worker: {
    rollupOptions: {
      output: {
        entryFileNames: "assets/gpx.worker.js",
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
