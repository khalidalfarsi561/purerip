# Implementation Plan

## Overview

PureRip is a Chrome Manifest V3 extension that lets developers click any rendered UI element on a live site and instantly decompile it into a clean, production-ready React (TypeScript) component styled with standard Tailwind v3 utilities, capturing `hover:`/`active:`/`focus:` states with zero DOM pollution.

This is a greenfield build (the working directory is empty). The extension injects an on-demand content script (triggered by `Alt+Shift+X`, the toolbar action, or a floating pick button). Clicking an element runs the decompilation pipeline — DOM sanitization → style diffing against user-agent/inherited defaults → Tailwind quantization → state extraction → React TSX generation — and presents the result in a closed-Shadow-DOM HUD with code tabs and a static preview.

**Locked decisions:** (1) hybrid CSSOM + synthetic-event state capture in `state-recorder.ts`; (2) Tailwind **v3** output syntax; (3) static HTML preview (React appears only as generated code text, not mounted in the content script).

---

## Types

Shared strict TypeScript definitions live in `src/engine/types.ts`, exported through `src/engine/index.ts`. All are non-`any`.

```ts
// Tailwind quantization result
export type TailwindClass = string; // e.g. "px-4", "bg-blue-600", "rounded-lg", "text-sm"

export interface QuantizedDeclaration {
  property: string;        // CSS property (camelCase, e.g. "paddingLeft")
  value: string;           // computed value (e.g. "16px")
  className: TailwindClass; // mapped utility, e.g. "pl-4"
  confidence: 'exact' | 'snapped' | 'skipped';
  skipReason?: string;     // why skipped (no arbitrary bracket soup)
}

// Normalized node tree (output of dom-traversal)
export type NodeKind = 'element' | 'text' | 'comment';

export interface NormalNode {
  kind: NodeKind;
  tag: string;                  // lowercase tag (or '#text')
  props: Record<string, string>; // raw attributes (class, href, etc.)
  children: NormalNode[];
  text?: string;                // for text nodes; trimmed of whitespace
  styleNote?: string;           // e.g. interactive role detected
}

// Style diff result (output of style-diff)
export interface DiffResult {
  element: HTMLElement;
  own: Record<string, string>;        // properties that differ from defaults/inherited
  inherited: Record<string, string>;  // properties inherited from ancestors (excluded from output)
}

// State extraction (output of state-recorder)
export interface StateVariant {
  pseudo: 'hover' | 'active' | 'focus';
  classes: TailwindClass[];
}

export interface ExtractionResult {
  base: DiffResult;
  variants: StateVariant[];
  transition?: string; // e.g. "transition-all duration-300 ease-in-out"
}

// Final component (output of react-compiler)
export interface ComponentPropsMap {
  [propName: string]: string; // prop -> default text, e.g. { title: "Sign in" }
}

export interface CompiledComponent {
  tsx: string;          // full component source
  html: string;         // pure Tailwind HTML (class-based, no React)
  previewHtml: string;  // sanitized markup for the static preview tab
  props: ComponentPropsMap;
  interactive: boolean;
}
```

**Quantizer palette/spacing types:** `SPACING_SCALE` (`ReadonlyMap<number, number>` for 0, 0.5, 1, 1.5, 2 … 96 → px), `COLOR_PALETTE` (`Array<{ name: string; rgb: [number, number, number] }>` covering slate/gray/zinc/neutral/stone + red/orange/amber/yellow/lime/green/emerald/teal/cyan/sky/blue/indigo/violet/purple/fuchsia/pink/rose, shades 50–950).

---

## Files

