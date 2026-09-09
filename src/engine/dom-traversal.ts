// DOM traversal & sanitization.
//
// Clones a live subtree, strips scripts/handlers/ids, removes comments and
// disallowed tags, then builds a normalized NormalNode tree capped by depth and
// node count. This is the first stage of the decompilation pipeline.

import type { NormalNode } from './types';

// ---- Void elements ----------------------------------------------------------

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/** True when the tag is a void (self-closing in HTML) element. */
export function isVoidElement(tag: string): boolean {
  return VOID_ELEMENTS.has(tag.toLowerCase());
}

// ---- Interactive roles ------------------------------------------------------

const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'tab',
  'menuitem',
  'checkbox',
  'radio',
  'switch',
  'option',
]);

/**
 * True if the element is interactive (a button, linked anchor, form control,
 * or an element with an interactive ARIA role / contenteditable).
 */
export function elementMatchesInteractiveRoles(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'button') return true;
  if (tag === 'a' && el.hasAttribute('href')) return true;
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return true;
  const role = el.getAttribute('role');
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  if (el.getAttribute('contenteditable') !== null) return true;
  return false;
}

// ---- Sanitize & clone -------------------------------------------------------

const REMOVED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'link',
  'meta',
  'template',
]);

export interface SanitizeOptions {
  /** Keep `data-*` attributes (default false — they are stripped). */
  keepDataAttrs?: boolean;
}

function cleanElementAttributes(el: Element, keepDataAttrs: boolean): void {
  const interactive = elementMatchesInteractiveRoles(el);
  const attrs = Array.from(el.attributes);
  for (const attr of attrs) {
    const name = attr.name.toLowerCase();
    if (name === 'id') {
      el.removeAttribute(attr.name);
    } else if (name.startsWith('on')) {
      el.removeAttribute(attr.name);
    } else if (name === 'tabindex' && !interactive) {
      el.removeAttribute(attr.name);
    } else if (name.startsWith('data-') && !keepDataAttrs) {
      el.removeAttribute(attr.name);
    }
  }
}

function cleanNode(node: Node, keepDataAttrs: boolean): void {
  // Iterate in reverse so removal is safe.
  for (let i = node.childNodes.length - 1; i >= 0; i--) {
    const child = node.childNodes[i];
    if (child.nodeType === Node.COMMENT_NODE) {
      child.remove();
      continue;
    }
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      if (REMOVED_TAGS.has(el.tagName.toLowerCase())) {
        el.remove();
        continue;
      }
      cleanElementAttributes(el, keepDataAttrs);
      cleanNode(el, keepDataAttrs);
    }
  }
}

/**
 * Deep-clone `root`, then strip disallowed tags, comments, event handlers,
 * ids, non-interactive `tabindex`, and (by default) `data-*` attributes.
 * Returns the cleaned clone — the live element is never mutated.
 */
export function sanitizeAndClone(
  root: Element,
  opts: SanitizeOptions = {},
): Element {
  const keepDataAttrs = opts.keepDataAttrs ?? false;
  const clone = root.cloneNode(true) as Element;
  cleanElementAttributes(clone, keepDataAttrs);
  cleanNode(clone, keepDataAttrs);
  return clone;
}

// ---- Tree build -------------------------------------------------------------

export interface BuildTreeOptions {
  /** Maximum nesting depth (default 12). */
  maxDepth?: number;
  /** Maximum number of emitted nodes (default 200). */
  maxNodes?: number;
}

interface BuildState {
  count: number;
  limit: number;
  truncated: boolean;
}

function makeTextNode(text: string): NormalNode {
  return { kind: 'text', tag: '#text', props: {}, children: [], text };
}

function buildNode(
  el: Element,
  depth: number,
  maxDepth: number,
  state: BuildState,
): NormalNode {
  if (state.count >= state.limit) {
    state.truncated = true;
    return { kind: 'comment', tag: '#truncated', props: {}, children: [] };
  }
  state.count++;

  const props: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    props[attr.name] = attr.value;
  }

  const node: NormalNode = {
    kind: 'element',
    tag: el.tagName.toLowerCase(),
    props,
    children: [],
  };
  if (elementMatchesInteractiveRoles(el)) {
    node.styleNote = 'interactive';
  }

  if (depth >= maxDepth) {
    return node;
  }

  const children: NormalNode[] = [];
  let pendingText = '';

  const flushText = (): void => {
    const trimmed = pendingText.trim();
    if (trimmed.length > 0 && state.count < state.limit) {
      state.count++;
      children.push(makeTextNode(trimmed));
    }
    pendingText = '';
  };

  for (const child of Array.from(el.childNodes)) {
    if (state.count >= state.limit) {
      state.truncated = true;
      flushText();
      break;
    }
    if (child.nodeType === Node.ELEMENT_NODE) {
      if (pendingText.trim().length > 0) flushText();
      children.push(buildNode(child as Element, depth + 1, maxDepth, state));
    } else if (child.nodeType === Node.TEXT_NODE) {
      pendingText += child.textContent ?? '';
    }
  }
  flushText();

  node.children = children;
  return node;
}

/**
 * Convert a sanitized clone into its normalized NormalNode tree.
 * Applies `maxDepth` and `maxNodes` caps and coalesces adjacent whitespace
 * text nodes.
 */
export function buildTree(
  root: Element,
  opts: BuildTreeOptions = {},
): NormalNode {
  const maxDepth = opts.maxDepth ?? 12;
  const maxNodes = opts.maxNodes ?? 200;
  const state: BuildState = { count: 0, limit: maxNodes, truncated: false };
  return buildNode(root, 0, maxDepth, state);
}
