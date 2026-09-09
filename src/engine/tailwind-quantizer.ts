// Core Tailwind quantization engine.
//
// Hard rule: this module NEVER emits arbitrary bracket values (w-[...], bg-[...]).
// Any px / color that cannot snap to the Tailwind scale or palette is dropped
// with `confidence: 'skipped'` and a `skipReason`.

import type { QuantizedDeclaration, TailwindClass } from "./types";

// ---- Spacing scale (Tailwind v3 default) ------------------------------------

/** Tailwind spacing scale: scale step (key) -> px. */
export const SPACING_SCALE: ReadonlyMap<number, number> = new Map<
  number,
  number
>([
  [0, 0],
  [0.5, 2],
  [1, 4],
  [1.5, 6],
  [2, 8],
  [2.5, 10],
  [3, 12],
  [3.5, 14],
  [4, 16],
  [5, 20],
  [6, 24],
  [7, 28],
  [8, 32],
  [9, 36],
  [10, 40],
  [11, 44],
  [12, 48],
  [14, 56],
  [16, 64],
  [20, 80],
  [24, 96],
  [28, 112],
  [32, 128],
  [36, 144],
  [40, 160],
  [44, 176],
  [48, 192],
  [52, 208],
  [56, 224],
  [60, 240],
  [64, 256],
  [72, 288],
  [80, 320],
  [96, 384],
]);

const SPACING_TOLERANCE = 1.5; // px; sub-pixel rendering on high-DPI displays

/**
 * Find the nearest spacing scale step within tolerance (default 1.5px).
 * Returns the numeric scale key string (e.g. "4", "2.5"). Returns "" when no
 * step is within tolerance, so the caller drops the property.
 */
export function snapToSpacing(
  pxValue: number,
  tolerance = SPACING_TOLERANCE,
): TailwindClass {
  if (!isFinite(pxValue) || pxValue < 0) return "";
  let bestKey = -1;
  let bestDist = Infinity;
  for (const [key, px] of SPACING_SCALE) {
    const dist = Math.abs(px - pxValue);
    if (dist < bestDist) {
      bestDist = dist;
      bestKey = key;
    }
  }
  if (bestKey === -1 || bestDist > tolerance) return "";
  return String(bestKey);
}

// ---- Length property → utility ----------------------------------------------

const LENGTH_UTILITIES: Record<string, string> = {
  margin: "m",
  marginTop: "mt",
  marginRight: "mr",
  marginBottom: "mb",
  marginLeft: "ml",
  marginX: "mx",
  marginY: "my",
  padding: "p",
  paddingTop: "pt",
  paddingRight: "pr",
  paddingBottom: "pb",
  paddingLeft: "pl",
  paddingX: "px",
  paddingY: "py",
  gap: "gap",
  columnGap: "gap-x",
  rowGap: "gap-y",
  width: "w",
  height: "h",
  minWidth: "min-w",
  minHeight: "min-h",
  maxWidth: "max-w",
  maxHeight: "max-h",
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left",
  inset: "inset",
  insetX: "inset-x",
  insetY: "inset-y",
};

const BORDER_WIDTH_DIRECTIONS: Record<string, string> = {
  borderWidth: "border",
  borderTopWidth: "border-t",
  borderRightWidth: "border-r",
  borderBottomWidth: "border-b",
  borderLeftWidth: "border-l",
};

function borderWidthUtility(
  property: string,
  pxValue: number,
): TailwindClass | null {
  const dir = BORDER_WIDTH_DIRECTIONS[property];
  if (!dir) return null;
  const snapped = Math.round(pxValue);
  if (snapped === 0) return `${dir}-0`;
  if (snapped === 1) return dir;
  if (snapped === 2) return `${dir}-2`;
  if (snapped === 4) return `${dir}-4`;
  if (snapped === 8) return `${dir}-8`;
  return null;
}

/**
 * Map a length property to its Tailwind utility using the snapped scale slot.
 * Returns null when unsnappable (never emits arbitrary brackets).
 */
export function pxToUtility(
  property: string,
  pxValue: number,
): TailwindClass | null {
  if (!isFinite(pxValue)) return null;

  if (property === "borderRadius") {
    const rounded = snapBorderRadius(pxValue);
    return rounded === "" ? null : rounded;
  }

  const border = borderWidthUtility(property, pxValue);
  if (border) return border;

  const utility = LENGTH_UTILITIES[property];
  if (!utility) return null;

  const slot = snapToSpacing(pxValue);
  if (slot === "") return null;
  return `${utility}-${slot}`;
}

// ---- Border radius -----------------------------------------------------------

const RADIUS_STEPS: Array<[number, string]> = [
  [0, "rounded-none"],
  [2, "rounded-sm"],
  [4, "rounded"],
  [6, "rounded-md"],
  [8, "rounded-lg"],
  [12, "rounded-xl"],
  [16, "rounded-2xl"],
  [24, "rounded-3xl"],
];

export function snapBorderRadius(px: number): TailwindClass {
  if (!isFinite(px)) return "";
  if (px > 9999) return "rounded-full";
  let best = "";
  let bestDist = Infinity;
  for (const [value, cls] of RADIUS_STEPS) {
    const dist = Math.abs(value - px);
    if (dist < bestDist) {
      bestDist = dist;
      best = cls;
    }
  }
  return bestDist <= 1.5 ? best : "";
}

// ---- Typography --------------------------------------------------------------