| File | Action | Purpose |
|------|--------|---------|
| `manifest.json` | Create | MV3 manifest, permissions, commands; no auto `content_scripts` (injected on demand) |
| `package.json` | Create | Vite + TypeScript + Vitest + vite-plugin-static-copy + @types/chrome |
| `tsconfig.json` | Create | `strict: true`, ES2020 target, bundler resolution, `lib: ["ES2020","DOM","DOM.Iterable"]` |
| `vite.config.ts` | Create | Multi-entry build (content IIFE + background ESM) + manifest copy plugin |
| `vite-env.d.ts` | Create | `/// <reference types="vite/client" />` + chrome types |
| `index.html` (dev only) | Create | Minimal dev harness for manual engine testing |
| `src/engine/types.ts` | Create | Shared types listed above |
| `src/engine/index.ts` | Create | Barrel export |
| `src/engine/tailwind-quantizer.ts` | Create | **Core engine**: spacing snap, color matcher, radius/typography/shadow maps |
| `src/engine/style-diff.ts` | Create | Default/inherited diff, produces `DiffResult` |
| `src/engine/dom-traversal.ts` | Create | Clone + sanitize subtree, strip scripts/comments/handlers, build `NormalNode[]` |
| `src/engine/state-recorder.ts` | Create | Hybrid CSSOM + synthetic-event capture, transition detection |
| `src/engine/react-compiler.ts` | Create | Normal tree → React TSX + pure HTML + preview HTML, prop extraction |
| `src/content/inspector.ts` | Create | Pick overlay (closed shadow root), click interceptor, pipeline orchestration |
| `src/content/shadow-dom-ui.ts` | Create | Closed-shadow HUD modal, tabs, copy, ESC close |
| `src/content/dom-overlay.ts` | Create | Small helper: creates/positions the highlight overlay inside the closed shadow root (kept separate to keep `inspector.ts` focused) |
| `src/background/service-worker.ts` | Create | `commands` + `action.onClicked` → inject content script → activate picker |
| `tests/tailwind-quantizer.test.ts` | Create | Spacing snap, color match, radius, typography, shadow edge cases |
| `tests/style-diff.test.ts` | Create | Default-vs-element diff, inherited filtering |
| `tests/dom-traversal.test.ts` | Create | Stripping logic, depth/node limits |
| `tests/react-compiler.test.ts` | Create | Attribute conversion, void/self-closing tags, SVG attrs, prop extraction |

**Config notes:** `package.json` scripts — `dev` (vite), `build` (vite build → `dist/`), `test` (vitest), `typecheck` (tsc --noEmit). The content script is bundled as a single IIFE `content.js` (imports `inspector.ts`, `shadow-dom-ui.ts`, `dom-overlay.ts`, and all engine modules). The background is an ES module `background.js`. No React in the extension bundle — React only appears as generated string output.

---

## Functions

### `tailwind-quantizer.ts`

