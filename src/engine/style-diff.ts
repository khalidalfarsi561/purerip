// Default-baseline style diffing.
//
// Produces a DiffResult by comparing the element's computed style against a
// "default baseline": a deep clone of the element with all classes/ids/inline
// styles stripped, rendered off-screen inside an `all: initial` reset wrapper.
// Combined with a comparison against the parent's computed value, this removes
// inherited boilerplate and only emits meaningful author styles.

import type { DiffResult } from './types';

let activeBaselineWrapper: HTMLElement | null = null;

/**
 * Build a genuine user-agent default baseline for the element.
 * Returns the live computed style of a stripped clone. The wrapper is cleaned
 * up by the caller via `cleanupBaseline()`.
 */
export function getDefaultBaseline(el: HTMLElement): CSSStyleDeclaration {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.removeAttribute('class');
  clone.removeAttribute('id');
  clone.removeAttribute('style');

  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'position:absolute; left:-99999px; top:0; visibility:hidden;';
  wrapper.style.setProperty('all', 'initial');
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  // Force reflow so computed styles settle.
  void clone.offsetHeight;

  activeBaselineWrapper = wrapper;
  return getComputedStyle(clone);
}

function cleanupBaseline(): void {
  if (activeBaselineWrapper) {
    activeBaselineWrapper.remove();
    activeBaselineWrapper = null;
  }
}

function shouldSkipProperty(name: string): boolean {
  if (name.startsWith('--')) return true; // custom props
  if (name.startsWith('-webkit-')) return true;
  if (name.startsWith('-moz-')) return true;
  if (name.startsWith('-ms-')) return true;
  return false;
}

function toCamelCase(name: string): string {
  if (!name.includes('-') || name.startsWith('--')) return name;
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Diff the element's computed style against the default baseline and the
 * parent's computed value. Returns `own` (meaningful author style) and
 * `inherited` (copied from an ancestor, excluded from output).
 */
export function diffElementStyles(el: HTMLElement): DiffResult {
  const computed = getComputedStyle(el);
  const baseline = getDefaultBaseline(el);
  const parent = el.parentElement;
  const parentComputed = parent ? getComputedStyle(parent) : null;

  const own: Record<string, string> = {};
  const inherited: Record<string, string> = {};

  try {
    for (let i = 0; i < computed.length; i++) {
      const rawName = computed[i];
      if (shouldSkipProperty(rawName)) continue;

      const name = toCamelCase(rawName);
      const val = computed.getPropertyValue(rawName);

      const baseVal = baseline.getPropertyValue(rawName);
      if (val === baseVal) continue;

      const parentVal = parentComputed ? parentComputed.getPropertyValue(rawName) : null;
      if (parentVal !== null && val === parentVal) {
        inherited[name] = val;
      } else {
        own[name] = val;
      }
    }
  } finally {
    cleanupBaseline();
  }

  return { element: el, own, inherited };
}

/**
 * Resolve a `var(--x)` chain on an element. Returns the literal value or the
 * fallback, or null when unresolved.
 */
export function resolveCustomProperty(el: HTMLElement, prop: string): string | null {
  const computed = getComputedStyle(el);
  const inline = (el as HTMLElement).style;
  const raw = inline.getPropertyValue(prop) || inline.getPropertyValue(prop.toLowerCase());

  if (!raw) return null;

  const trimmed = raw.trim();
  const varMatch = trimmed.match(/^var\((--[^,)]+)(?:,\s*(.*))?\)$/);
  if (!varMatch) return trimmed;

  const varName = varMatch[1];
  const fallback = varMatch[2];
  const resolved = computed.getPropertyValue(varName).trim();
  if (resolved) return resolved;
  return fallback ? fallback.trim() : null;
}