const FONT_SIZE_STEPS: Array<[number, string]> = [
  [12, "text-xs"],
  [14, "text-sm"],
  [16, "text-base"],
  [18, "text-lg"],
  [20, "text-xl"],
  [24, "text-2xl"],
  [30, "text-3xl"],
  [36, "text-4xl"],
  [48, "text-5xl"],
  [60, "text-6xl"],
  [72, "text-7xl"],
  [96, "text-8xl"],
  [128, "text-9xl"],
];

export function snapFontSize(px: number): TailwindClass {
  if (!isFinite(px)) return "";
  let best = "";
  let bestDist = Infinity;
  for (const [value, cls] of FONT_SIZE_STEPS) {
    const dist = Math.abs(value - px);
    if (dist < bestDist) {
      bestDist = dist;
      best = cls;
    }
  }
  return bestDist <= 2 ? best : "";
}

const FONT_WEIGHT_STEPS: Array<[number, string]> = [
  [100, "font-thin"],
  [200, "font-extralight"],
  [300, "font-light"],
  [400, "font-normal"],
  [500, "font-medium"],
  [600, "font-semibold"],
  [700, "font-bold"],
  [800, "font-extrabold"],
  [900, "font-black"],
];

export function snapFontWeight(weight: number): TailwindClass {
  if (!isFinite(weight)) return "";
  let best = "";
  let bestDist = Infinity;
  for (const [value, cls] of FONT_WEIGHT_STEPS) {
    const dist = Math.abs(value - weight);
    if (dist < bestDist) {
      bestDist = dist;
      best = cls;
    }
  }
  return bestDist <= 50 ? best : "";
}

const LINE_HEIGHT_STEPS: Array<[number, string]> = [
  [1, "leading-none"],
  [1.25, "leading-tight"],
  [1.375, "leading-snug"],
  [1.5, "leading-normal"],
  [1.625, "leading-relaxed"],
  [2, "leading-loose"],
];

export function snapLineHeight(
  px: number,
  fontPx: number,
): TailwindClass | null {
  if (!isFinite(px) || !isFinite(fontPx) || fontPx <= 0) return null;
  const ratio = px / fontPx;
  let best = "";
  let bestDist = Infinity;
  for (const [value, cls] of LINE_HEIGHT_STEPS) {
    const dist = Math.abs(value - ratio);
    if (dist < bestDist) {
      bestDist = dist;
      best = cls;
    }
  }
  return bestDist <= 0.08 ? best : null;
}

// ---- Shadow ------------------------------------------------------------------

const SHADOW_TARGETS: Array<[number, number, number, number, TailwindClass]> = [
  [0, 1, 2, 0, "shadow-sm"],
  [0, 1, 3, 0, "shadow"],
  [0, 4, 6, -1, "shadow-md"],
  [0, 10, 15, -3, "shadow-lg"],
  [0, 20, 25, -5, "shadow-xl"],
  [0, 25, 50, -12, "shadow-2xl"],
];

/**
 * Split a box-shadow string on top-level commas (commas nested inside a color
 * function like `rgba(...)` must not split the layer).
 */
function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim().length > 0 || parts.length === 0) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