- `const SPACING_SCALE: ReadonlyMap<number, number>` — keys 0, 0.5, 1, 1.5, 2, 2.5, 3 … 96 → px (0→0, 0.5→2, 1→4, 1.5→6, 2→8, 3→12, 4→16, … 96→384).
- `snapToSpacing(pxValue: number, tolerance = 1): string` — finds nearest scale step within tolerance; returns the numeric key string (`"4"`, `"2.5"`). Returns `""` if no step is within tolerance → caller drops the property. **Never** emits `w-[...]`.
- `pxToUtility(property: string, pxValue: number): TailwindClass | null` — maps a length property to its utility with the snapped scale slot: `marginLeft→ml`, `marginTop→mt`, `paddingLeft→pl`, `gap→gap`, `width→w`, `height→h`, `borderWidth→border` (0→`border-0`, 1→`border`, 2→`border-2`), `borderRadius→rounded`, etc. Returns `null` when unsnappable.
- `closestColor(rgb: [number, number, number]): { name: string; distance: number }` — Euclidean RGB distance over `COLOR_PALETTE`; returns nearest token e.g. `blue-600`.
- `colorToUtility(propertyPrefix: 'bg'|'text'|'border'|'ring'|'from'|'to'|'via'|'fill'|'stroke'|'accent', rgb: [number, number, number]): TailwindClass` — `bg-blue-600`, `text-zinc-800`, etc. Transparent/`#00000000` → `bg-transparent` (or `text-transparent`). Fallback: if the input came from a CSS variable that can't be resolved, return `""` (skip). **Never** emits arbitrary color brackets.
- `snapBorderRadius(px: number): TailwindClass` — `rounded-full` (>9999 or 50%), else nearest of `rounded-sm`(2), `rounded`(4), `rounded-md`(6), `rounded-lg`(8), `rounded-xl`(12), `rounded-2xl`(16), `rounded-3xl`(24). Unsnappable → skip.
- `snapFontSize(px: number): TailwindClass` — `text-xs`(12) … `text-9xl`(128) nearest.
- `snapFontWeight(w: number): TailwindClass` — `font-thin`(100) … `font-black`(900).
- `snapLineHeight(px: number, fontPx: number): TailwindClass | null` — `leading-none`(1), `leading-tight`(1.25), `leading-snug`(1.375), `leading-normal`(1.5), `leading-relaxed`(1.625), `leading-loose`(2) based on ratio; numeric via `leading-<ratio*4>` only when fitting scale — else skip.
- `snapShadow(boxShadow: string): TailwindClass | null` — matches `0 1px 2px …` → `shadow-sm`, `0 1px 3px …` → `shadow`, `0 4px 6px …` → `shadow-md`, `0 10px 15px …` → `shadow-lg`, `0 20px 25px …` → `shadow-xl`, `0 25px 50px …` → `shadow-2xl`. Complex multi-layer → `null` (skip).
- `snapTransition(computed: string): string | null` — inspects `transitionProperty/transitionDuration/transitionTimingFunction`; returns e.g. `transition-all duration-300 ease-in-out`. `transition-colors` when only color-ish props, `transition-transform` when only transforms.
- `quantizeDeclaration(property, value, context): QuantizedDeclaration` — dispatch table routing length/color/number/radius/shadow/typography properties to the above; returns `{ className, confidence, skipReason }`.

### `style-diff.ts`

- `getDefaultBaseline(el: HTMLElement): CSSStyleDeclaration` — deep-clones `el`, strips all classes/id/inline styles, wraps in an off-screen reset container (`position:absolute; left:-99999px; top:0; visibility:hidden;`) that applies `all:initial` inherited-proof reset; forces reflow; returns computed style.
- `diffElementStyles(el: HTMLElement): DiffResult` — iterates both the element's computed style and the baseline, comparing per-property. A property is **own** if it differs from baseline **and** differs from the parent's computed value (avoid emitting inherited values). Returns `own` + `inherited` maps. The `all:initial` reset key point: inherited properties on the clone revert to `initial`, so anything the author set/inherited-from-their-CSS shows up as a delta.
- `resolveCustomProperty(el, prop: string): string | null` — resolves `var(--x)` via `getComputedStyle(el).getPropertyValue` chain; returns literal or null.
- Complexity: single pass over property names; skip browser-internal props like `--webkit-*`, `-webkit-*`, `-moz-*`, `-ms-*` unless transform-relevant.

### `dom-traversal.ts`

- `sanitizeAndClone(root: Element): DocumentFragment | Element` — clones subtree, removes `script`, `style`, `noscript`, `link`, `meta`, `template`, comments; strips `on*` event attributes and `id`; strips `tabindex` unless interactive; strips `data-*` unless safe (configurable `KEEP_DATA_ATTRS = false` default).
- `elementMatchesInteractiveRoles(el): boolean` — `button, a[href], input, select, textarea, [role=button], [role=link], [role=tab], [role=menuitem], [contenteditable]` → marks subtree `interactive`.
- `buildTree(el, opts): NormalNode` — converts sanitized clone into `NormalNode[]`, applies `MAX_DEPTH = 12`, `MAX_NODES = 200`, coalesces whitespace text nodes, records tag/props/children.
- `isVoidElement(tag): boolean` — `area, base, br, col, embed, hr, img, input, link, meta, source, track, wbr`.

### `state-recorder.ts` (hybrid)

