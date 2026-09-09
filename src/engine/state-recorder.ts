// Hybrid state capture.
//
// Static CSSOM analysis extracts `:hover`, `:active`, `:focus`,
// `:focus-within` declarations from the page's stylesheets (authoritative for
// CSS pseudo-class states, since synthetic events cannot set `:hover`). A
// synthetic pass dispatches real DOM events and measures computed-style
// deltas, catching JS-driven hover/active handlers. Both passes converge into
// `hover:`/`active:`/`focus:` Tailwind variants.

import type { ExtractionResult, StateVariant, TailwindClass } from "./types";
import { diffElementStyles } from "./style-diff";
import {
  quantizeDeclaration,
  snapTransition,
  type QuantizeContext,
} from "./tailwind-quantizer";

// ---- Static CSSOM pseudo rules ---------------------------------------------

export type StaticPseudo = "hover" | "active" | "focus" | "focus-within";

export interface StaticPseudoRule {
  pseudo: StaticPseudo;
  declarations: Record<string, string>;
}

const STATIC_PSEUDOS: StaticPseudo[] = [
  "hover",
  "active",
  "focus",
  "focus-within",
];

function containsPseudo(selector: string, pseudo: string): boolean {
  const re = new RegExp(`:${pseudo}(?=[^a-zA-Z0-9_-]|$)`);
  return re.test(selector);
}

function stripPseudo(selector: string, pseudo: string): string {
  return selector.replace(
    new RegExp(`:${pseudo}(?=[^a-zA-Z0-9_-]|$)`, "g"),
    "",
  );
}

function matchesCandidate(selector: string, el: Element): boolean {
  let node: Element | null = el;
  while (node) {
    try {
      if (node.matches(selector)) return true;
    } catch {
      // Invalid selector — skip this candidate.
    }
    node = node.parentElement;
  }
  return false;
}

function mediaApplies(mediaText: string): boolean {
  const text = (mediaText || "").trim();
  if (!text || text === "all") return true;
  try {
    return window.matchMedia(text).matches;
  } catch {
    return true;
  }
}

function extractDeclarations(
  style: CSSStyleDeclaration,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < style.length; i++) {
    const name = style[i];
    out[name] = style.getPropertyValue(name);
  }
  return out;
}

function handleStyleRule(
  rule: CSSStyleRule,
  el: HTMLElement,
  merged: Map<StaticPseudo, Record<string, string>>,
): void {
  let selectorText: string;
  try {
    selectorText = rule.selectorText;
  } catch {
    return;
  }
  if (!selectorText) return;

  for (const pseudo of STATIC_PSEUDOS) {
    if (!containsPseudo(selectorText, pseudo)) continue;
    // Skip if the selector does not (after removing the pseudo) target the
    // element or one of its ancestors.
    const parts = selectorText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    let applies = false;
    for (const part of parts) {
      const stripped = stripPseudo(part, pseudo).trim();
      if (!stripped) continue;
      if (matchesCandidate(stripped, el)) {
        applies = true;
        break;
      }
    }
    if (!applies) continue;
    const existing = merged.get(pseudo);
    if (existing) {
      Object.assign(existing, extractDeclarations(rule.style));
    } else {
      merged.set(pseudo, extractDeclarations(rule.style));
    }
  }
}

function walkRules(
  rules: CSSRuleList,
  el: HTMLElement,
  merged: Map<StaticPseudo, Record<string, string>>,
): void {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      handleStyleRule(rule, el, merged);
    } else if (rule instanceof CSSMediaRule) {
      if (mediaApplies(rule.conditionText || "")) {
        walkRules(rule.cssRules, el, merged);
      }
    } else if (rule instanceof CSSSupportsRule) {
      const condition = rule.conditionText || "";
      try {
        if (CSS.supports(condition)) {
          walkRules(rule.cssRules, el, merged);
        }
      } catch {
        // Unparseable condition — skip.
      }
    }
  }
}

/**
 * Collect :hover/:active/:focus/:focus-within declarations that apply to the
 * element or an ancestor. Cross-origin stylesheets that throw on `.cssRules`
 * access are skipped. `:visited` is excluded from the returned static rules
 * (browsers refuse to read its declared styles for security).
 */
export function collectStaticPseudoRules(el: HTMLElement): StaticPseudoRule[] {
  const merged = new Map<StaticPseudo, Record<string, string>>();
  const sheets = Array.from(document.styleSheets);
  for (const sheet of sheets) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // Cross-origin stylesheet.
    }
    if (!rules) continue;
    walkRules(rules, el, merged);
  }

  return STATIC_PSEUDOS.filter((pseudo) => merged.has(pseudo)).map(
    (pseudo) => ({
      pseudo,
      declarations: merged.get(pseudo)!,
    }),
  );
}

// ---- Helpers ---------------------------------------------------------------

function toCamelCase(name: string): string {
  if (!name.includes("-") || name.startsWith("--")) return name;
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function snapshotComputed(el: HTMLElement): Record<string, string> {
  const cs = getComputedStyle(el);
  const out: Record<string, string> = {};
  for (let i = 0; i < cs.length; i++) {
    const name = cs[i];
    out[name] = cs.getPropertyValue(name);
  }
  return out;
}

function computeDelta(
  before: Record<string, string>,
  after: Record<string, string>,
): Record<string, string> {
  const delta: Record<string, string> = {};
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) delta[key] = after[key];
  }
  return delta;
}

function waitFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = count;
    const tick = (): void => {
      remaining--;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function dispatchBubbling(el: Element, type: string): void {
  el.dispatchEvent(
    new MouseEvent(type, { bubbles: true, cancelable: true, composed: true }),
  );
}

interface InlineSnapshot {
  style: string | null;
}

function saveInline(el: HTMLElement): InlineSnapshot {
  return { style: el.getAttribute("style") };
}

function restoreInline(el: HTMLElement, snap: InlineSnapshot): void {
  if (snap.style === null) el.removeAttribute("style");
  else el.setAttribute("style", snap.style);
}

// ---- Quantizing delta/static declarations ----------------------------------

function toDeclarationsClasses(
  declarations: Record<string, string>,
  context: QuantizeContext,
  prefix: "hover" | "active" | "focus",
): TailwindClass[] {
  const classes: TailwindClass[] = [];
  const seen = new Set<string>();
  for (const rawName of Object.keys(declarations)) {
    const camel = toCamelCase(rawName);
    const value = declarations[rawName];
    const q = quantizeDeclaration(camel, value, context);
    if (q.confidence !== "skipped" && q.className) {
      const cls = `${prefix}:${q.className}`;
      if (!seen.has(cls)) {
        seen.add(cls);
        classes.push(cls);
      }
    }
  }
  return classes;
}

// ---- Synthetic event pass ---------------------------------------------------

async function captureSyntheticDelta(
  el: HTMLElement,
  baseline: Record<string, string>,
  events: Array<() => void>,
): Promise<Record<string, string>> {
  for (const evt of events) evt();
  await waitFrames(2);
  const after = snapshotComputed(el);
  return computeDelta(baseline, after);
}

/**
 * Capture interactive states for the element using the hybrid method.
 * CSSOM-static rules are authoritative for `:hover`/`:active`/`:focus`; the
 * synthetic pass catches JS-driven state changes that CSSOM cannot see.
 */
export async function captureInteractiveStates(
  el: HTMLElement,
): Promise<ExtractionResult> {
  const base = diffElementStyles(el);
  const computed = getComputedStyle(el);
  const fontSizePx = parseFloat(computed.fontSize);
  const context: QuantizeContext = { fontSizePx };

  // Static CSSOM pass — authoritative for CSS pseudo-class states.
  const staticRules = collectStaticPseudoRules(el);

  // Synthetic pass — snapshot, dispatch hover events, measure, clean up; then
  // dispatch active events, measure, clean up.
  const baseline = snapshotComputed(el);
  let hoverDelta: Record<string, string> = {};
  let activeDelta: Record<string, string> = {};

  if (el.isConnected) {
    const inlineSnap = saveInline(el);

    hoverDelta = await captureSyntheticDelta(el, baseline, [
      () => dispatchBubbling(el, "mouseover"),
      () => dispatchBubbling(el, "mouseenter"),
      () => dispatchBubbling(el, "mousemove"),
    ]);

    // Clean up hover side effects.
    dispatchBubbling(el, "mouseleave");
    await waitFrames(2);

    if (el.isConnected) {
      activeDelta = await captureSyntheticDelta(el, baseline, [
        () => dispatchBubbling(el, "mousedown"),
        () =>
          document.body.dispatchEvent(
            new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
          ),
        () => dispatchBubbling(el, "mouseup"),
        () => dispatchBubbling(el, "click"),
      ]);

      // Clean up active side effects.
      dispatchBubbling(el, "mouseup");
      dispatchBubbling(el, "click");
      document.body.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
      );
      await waitFrames(2);
    }

    // Restore any inline style mutations triggered by page JS on these events.
    if (el.isConnected) restoreInline(el, inlineSnap);
  }

  // Build variants: static wins for each pseudo, then merge synthetic deltas.
  const variants: StateVariant[] = [];

  const staticClassesFor = (pseudo: StaticPseudo): TailwindClass[] => {
    const rule = staticRules.find((r) => r.pseudo === pseudo);
    if (!rule) return [];
    return toDeclarationsClasses(
      rule.declarations,
      context,
      pseudo as "hover" | "active" | "focus",
    );
  };

  const mergeVariants = (pseudo: "hover" | "active" | "focus"): void => {
    const staticClasses = staticClassesFor(pseudo);
    const syntheticClasses =
      pseudo === "hover"
        ? toDeclarationsClasses(hoverDelta, context, "hover")
        : pseudo === "active"
          ? toDeclarationsClasses(activeDelta, context, "active")
          : [];
    const seen = new Set<string>();
    const merged: TailwindClass[] = [];
    for (const cls of [...staticClasses, ...syntheticClasses]) {
      if (!seen.has(cls)) {
        seen.add(cls);
        merged.push(cls);
      }
    }
    if (merged.length > 0) {
      variants.push({ pseudo, classes: merged });
    }
  };

  mergeVariants("hover");
  mergeVariants("active");
  mergeVariants("focus");

  const transition = snapTransition(
    computed.transitionProperty,
    computed.transitionDuration,
    computed.transitionTimingFunction,
    computed.transitionDelay,
  );

  return { base, variants, transition: transition ?? undefined };
}