export function snapShadow(boxShadow: string): TailwindClass | null {
  const s = boxShadow.trim();
  if (!s || s === "none") return null;
  if (s.includes("inset")) return null;

  const layers = splitTopLevelCommas(s);
  if (layers.length !== 1) return null;

  // Match the dominant (first) layer's offsets.
  const firstLayer = layers[0];
  const pxMatches = [...firstLayer.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map((m) =>
    parseFloat(m[1]),
  );
  if (pxMatches.length < 3) return null;

  const x = pxMatches[0];
  const y = pxMatches[1];
  const blur = pxMatches[2];
  const spread = pxMatches[3] ?? 0;

  let best: TailwindClass | null = null;
  let bestDist = Infinity;
  for (const [tx, ty, tb, ts, cls] of SHADOW_TARGETS) {
    const dist =
      Math.abs(x - tx) +
      Math.abs(y - ty) +
      Math.abs(blur - tb) +
      Math.abs(spread - ts);
    if (dist < bestDist) {
      bestDist = dist;
      best = cls;
    }
  }
  return bestDist <= 2 ? best : null;
}

// ---- Transition --------------------------------------------------------------

function parseCssTime(value: string): number | null {
  const v = value.trim();
  const match = v.match(/^(-?\d+(?:\.\d+)?)(ms|s)?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const unit = match[2];
  if (unit === "ms") return num;
  if (unit === "s") return num * 1000;
  return num;
}

const DURATION_STEPS: Array<[number, string]> = [
  [0, "duration-0"],
  [75, "duration-75"],
  [100, "duration-100"],
  [150, "duration-150"],
  [200, "duration-200"],
  [300, "duration-300"],
  [500, "duration-500"],
  [700, "duration-700"],
  [1000, "duration-1000"],
];

const DELAY_STEPS: Array<[number, string]> = [
  [0, "delay-0"],
  [75, "delay-75"],
  [100, "delay-100"],
  [150, "delay-150"],
  [200, "delay-200"],
  [300, "delay-300"],
  [500, "delay-500"],
  [700, "delay-700"],
  [1000, "delay-1000"],
];

function snapDuration(ms: number): TailwindClass | null {
  let best: TailwindClass | null = null;
  let bestDist = Infinity;
  for (const [value, cls] of DURATION_STEPS) {
    const dist = Math.abs(value - ms);
    if (dist < bestDist) {
      bestDist = dist;
      best = cls;
    }
  }
  return bestDist <= 100 ? best : null;
}

function snapDelay(delay: string): TailwindClass | null {
  const ms = parseCssTime(delay);
  if (ms === null || ms <= 0) return null;
  let best: TailwindClass | null = null;
  let bestDist = Infinity;
  for (const [value, cls] of DELAY_STEPS) {
    const dist = Math.abs(value - ms);
    if (dist < bestDist) {
      bestDist = dist;
      best = cls;
    }
  }
  return bestDist <= 100 ? best : null;
}

function snapTiming(timing: string): TailwindClass | null {
  const t = timing.trim().toLowerCase();
  const bezierMatch = t.match(
    /cubic-bezier\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/,
  );
  if (bezierMatch) {
    const [a, b, c, d] = bezierMatch.slice(1).map(parseFloat);
    if (a === 0 && b === 0 && c === 1 && d === 1) return "ease-linear";
    if (a === 0.42 && b === 0 && c === 1 && d === 1) return "ease-in";
    if (a === 0 && b === 0 && c === 0.58 && d === 1) return "ease-out";
    if (a === 0.42 && b === 0 && c === 0.58 && d === 1) return "ease-in-out";
    return null;
  }
  if (t === "linear") return "ease-linear";
  if (t === "ease-in") return "ease-in";
  if (t === "ease-out") return "ease-out";
  if (t === "ease-in-out") return "ease-in-out";
  return null; // bare 'ease' is the UA default timing — not an author intent
}

export function snapTransition(
  property: string,
  duration: string,
  timing: string,
  delay: string,
): string | null {
  const prop = (property || "").trim().toLowerCase();
  if (prop === "none" || prop === "") return null;

  const durationMs = parseCssTime(duration);
  if (durationMs === null || durationMs <= 0) return null;

  let transitionClass = "transition";
  if (prop === "all") {
    transitionClass = "transition-all";
  } else if (
    prop.includes("transform") ||
    prop.includes("translate") ||
    prop.includes("scale") ||
    prop.includes("rotate")
  ) {
    transitionClass = "transition-transform";
  } else if (prop.includes("box-shadow")) {
    transitionClass = "transition-shadow";
  } else if (
    prop.includes("background-color") ||
    prop.includes("color") ||
    prop.includes("border") ||
    prop.includes("fill") ||
    prop.includes("stroke") ||
    prop.includes("text-decoration")
  ) {
    transitionClass = "transition-colors";
  } else if (prop === "opacity" || prop.includes("opacity")) {
    transitionClass = "transition-opacity";
  } else if (prop.includes("filter")) {
    transitionClass = "transition-filter";
  }

  const parts = [transitionClass];
  const durationClass = snapDuration(durationMs);
  const timingClass = snapTiming(timing);
  const delayClass = snapDelay(delay);
  if (durationClass) parts.push(durationClass);
  if (timingClass) parts.push(timingClass);
  if (delayClass) parts.push(delayClass);
  return parts.join(" ");
}
// ---- Color palette (Tailwind v3 default) -----------------------------------

/** Raw Tailwind v3 palette: family -> [shade, hex][]. */
const PALETTE_RAW: Record<string, Array<[number, string]>> = {
  slate: [
    [50, "#f8fafc"],
    [100, "#f1f5f9"],
    [200, "#e2e8f0"],
    [300, "#cbd5e1"],
    [400, "#94a3b8"],
    [500, "#64748b"],
    [600, "#475569"],
    [700, "#334155"],
    [800, "#1e293b"],
    [900, "#0f172a"],
    [950, "#020617"],
  ],
  gray: [
    [50, "#f9fafb"],
    [100, "#f3f4f6"],
    [200, "#e5e7eb"],
    [300, "#d1d5db"],
    [400, "#9ca3af"],
    [500, "#6b7280"],
    [600, "#4b5563"],
    [700, "#374151"],
    [800, "#1f2937"],
    [900, "#111827"],
    [950, "#030712"],
  ],
  zinc: [
    [50, "#fafafa"],
    [100, "#f4f4f5"],
    [200, "#e4e4e7"],
    [300, "#d4d4d8"],
    [400, "#a1a1aa"],
    [500, "#71717a"],
    [600, "#52525b"],
    [700, "#3f3f46"],
    [800, "#27272a"],
    [900, "#18181b"],
    [950, "#09090b"],
  ],
  neutral: [
    [50, "#fafafa"],
    [100, "#f5f5f5"],
    [200, "#e5e5e5"],
    [300, "#d4d4d4"],
    [400, "#a3a3a3"],
    [500, "#737373"],
    [600, "#525252"],
    [700, "#404040"],
    [800, "#262626"],
    [900, "#171717"],
    [950, "#0a0a0a"],
  ],
  stone: [
    [50, "#fafaf9"],
    [100, "#f5f5f4"],
    [200, "#e7e5e4"],
    [300, "#d6d3d1"],
    [400, "#a8a29e"],
    [500, "#78716c"],
    [600, "#57534e"],
    [700, "#44403c"],
    [800, "#292524"],
    [900, "#1c1917"],
    [950, "#0c0a09"],
  ],
  red: [
    [50, "#fef2f2"],
    [100, "#fee2e2"],
    [200, "#fecaca"],
    [300, "#fca5a5"],
    [400, "#f87171"],
    [500, "#ef4444"],
    [600, "#dc2626"],
    [700, "#b91c1c"],
    [800, "#991b1b"],
    [900, "#7f1d1d"],
    [950, "#450a0a"],
  ],
  orange: [
    [50, "#fff7ed"],
    [100, "#ffedd5"],
    [200, "#fed7aa"],
    [300, "#fdba74"],
    [400, "#fb923c"],
    [500, "#f97316"],
    [600, "#ea580c"],
    [700, "#c2410c"],
    [800, "#9a3412"],
    [900, "#7c2d12"],
    [950, "#431407"],
  ],
  amber: [
    [50, "#fffbeb"],
    [100, "#fef3c7"],
    [200, "#fde68a"],
    [300, "#fcd34d"],
    [400, "#fbbf24"],
    [500, "#f59e0b"],
    [600, "#d97706"],
    [700, "#b45309"],
    [800, "#92400e"],
    [900, "#78350f"],
    [950, "#451a03"],
  ],
  yellow: [
    [50, "#fefce8"],
    [100, "#fef9c3"],
    [200, "#fef08a"],
    [300, "#fde047"],
    [400, "#facc15"],
    [500, "#eab308"],
    [600, "#ca8a04"],
    [700, "#a16207"],
    [800, "#854d0e"],
    [900, "#713f12"],
    [950, "#422006"],
  ],
  lime: [
    [50, "#f7fee7"],
    [100, "#ecfccb"],
    [200, "#d9f99d"],
    [300, "#bef264"],
    [400, "#a3e635"],
    [500, "#84cc16"],
    [600, "#65a30d"],
    [700, "#4d7c0f"],
    [800, "#3f6212"],
    [900, "#365314"],
    [950, "#1a2e05"],
  ],
  green: [
    [50, "#f0fdf4"],
    [100, "#dcfce7"],
    [200, "#bbf7d0"],
    [300, "#86efac"],
    [400, "#4ade80"],
    [500, "#22c55e"],
    [600, "#16a34a"],
    [700, "#15803d"],
    [800, "#166534"],
    [900, "#14532d"],
    [950, "#052e16"],
  ],
  emerald: [
    [50, "#ecfdf5"],
    [100, "#d1fae5"],
    [200, "#a7f3d0"],
    [300, "#6ee7b7"],
    [400, "#34d399"],
    [500, "#10b981"],
    [600, "#059669"],
    [700, "#047857"],
    [800, "#065f46"],
    [900, "#064e3b"],
    [950, "#022c22"],
  ],
  teal: [
    [50, "#f0fdfa"],
    [100, "#ccfbf1"],
    [200, "#99f6e4"],
    [300, "#5eead4"],
    [400, "#2dd4bf"],
    [500, "#14b8a6"],
    [600, "#0d9488"],
    [700, "#0f766e"],
    [800, "#115e59"],
    [900, "#134e4a"],
    [950, "#042f2e"],
  ],
  cyan: [
    [50, "#ecfeff"],
    [100, "#cffafe"],
    [200, "#a5f3fc"],
    [300, "#67e8f9"],
    [400, "#22d3ee"],
    [500, "#06b6d4"],
    [600, "#0891b2"],
    [700, "#0e7490"],
    [800, "#155e75"],
    [900, "#164e63"],
    [950, "#083344"],
  ],
  sky: [
    [50, "#f0f9ff"],
    [100, "#e0f2fe"],
    [200, "#bae6fd"],
    [300, "#7dd3fc"],
    [400, "#38bdf8"],
    [500, "#0ea5e9"],
    [600, "#0284c7"],
    [700, "#0369a1"],
    [800, "#075985"],
    [900, "#0c4a6e"],
    [950, "#082f49"],
  ],
  blue: [
    [50, "#eff6ff"],
    [100, "#dbeafe"],
    [200, "#bfdbfe"],
    [300, "#93c5fd"],
    [400, "#60a5fa"],
    [500, "#3b82f6"],
    [600, "#2563eb"],
    [700, "#1d4ed8"],
    [800, "#1e40af"],
    [900, "#1e3a8a"],
    [950, "#172554"],
  ],
  indigo: [
    [50, "#eef2ff"],
    [100, "#e0e7ff"],
    [200, "#c7d2fe"],
    [300, "#a5b4fc"],
    [400, "#818cf8"],
    [500, "#6366f1"],
    [600, "#4f46e5"],
    [700, "#4338ca"],
    [800, "#3730a3"],
    [900, "#312e81"],
    [950, "#1e1b4b"],
  ],
  violet: [
    [50, "#f5f3ff"],
    [100, "#ede9fe"],
    [200, "#ddd6fe"],
    [300, "#c4b5fd"],
    [400, "#a78bfa"],
    [500, "#8b5cf6"],
    [600, "#7c3aed"],
    [700, "#6d28d9"],
    [800, "#5b21b6"],
    [900, "#4c1d95"],
    [950, "#2e1065"],
  ],
  purple: [
    [50, "#faf5ff"],
    [100, "#f3e8ff"],
    [200, "#e9d5ff"],
    [300, "#d8b4fe"],
    [400, "#c084fc"],
    [500, "#a855f7"],
    [600, "#9333ea"],
    [700, "#7e22ce"],
    [800, "#6b21a8"],
    [900, "#581c87"],
    [950, "#3b0764"],
  ],
  fuchsia: [
    [50, "#fdf4ff"],
    [100, "#fae8ff"],
    [200, "#f5d0fe"],
    [300, "#f0abfc"],
    [400, "#e879f9"],
    [500, "#d946ef"],
    [600, "#c026d3"],
    [700, "#a21caf"],
    [800, "#86198f"],
    [900, "#701a75"],
    [950, "#4a044e"],
  ],
  pink: [
    [50, "#fdf2f8"],
    [100, "#fce7f3"],
    [200, "#fbcfe8"],
    [300, "#f9a8d4"],
    [400, "#f472b6"],
    [500, "#ec4899"],
    [600, "#db2777"],
    [700, "#be185d"],
    [800, "#9d174d"],
    [900, "#831843"],
    [950, "#500724"],
  ],
  rose: [
    [50, "#fff1f2"],
    [100, "#ffe4e6"],
    [200, "#fecdd3"],
    [300, "#fda4af"],
    [400, "#fb7185"],
    [500, "#f43f5e"],
    [600, "#e11d48"],
    [700, "#be123c"],
    [800, "#9f1239"],
    [900, "#881337"],
    [950, "#4c0519"],
  ],
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/** Full Tailwind v3 color palette: name -> RGB. */
export const COLOR_PALETTE: Array<{
  name: string;
  rgb: [number, number, number];
}> = (() => {
  const out: Array<{ name: string; rgb: [number, number, number] }> = [];
  for (const [family, shades] of Object.entries(PALETTE_RAW)) {
    for (const [shade, hex] of shades) {
      out.push({ name: `${family}-${shade}`, rgb: hexToRgb(hex) });
    }
  }
  return out;
})();

function colorDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Nearest palette token by Euclidean RGB distance. */
export function closestColor(rgb: [number, number, number]): {
  name: string;
  distance: number;
} {
  let best = { name: "gray-0", distance: Infinity };
  for (const c of COLOR_PALETTE) {
    const dist = colorDistance(rgb, c.rgb);
    if (dist < best.distance) {
      best = { name: c.name, distance: dist };
    }
  }
  return best;
}

// ---- Color parsing ----------------------------------------------------------

export interface ParsedColor {
  rgb: [number, number, number];
  alpha: number;
}

export function parseColor(value: string): ParsedColor | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v === "transparent") return { rgb: [0, 0, 0], alpha: 0 };

  const hexMatch = v.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    const clean = hexMatch[1];
    if (clean.length === 3 || clean.length === 4) {
      const r = parseInt(clean[0] + clean[0], 16);
      const g = parseInt(clean[1] + clean[1], 16);
      const b = parseInt(clean[2] + clean[2], 16);
      const alpha =
        clean.length === 4 ? parseInt(clean[3] + clean[3], 16) / 255 : 1;
      return { rgb: [r, g, b], alpha };
    }
    if (clean.length === 6 || clean.length === 8) {
      const r = parseInt(clean.slice(0, 2), 16);
      const g = parseInt(clean.slice(2, 4), 16);
      const b = parseInt(clean.slice(4, 6), 16);
      const alpha =
        clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1;
      return { rgb: [r, g, b], alpha };
    }
    return null;
  }

  const rgbMatch = v.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (rgbMatch) {
    return {
      rgb: [
        Math.round(parseFloat(rgbMatch[1])),
        Math.round(parseFloat(rgbMatch[2])),
        Math.round(parseFloat(rgbMatch[3])),
      ],
      alpha: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  const hslMatch = v.match(
    /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/,
  );
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]);
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    const alpha = hslMatch[4] !== undefined ? parseFloat(hslMatch[4]) : 1;
    const rgb = hslToRgb(h, s, l);
    return { rgb, alpha };
  }

  return null;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