- `collectStaticPseudoRules(el: HTMLElement): Array<{ pseudo: 'hover'|'active'|'focus'|'focus-within'; declarations: Record<string,string> }>` — iterates `document.styleSheets`; in try/catch (cross-origin sheets throw on `.cssRules` access); recurses into `CSSMediaRule` for `(hover:hover)` + `(pointer:fine)` and `CSSSupportsRule`; for each `CSSStyleRule` whose selector **matches** the element or an ancestor (via `el.matches` / ancestor `.matches` inside try/catch), splits on any `:hover`/`:active`/`:focus`/`:focus-within`/`:visited` pseudo; keeps matching pseudo declarations.
- `captureInteractiveStates(el: HTMLElement): ExtractionResult`:
  1. Baseline = `diffElementStyles(el)`.
  2. **Synthetic pass:** save initial computed style snapshot → dispatch bubbling sequence `mouseover`, `mouseenter`, `mousemove`, `mouseleave` hover cycle; for active: `mousedown` (+ body `mouseup`), `mouseup`, `click`. Wait two `requestAnimationFrame` frames.
  3. Take post-event computed snapshot; compute delta properties (changed values vs baseline). Map deltas via `quantizeDeclaration` → prefix with `hover:`/`active:`.
  4. Reconcile with CSSOM-static results (dedupe; CSSOM wins for `hover:`); sanitize to only safe-tailwind-mappable props.
  5. Detect transition from computed `transitionProperty/Duration/TimingFunction` → `snapTransition`.
  6. Cleanup synthetic event side effects by restoring inline styles snapshot (guard against pages that mutate state on these events).

### `react-compiler.ts`

- `attrToJsx(name: string): string` — maps HTML→React attr names: `class→className`, `for→htmlFor`, `tabindex→tabIndex`, `readonly→readOnly`, `maxlength→maxLength`, `colspan→colSpan`, `rowspan→rowSpan`, `contenteditable→contentEditable`, `autocomplete→autoComplete`, `autofocus→autoFocus`, `srcset→srcSet`, `charset→charSet`, `http-equiv→httpEquiv`, `stroke-width→strokeWidth`, `stroke-linecap→strokeLinecap`, `stroke-linejoin→strokeLinejoin`, `fill-rule→fillRule`, `clip-rule→clipRule`, `stroke-miterlimit→strokeMiterlimit`, `xlink:href→xlinkHref`. `viewBox` stays `viewBox`.
- `isVoid(tag): boolean` and `renderNode(node, indent): string` — emits JSX; void elements self-close; boolean attrs (`disabled`, `checked`) render as bare prop or `={true}`; `style` object converted to React `style={{...}}` only when non-tailwind leftovers remain; `class` uses joined utility string.
- `classNameFromNormalNode(node, quantizedClasses)` — merges base quantized classes + variant classes (hover/active/focus) onto the element.
- `extractTextAndProps(tree): { jsx: string; props: ComponentPropsMap }` — finds primary direct text node in the "content" element (button→`label`, heading→`title`, else `text`); replaces with `{label}`/`{title}`; if interactive → adds `onClick?: () => void` to props; emits `interface ComponentProps { label?: string; onClick?: () => void; }` with sensible defaults in destructuring (`({ label = 'Get Started', onClick }: ComponentProps) => ...`). Default text truncated to ~40 chars with `…`.
- `sanitizeJsxText(text)` — escapes `{`, `}`, `<` in literal strings (React-safe), keeps entities.
- `compile(tree, extraction): CompiledComponent` — orchestrates: build class strings → JSX → pure HTML (className→class, no React) → preview HTML; wraps TSX in `import React from 'react'; export default function Component(...) {}` (plus `export interface ComponentProps`).

### `shadow-dom-ui.ts`

- `createHud(host: Element): HudController` — attaches closed shadow root on a fixed-position host (`position:fixed; inset:0; z-index:2147483647; pointer-events:none`), builds panel with `pointer-events:auto`.
- `HudController.render(compiled: CompiledComponent)` — tabs: **Preview** (static HTML in a sandboxed `iframe` with a small injected stylesheet approximating common Tailwind utilities so it renders offline), **React TSX** (`<pre>` with `white-space:pre-wrap`), **Tailwind HTML**. Copy button → `navigator.clipboard.writeText(tsx)` with `"Copied ✓"` feedback + revert. ESC closes; click outside closes; drag handle repositions.
- All UI in the closed shadow root, so page CSS cannot leak in and extension CSS cannot be overridden by the page.

