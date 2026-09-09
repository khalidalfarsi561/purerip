# PureRip

**Decompile any rendered UI element into clean, production-ready React (TypeScript) + Tailwind v3 code.**

PureRip is a Chrome Manifest V3 extension that lets developers click any rendered UI element on a live site and instantly decompile it into a clean, production-ready React (TypeScript) component styled with standard Tailwind v3 utilities — capturing `hover:`/`active:`/`focus:` states with zero DOM pollution.

```
Click an element → sanitize → style-diff → Tailwind quantize → state capture → React TSX
```

---

## ✨ Features

- **Click-to-decompile** any rendered element on a live page.
- **Clean React TSX output** — typed props (`ComponentProps`), no `any`, no arbitrary bracket soup (`w-[...]`, `bg-[...]`).
- **Standard Tailwind v3 utilities only** — lengths snap to the spacing scale, colors snap to the Tailwind palette, and anything unsnappable is dropped (with a `skipReason`) rather than emitted as arbitrary values.
- **Hybrid state capture** — combines static CSSOM pseudo-rule analysis with a synthetic-event delta pass to recover `hover:`, `active:`, and `focus:` variants.
- **Zero DOM pollution** — the live element is never mutated; a sanitized clone is used, and synthetic-event side effects are restored.
- **Closed Shadow DOM UI** — both the highlight overlay and the result HUD live inside closed shadow roots, so page CSS/JS cannot leak in and extension styles cannot be overridden.
- **On-demand injection** — the content script is injected only when the picker is activated (via `Alt+Shift+X`, the toolbar action, or the picker command). No `content_scripts` entry keeps runtime memory low.

## 🚀 Installation (developers)

### Load unpacked

1. Clone the repository.
2. Install dependencies and build:

   ```bash
   npm install
   npm run build
   ```

3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the `dist/` folder.

### Use

- Press **`Alt+Shift+X`** (or click the PureRip toolbar icon) to activate the element picker.
- Hover over any element — a highlight box tracks your cursor.
- **Click** the element you want to decompile.
- The PureRip HUD opens with three tabs:
  - **Preview** — a sandboxed, offline rendering of the element (an embedded Tailwind-approximation stylesheet so it renders without the CDN).
  - **React TSX** — the generated component source.
  - **Tailwind HTML** — the pure class-based HTML (no React).

  Use the **Copy** button to copy the React TSX to your clipboard. Press `Esc` or click outside to close.

## 🛠 Development

```bash
npm install
npm run dev
```

The Vite dev server serves `index.html`, a small manual harness that runs the engine on a sample button (`#target`) and prints the compiled TSX into `#output`. Click the sample button to re-run.

## 📦 Build

```bash
npm run build
```

Driven by `scripts/build.mjs`, this produces two bundles plus the manifest in `dist/`:

| Output               | Format    | Purpose                                      |
| -------------------- | --------- | -------------------------------------------- |
| `dist/content.js`    | IIFE      | Injected on demand via `chrome.scripting`    |
| `dist/background.js` | ES module | Service worker (declared `"type": "module"`) |
| `dist/manifest.json` | —         | MV3 manifest (copied as-is)                  |

The content bundle is a single self-contained IIFE (it imports `inspector.ts`, `shadow-dom-ui.ts`, `dom-overlay.ts`, and all engine modules). React is **never** part of the extension bundle — it appears only as generated string output.

## 🧪 Testing & type-checking

```bash
npm run test       # Vitest (jsdom) — runs tests/**/*.test.ts
npm run typecheck  # tsc --noEmit (strict)
```

Test suites:

- `tests/tailwind-quantizer.test.ts` — spacing snap, length→utility mapping, nearest-color, radius/font/shadow/transition, declaration quantization.
- `tests/style-diff.test.ts` — default-baseline diffing, inherited-property filtering, `var()` resolution.
- `tests/dom-traversal.test.ts` — sanitization, void-element detection, tree depth/node caps, text coalescing.
- `tests/react-compiler.test.ts` — HTML→JSX attribute mapping, void/self-closing tags, SVG attrs, text→prop extraction, `compile()` output.
- `tests/integration.test.ts` — the full end-to-end pipeline.

## 🧠 Architecture

```
src/
├── engine/                 # Pure, page-agnostic decompilation pipeline
│   ├── types.ts            # Shared strict TypeScript types
│   ├── index.ts            # Barrel export
│   ├── tailwind-quantizer.ts  # CSS → Tailwind v3 utility mapping (spacing/color/radius/typography/shadow/transition)
│   ├── style-diff.ts       # Computed-style diff vs. a "default baseline" clone (all:initial reset)
│   ├── dom-traversal.ts    # Sanitize + clone subtree, build a normalized node tree
│   ├── state-recorder.ts   # Hybrid CSSOM-static + synthetic-event state capture
│   └── react-compiler.ts   # Normal node tree → React TSX + pure HTML + preview HTML
├── content/                # Injected content-script layer
│   ├── inspector.ts        # Picker orchestration, click interception, pipeline wiring
│   ├── dom-overlay.ts      # Closed-shadow highlight box
│   └── shadow-dom-ui.ts    # Closed-shadow HUD (tabs, copy, ESC, drag)
├── background/
│   └── service-worker.ts   # Command/action → inject content.js → activate picker
└── dev-harness.ts          # Manual engine harness (dev only)
```

### Key technical decisions

- **No arbitrary values.** Any px/color that cannot snap to the Tailwind scale/palette is dropped (with `confidence: 'skipped'` + `skipReason`) instead of being emitted as `w-[...]`.
- **Hybrid state capture.** CSSOM static analysis is authoritative for `:hover`/`:active`/`:focus` (synthetic events cannot set `:hover`); the synthetic delta pass catches JS-driven hover/active handlers. Both converge into `hover:`/`active:`/`focus:` variants and are deduped.
- **Closed Shadow DOM.** The overlay + HUD live in closed shadow roots. `pointer-events: none` on the overlay preserves page interaction until click interception.
- **Default-baseline diff.** A stripped clone rendered off-screen inside an `all: initial` reset wrapper provides a genuine user-agent default baseline; combined with a comparison to the parent's computed value, this removes inherited boilerplate and only emits meaningful styles.
- **On-demand injection.** No `content_scripts` entry — the script is injected via `chrome.scripting` on command, keeping runtime memory low.

## 📄 License

Released under the [MIT License](LICENSE).