export type ColorPrefix =
  | "bg"
  | "text"
  | "border"
  | "border-t"
  | "border-r"
  | "border-b"
  | "border-l"
  | "ring"
  | "from"
  | "to"
  | "via"
  | "fill"
  | "stroke"
  | "accent"
  | "outline"
  | "decoration"
  | "caret";

/** Map an RGB to a color utility, e.g. `bg-blue-600`. Transparent → `bg-transparent`. */
export function colorToUtility(
  prefix: ColorPrefix,
  rgb: [number, number, number],
  alpha = 1,
): TailwindClass {
  if (alpha === 0) return `${prefix}-transparent`;
  const { name } = closestColor(rgb);
  return `${prefix}-${name}`;
}

// ---- Non-length / non-color mappings ---------------------------------------

const DISPLAY_UTILITIES: Record<string, string> = {
  none: "hidden",
  block: "block",
  inline: "inline",
  "inline-block": "inline-block",
  flex: "flex",
  "inline-flex": "inline-flex",
  grid: "grid",
  "inline-grid": "inline-grid",
  table: "table",
  "inline-table": "inline-table",
  "table-row": "table-row",
  "table-cell": "table-cell",
  contents: "contents",
  "flow-root": "flow-root",
};

const POSITION_UTILITIES: Record<string, string> = {
  static: "static",
  relative: "relative",
  absolute: "absolute",
  fixed: "fixed",
  sticky: "sticky",
};

