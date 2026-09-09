// PureRip production build.
//
// Two outputs are needed with different bundle formats:
//   - content.js   (IIFE, injected via chrome.scripting)
//   - background.js (ES module service worker)
//
// Vite's CLI only resolves a single config object, so this script drives the
// programmatic API to build each bundle in turn. The content build starts with
// `emptyOutDir: true` (so dist/ is wiped first) and copies manifest.json; the
// background build then appends background.js without clearing the directory.

import { build } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

// Content script: single self-contained IIFE (injected via chrome.scripting).
const contentConfig = {
  root: rootDir,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    rollupOptions: {
      input: resolve(rootDir, "src/content/inspector.ts"),
      output: {
        entryFileNames: "content.js",
        format: "iife",
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [{ src: "manifest.json", dest: "." }],
    }),
  ],
};

// Background service worker: ES module (declared as "type": "module" in manifest).
const backgroundConfig = {
  root: rootDir,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "es2020",
    rollupOptions: {
      input: resolve(rootDir, "src/background/service-worker.ts"),
      output: {
        entryFileNames: "background.js",
        format: "es",
      },
    },
  },
};

await build(contentConfig);
await build(backgroundConfig);

console.log(
  "PureRip build complete: dist/content.js, dist/background.js, dist/manifest.json",
);
