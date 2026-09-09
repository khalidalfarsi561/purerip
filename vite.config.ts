import { defineConfig } from "vite";

// Minimal dev config: serves `index.html` and the `/src/dev-harness.ts` entry
// for manual engine testing. Production builds are driven by `scripts/build.mjs`
// (see package.json) because the extension needs two bundle formats —
// content.js (IIFE) and background.js (ESM) — which a single Vite CLI build
// cannot emit.
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
});