const FLEX_DIRECTION_UTILITIES: Record<string, string> = {
  row: "flex-row",
  "row-reverse": "flex-row-reverse",
  column: "flex-col",
  "column-reverse": "flex-col-reverse",
};

const JUSTIFY_UTILITIES: Record<string, string> = {
  "flex-start": "justify-start",
  "flex-end": "justify-end",
  center: "justify-center",
  "space-between": "justify-between",
  "space-around": "justify-around",
  "space-evenly": "justify-evenly",
};

const ALIGN_UTILITIES: Record<string, string> = {
  "flex-start": "items-start",
  "flex-end": "items-end",
  center: "items-center",
  baseline: "items-baseline",
  stretch: "items-stretch",
};

const TEXT_ALIGN_UTILITIES: Record<string, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
  justify: "text-justify",
  start: "text-start",
  end: "text-end",
};

const TEXT_TRANSFORM_UTILITIES: Record<string, string> = {
  none: "",
  uppercase: "uppercase",
  lowercase: "lowercase",
  capitalize: "capitalize",
};

const FONT_STYLE_UTILITIES: Record<string, string> = {
  normal: "",
  italic: "italic",
  oblique: "italic",
};

const OVERFLOW_UTILITIES: Record<string, string> = {
  visible: "overflow-visible",
  hidden: "overflow-hidden",
  clip: "overflow-clip",
  scroll: "overflow-scroll",
  auto: "overflow-auto",
};