### `inspector.ts`

- `activatePicker()` — creates/activates the closed-shadow overlay host; attaches throttled `mousemove` (rAF), computes `document.elementFromPoint`, draws outline box (`position:fixed`, `transform:translate(x,y)` + `border:2px solid #6366f1` + label) via `dom-overlay.ts`; `pointer-events:none` on overlay so the page keeps receiving events.
- `deactivatePicker()` / `onEsc` — cleanup.
- Click handler: `preventDefault()` + `stopPropagation()`; capture `event.target` as `Element`; if it's within our overlay host, ignore; else run pipeline: `sanitizeAndClone` → `buildTree` → `diffElementStyles` → `captureInteractiveStates` → `compile` → `createHud(element).render(compiled)`.
- Re-entry guard (ignore clicks while pipeline runs). Handles `Alt+Shift+X` via message from background.

### `background/service-worker.ts`

- `chrome.commands.onCommand` — `'toggle-picker'` → `injectAndActivate()`.
- `chrome.action.onClicked` — `injectAndActivate()`.
- `injectAndActivate()` — `chrome.tabs.query({active:true,currentWindow:true})` → `chrome.scripting.executeScript({target:{tabId}, files:['content.js']})` → `chrome.tabs.sendMessage(tabId,{type:'PURERIP_ACTIVATE'})`.
- Message hub for content script requests (isolated; no page interaction).

### `dom-overlay.ts`

- `createOverlay(shadowRoot: ShadowRoot)` — builds a `div.overlay` with `label`, `box`; exposes `showAt(x,y,w,h)`, `hide()`. `pointer-events:none`.

---

## Changes

### Step-by-step implementation order

1. **Scaffold & config** — create `package.json` (deps: `vite`, `typescript`, `vitest`, `@types/chrome`, `vite-plugin-static-copy`; dev only — no React in bundle), `tsconfig.json` (strict), `vite.config.ts` (multi-entry: `content.ts` → IIFE `content.js`; `service-worker.ts` → ESM `background.js`; copy `manifest.json` + assets), `vite-env.d.ts`, `index.html` dev harness.
2. **Manifest** — MV3: `permissions: ["activeTab","scripting","storage","clipboardWrite"]`, `background.service_worker` with `"type":"module"`, `commands` for `Alt+Shift+X`, `action` without popup. **No** `content_scripts` (injected on demand via `chrome.scripting`).
3. **Types** — `src/engine/types.ts` + `src/engine/index.ts` (barrel). All types strict, no `any`.
4. **Core quantizer** — `tailwind-quantizer.ts` with `SPACING_SCALE`, `COLOR_PALETTE`, and every snap function listed in Functions. This is the highest-risk file — extensively unit-tested. **Hard rule:** no `*-[…px/color]` arbitrary brackets ever emitted.
5. **Default diff** — `style-diff.ts` (baseline clone + reset + parent comparison).
6. **DOM traversal** — `dom-traversal.ts` (sanitize, void detection, tree build, depth/node caps).
7. **State recorder** — `state-recorder.ts` (CSSOM static + synthetic + transition). Cross-origin sheet try/catch, `var()` resolution, synthetic-restore guard.
8. **React compiler** — `react-compiler.ts` (JSX conversion, SVG attrs, prop extraction, `ComponentProps`, pure HTML + preview HTML).
9. **Shadow DOM UI** — `shadow-dom-ui.ts` (closed root, tabs, copy, ESC, static preview).
10. **Overlay** — `dom-overlay.ts` (closed-root highlight box).
11. **Inspector** — `inspector.ts` (picker, click intercept, orchestration).
12. **Background** — `service-worker.ts` (command/action injection + activation).
13. **Tests** — Vitest unit suites for quantizer, diff, traversal, compiler; run `npm run test`.
14. **Typecheck & build** — `npm run typecheck` (tsc --noEmit) then `npm run build`; confirm `dist/` contains `manifest.json`, `background.js`, `content.js`.
15. **Integration verification** — load unpacked from `dist/`, open a real site, `Alt+Shift+X`, hover a button, click, verify: overlay draws, modal opens, hover classes appear, copy works, page not broken, no element style pollution.

### Key technical decisions

- **Hybrid state capture**: CSSOM static analysis is authoritative for `:hover`/`:active`/`:focus` (synthetic events cannot set `:hover`); synthetic-event delta pass catches JS-driven hover handlers. Both converge into `hover:`/`active:`/`focus:` variants and are deduped.
- **No arbitrary values**: any px/color that can't snap to the Tailwind scale/palette is dropped (with `confidence:'skipped'` + `skipReason`) rather than emitted as `w-[…]`. Guarantees clean, valid Tailwind output.
- **Closed Shadow DOM** for overlay + HUD: page CSS/js cannot reach in; extension styles cannot be overridden by the page. `pointer-events:none` on the overlay so page interaction is preserved until click interception.
- **Default-baseline diff**: a stripped clone rendered off-screen in an `all:initial` reset wrapper gives a genuine user-agent default baseline; combined with a comparison to the parent's computed value, this removes inherited boilerplate and only emits meaningful styles.
- **On-demand injection**: no `content_scripts` entry — the script is injected via `chrome.scripting` on command, matching the "injected on command/global shortcut" requirement and keeping runtime memory low.

### Known limitations (documented, not bugs)

- Cross-origin stylesheets are skipped (SecurityError) → CSS-defined `:hover` may be missed on SAAS-hosted sheets; synthetic pass still runs.
- Multi-layer box-shadows, CSS gradients, and unresolved `var()` values are dropped to respect the "no arbitrary soup" rule; `background-color` is preferred over `background-image`.
- `:visited` and browser-specific pseudo-states are ignored.
- CSS variables resolved only when computed/chain-resolvable.

---

## Tests

- **`tailwind-quantizer.test.ts`** — `snapToSpacing`: exact (`4→"4"`), subpixel (`5.5→"1.5"` at 6px), out-of-tolerance (`20→""` after scale check), `0→"0"`; `pxToUtility` for `margin-left`, `padding`, `gap`, `width/height`, `border-width`, `border-radius`; `closestColor` — `rgb(37,99,235)`→`blue-600`, near-grays, transparency→`transparent`, ties broken deterministically; `snapBorderRadius`, `snapFontSize`, `snapFontWeight`, `snapShadow` (`0 1px 2px…`→`shadow-sm`, complex→null); `snapTransition` (`property:all; duration:.3s; timing:ease-in-out`→`transition-all duration-300 ease-in-out`).
- **`style-diff.test.ts`** — element with padding/background vs baseline → those in `own`, non-set props absent; inherited `color` from parent excluded when equal to parent; `var()` resolution.
- **`dom-traversal.test.ts`** — strips `script`/comments/`onclick`/`id`; void tag detection; MAX_DEPTH/MAX_NODES truncation; text coalescing.
- **`react-compiler.test.ts`** — `class→className`, `for→htmlFor`, void self-closing (`<img />`, `<input />`, `<br />`), SVG attr conversion (`stroke-width→strokeWidth`), text→prop extraction (`<button>Sign in</button>`→`label` prop + `onClick`), pure HTML (className→class) and preview HTML generation.
- **Manual E2E** — load unpacked from `dist/`; verify on a live site: overlay tracks cursor, click opens HUD, hover states produce `hover:` classes, copy writes to clipboard, page styles unaffected, ESC closes.

**Data:** tests use inline fixture HTML (jsdom) for diff/traversal/compiler; quantizer tests use numeric constants. **Performance:** quantizer color match is O(n) over ~20 colors × 20 shades (≈400 entries) — trivial per declaration; `style-diff` is one pass over ~300 properties; state capture is bounded by a few rAF frames.