const CURSOR_UTILITIES: Record<string, string> = {
  auto: "cursor-auto",
  default: "cursor-default",
  pointer: "cursor-pointer",
  wait: "cursor-wait",
  text: "cursor-text",
  move: "cursor-move",
  "not-allowed": "cursor-not-allowed",
  grab: "cursor-grab",
  grabbing: "cursor-grabbing",
};

const WHITESPACE_UTILITIES: Record<string, string> = {
  normal: "whitespace-normal",
  nowrap: "whitespace-nowrap",
  pre: "whitespace-pre",
  prewrap: "whitespace-pre-wrap",
  "pre-line": "whitespace-pre-line",
  "break-spaces": "whitespace-break-spaces",
};

const OPACITY_STEPS: Array<[number, string]> = [
  [0, "opacity-0"],
  [5, "opacity-5"],
  [10, "opacity-10"],
  [15, "opacity-15"],
  [20, "opacity-20"],
  [25, "opacity-25"],
  [30, "opacity-30"],
  [35, "opacity-35"],
  [40, "opacity-40"],
  [45, "opacity-45"],
  [50, "opacity-50"],
  [55, "opacity-55"],
  [60, "opacity-60"],
  [65, "opacity-65"],
  [70, "opacity-70"],
  [75, "opacity-75"],
  [80, "opacity-80"],
  [85, "opacity-85"],
  [90, "opacity-90"],
  [95, "opacity-95"],
  [100, "opacity-100"],
];

const Z_INDEX_STEPS: Array<[number, string]> = [
  [0, "z-0"],
  [10, "z-10"],
  [20, "z-20"],
  [30, "z-30"],
  [40, "z-40"],
  [50, "z-50"],
];

function snapOpacity(value: string): TailwindClass {
  const num = parseFloat(value);
  if (!isFinite(num)) return "";
  const percent = Math.round(num * 100);
  let best = "";
  let bestDist = Infinity;
  for (const [step, cls] of OPACITY_STEPS) {
    const dist = Math.abs(step - percent);
    if (dist < bestDist) {
      bestDist = dist;
      best = cls;
    }
  }
  return bestDist <= 5 ? best : "";
}

function snapZIndex(value: string): TailwindClass {
  const num = Math.round(parseFloat(value));
  if (!isFinite(num)) return "";
  for (const [step, cls] of Z_INDEX_STEPS) {
    if (num === step) return cls;
  }
  return "";
}

/** Snap a grid-template-columns value to a Tailwind grid-cols-N utility (1–12). */
function snapGridCols(val: string): TailwindClass | null {
  const v = val.trim();
  // Computed value like "repeat(3, minmax(0, 1fr))".
  const repeatMatch = v.match(/^repeat\((\d+),/);
  if (repeatMatch) {
    const n = parseInt(repeatMatch[1], 10);
    if (n >= 1 && n <= 12) return `grid-cols-${n}`;
  }
  // Browser-resolved equal pixel tracks, e.g. "200px 200px 200px".
  const pxTracks = v.split(/\s+/).filter((t) => /^\d+(\.\d+)?px$/.test(t));
  if (pxTracks.length >= 1 && pxTracks.length <= 12) {
    return `grid-cols-${pxTracks.length}`;
  }
  return null;
}

// ---- Color property → prefix ------------------------------------------------

const COLOR_PROPERTY_PREFIXES: Record<string, ColorPrefix> = {
  backgroundColor: "bg",
  color: "text",
  borderColor: "border",
  borderTopColor: "border-t",
  borderRightColor: "border-r",
  borderBottomColor: "border-b",
  borderLeftColor: "border-l",
  outlineColor: "outline",
  fill: "fill",
  stroke: "stroke",
  textDecorationColor: "decoration",
  caretColor: "caret",
  accentColor: "accent",
};

// ---- Length property set -----------------------------------------------------

function isLengthProperty(property: string): boolean {
  return (
    property in LENGTH_UTILITIES ||
    property === "borderRadius" ||
    property in BORDER_WIDTH_DIRECTIONS
  );
}
// ---- Pixel parsing ----------------------------------------------------------

function parsePx(value: string): number | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  const match = v.match(/^(-?\d+(?:\.\d+)?)px$/);
  if (match) return parseFloat(match[1]);
  const num = parseFloat(v);
  if (isFinite(num)) return num;
  return null;
}

// ---- Declaration quantization ----------------------------------------------

export interface QuantizeContext {
  /** Font size in px, used to resolve ratio-based utilities (line-height, letter-spacing). */
  fontSizePx?: number;
}

function skipped(property: string, value: string, skipReason: string): QuantizedDeclaration {
  return { property, value, className: '', confidence: 'skipped', skipReason };
}

/**
 * Quantize a single computed CSS declaration into a Tailwind utility.
 * Routes length/color/number/radius/shadow/typography properties to the
 * appropriate snap helpers. Never emits arbitrary brackets.
 */
export function quantizeDeclaration(
  property: string,
  value: string,
  context: QuantizeContext = {},
): QuantizedDeclaration {
  const prop = property;
  const val = value;

  // Colors
  const colorPrefix = COLOR_PROPERTY_PREFIXES[prop];
  if (colorPrefix) {
    const parsed = parseColor(val);
    if (!parsed) return skipped(prop, val, 'unresolvable color value');
    const cls = colorToUtility(colorPrefix, parsed.rgb, parsed.alpha);
    if (!cls) return skipped(prop, val, 'unmappable color');
    return {
      property: prop,
      value: val,
      className: cls,
      confidence: parsed.alpha === 0 ? 'exact' : 'snapped',
    };
  }

  // Lengths
  if (isLengthProperty(prop)) {
    if (prop === 'borderRadius' && val.includes('%')) {
      return { property: prop, value: val, className: 'rounded-full', confidence: 'exact' };
    }
    const px = parsePx(val);
    if (px === null) return skipped(prop, val, 'non-px length value');
    const cls = pxToUtility(prop, px);
    if (!cls) return skipped(prop, val, 'unsnappable length');
    return { property: prop, value: val, className: cls, confidence: 'snapped' };
  }

  // Typography
  if (prop === 'fontSize') {
    const px = parsePx(val);
    if (px === null) return skipped(prop, val, 'non-px font size');
    const cls = snapFontSize(px);
    if (!cls) return skipped(prop, val, 'unsnappable font size');
    return { property: prop, value: val, className: cls, confidence: 'snapped' };
  }
  if (prop === 'fontWeight') {
    const w = parseFloat(val);
    if (!isFinite(w)) return skipped(prop, val, 'non-numeric weight');
    const cls = snapFontWeight(w);
    if (!cls) return skipped(prop, val, 'unsnappable weight');
    return { property: prop, value: val, className: cls, confidence: 'snapped' };
  }
  if (prop === 'lineHeight') {
    const linePx = parsePx(val);
    if (linePx === null) return skipped(prop, val, 'non-px line height');
    const fontPx = context.fontSizePx;
    if (fontPx === undefined || fontPx <= 0) return skipped(prop, val, 'missing font size for line height');
    const cls = snapLineHeight(linePx, fontPx);
    if (!cls) return skipped(prop, val, 'unsnappable line height');
    return { property: prop, value: val, className: cls, confidence: 'snapped' };
  }
  if (prop === 'letterSpacing') {
    const px = parsePx(val);
    if (px === null) return skipped(prop, val, 'non-px letter spacing');
    const fontPx = context.fontSizePx;
    if (fontPx === undefined || fontPx <= 0) return skipped(prop, val, 'missing font size for letter spacing');
    if (px === 0) return { property: prop, value: val, className: 'tracking-normal', confidence: 'exact' };
    const em = px / fontPx;
    const absEm = Math.abs(em);
    if (absEm <= 0.03) return { property: prop, value: val, className: px < 0 ? 'tracking-tight' : 'tracking-wide', confidence: 'snapped' };
    if (absEm <= 0.06) return { property: prop, value: val, className: px < 0 ? 'tracking-tighter' : 'tracking-wider', confidence: 'snapped' };
    if (absEm <= 0.12) return { property: prop, value: val, className: px < 0 ? 'tracking-tighter' : 'tracking-widest', confidence: 'snapped' };
    return skipped(prop, val, 'unsnappable letter spacing');
  }
  if (prop === 'fontFamily') {
    return skipped(prop, val, 'font-family left to parent');
  }

  // Shadow
  if (prop === 'boxShadow') {
    const cls = snapShadow(val);
    if (!cls) return skipped(prop, val, 'complex or unmatched shadow');
    return { property: prop, value: val, className: cls, confidence: 'snapped' };
  }

  // Display / layout
  if (prop === 'display') {
    const cls = DISPLAY_UTILITIES[val];
    if (cls) return { property: prop, value: val, className: cls, confidence: 'exact' };
    return skipped(prop, val, 'unmappable display');
  }
  if (prop === 'gridTemplateColumns') {
    const cls = snapGridCols(val);
    if (cls) return { property: prop, value: val, className: cls, confidence: 'snapped' };
    return skipped(prop, val, 'unmappable grid-template-columns');
  }
  if (prop === 'position') {
    const cls = POSITION_UTILITIES[val];
    if (cls) return { property: prop, value: val, className: cls, confidence: 'exact' };
    return skipped(prop, val, 'unmappable position');
  }
  if (prop === 'flexDirection') {
    const cls = FLEX_DIRECTION_UTILITIES[val];
    if (cls) return { property: prop, value: val, className: cls, confidence: 'exact' };
    return skipped(prop, val, 'unmappable flex-direction');
  }
  if (prop === 'justifyContent') {
    const cls = JUSTIFY_UTILITIES[val];
    if (cls) return { property: prop, value: val, className: cls, confidence: 'exact' };
    return skipped(prop, val, 'unmappable justify-content');
  }
  if (prop === 'alignItems') {
    const cls = ALIGN_UTILITIES[val];
    if (cls) return { property: prop, value: val, className: cls, confidence: 'exact' };
    return skipped(prop, val, 'unmappable align-items');
  }
  if (prop === 'textAlign') {
    const cls = TEXT_ALIGN_UTILITIES[val];
    if (cls) return { property: prop, value: val, className: cls, confidence: 'exact' };
    return skipped(prop, val, 'unmappable text-align');
  }
  if (prop === 'textTransform') {
    if (val === 'none') return skipped(prop, val, 'text-transform reset');
    const cls = TEXT_TRANSFORM_UTILITIES[val];
    if (cls) return { property: prop, value: val, className: cls, confidence: 'exact' };
    return skipped(prop, val, 'unmappable text-transform');
  }
  if (prop === 'fontStyle') {
    if (val === 'normal') return skipped(prop, val, 'font-style reset');
    const cls = FONT_STYLE_UTILITIES[val];
    if (cls) return { property: prop, value: val, className: cls, confidence: 'exact' };
    return skipped(prop, val, 'unmappable font-style');
  }
  if (prop === 'overflow' || prop === 'overflowX' || prop === 'overflowY') {
    const cls = OVERFLOW_UTILITIES[val];
    if (cls) return { property: prop, value: val, className: cls, confidence: 'exact' };
    return skipped(prop, val, 'unmappable overflow');
  }
  if (prop === 'cursor') {
    const cls = CURSOR_UTILITIES[val];
    if (cls) return { property: prop, value: val, className: cls, confidence: 'exact' };
    if (val === 'auto') return skipped(prop, val, 'cursor reset');
    return skipped(prop, val, 'unmappable cursor');
  }
  if (prop === 'whiteSpace') {
    const normalized = val === 'pre-wrap' ? 'prewrap' : val;
    const cls = WHITESPACE_UTILITIES[normalized];
    if (cls) return { property: prop, value: val, className: cls, confidence: 'exact' };
    return skipped(prop, val, 'unmappable white-space');
  }
  if (prop === 'opacity') {
    const cls = snapOpacity(val);
    if (!cls) return skipped(prop, val, 'unsnappable opacity');
    return { property: prop, value: val, className: cls, confidence: 'snapped' };
  }
  if (prop === 'zIndex') {
    const cls = snapZIndex(val);
    if (!cls) return skipped(prop, val, 'unsnappable z-index');
    return { property: prop, value: val, className: cls, confidence: 'snapped' };
  }
  if (prop === 'backgroundImage') {
    return skipped(prop, val, 'background-image dropped (gradient soup)');
  }
  if (prop === 'backgroundSize') {
    if (val === 'cover') return { property: prop, value: val, className: 'bg-cover', confidence: 'exact' };
    if (val === 'contain') return { property: prop, value: val, className: 'bg-contain', confidence: 'exact' };
    return skipped(prop, val, 'unsnappable background-size');
  }
  if (prop === 'backgroundRepeat') {
    if (val === 'repeat') return { property: prop, value: val, className: 'bg-repeat', confidence: 'exact' };
    if (val === 'no-repeat') return { property: prop, value: val, className: 'bg-no-repeat', confidence: 'exact' };
    if (val === 'repeat-x') return { property: prop, value: val, className: 'bg-repeat-x', confidence: 'exact' };
    if (val === 'repeat-y') return { property: prop, value: val, className: 'bg-repeat-y', confidence: 'exact' };
    return skipped(prop, val, 'unsnappable background-repeat');
  }
  if (prop === 'backgroundPosition') {
    const mapping: Record<string, string> = {
      '0% 0%': 'bg-left-top',
      '100% 0%': 'bg-right-top',
      '0% 100%': 'bg-left-bottom',
      '100% 100%': 'bg-right-bottom',
      '50% 0%': 'bg-top',
      '50% 100%': 'bg-bottom',
      '0% 50%': 'bg-left',
      '100% 50%': 'bg-right',
      '50% 50%': 'bg-center',
    };
    const cls = mapping[val];
    if (cls) return { property: prop, value: val, className: cls, confidence: 'exact' };
    return skipped(prop, val, 'unsnappable background-position');
  }
  if (prop === 'boxSizing') {
    if (val === 'border-box') return { property: prop, value: val, className: 'box-border', confidence: 'exact' };
    if (val === 'content-box') return { property: prop, value: val, className: 'box-content', confidence: 'exact' };
    return skipped(prop, val, 'unmappable box-sizing');
  }
  if (prop === 'verticalAlign') {
    const map: Record<string, string> = {
      baseline: 'align-baseline',
      top: 'align-top',
      middle: 'align-middle',
      bottom: 'align-bottom',
      'text-top': 'align-text-top',
      'text-bottom': 'align-text-bottom',
    };
    const cls = map[val];
    if (cls) return { property: prop, value: val, className: cls, confidence: 'exact' };
    return skipped(prop, val, 'unsnappable vertical-align');
  }

  return skipped(prop, val, 'property not mapped to a Tailwind utility');
}
