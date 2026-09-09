// React TSX + pure Tailwind HTML compiler.
//
// Turns a NormalNode tree into a complete React (TypeScript) component source,
// a pure Tailwind HTML version, and sanitized preview markup. It also extracts
// the primary content text into a typed prop (label / title / text) and wires
// an onClick handler when the root is interactive.

import type {
  ComponentPropsMap,
  CompiledComponent,
  ExtractionResult,
  NormalNode,
  TailwindClass,
} from './types';
import {
  parseColor,
  quantizeDeclaration,
  type QuantizeContext,
} from './tailwind-quantizer';
import { diffElementStyles } from './style-diff';
import { isVoidElement, REMOVED_TAGS } from './dom-traversal';

// ---- Attribute mapping ------------------------------------------------------

const ATTR_MAP: Record<string, string> = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  contenteditable: 'contentEditable',
  autocomplete: 'autoComplete',
  autofocus: 'autoFocus',
  srcset: 'srcSet',
  charset: 'charSet',
  'http-equiv': 'httpEquiv',
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'fill-rule': 'fillRule',
  'clip-rule': 'clipRule',
  'stroke-miterlimit': 'strokeMiterlimit',
  'xlink:href': 'xlinkHref',
  viewbox: 'viewBox',
};

/** Map an HTML attribute name to the equivalent React JSX attribute name. */
export function attrToJsx(name: string): string {
  const lower = name.toLowerCase();
  if (ATTR_MAP[lower]) return ATTR_MAP[lower];
  if (lower.startsWith('aria-') || lower.startsWith('data-')) return lower;
  if (/[A-Z]/.test(name)) return name; // Already camelCase (SVG).
  if (!name.includes('-')) return lower;
  return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

const BOOL_ATTRS = new Set([
  'disabled',
  'checked',
  'selected',
  'required',
  'readonly',
  'multiple',
  'autofocus',
  'autoplay',
  'controls',
  'loop',
  'muted',
  'open',
  'hidden',
  'async',
  'defer',
  'nomodule',
  'allowfullscreen',
  'capture',
  'itemscope',
]);

/** True when the tag is a void (self-closing in HTML) element. */
export function isVoid(tag: string): boolean {
  return isVoidElement(tag);
}

// ---- Style parsing / serialization ------------------------------------------

function camelizeStyleProp(prop: string): string {
  const p = prop.trim();
  if (
    p.startsWith('-webkit-') ||
    p.startsWith('-moz-') ||
    p.startsWith('-ms-') ||
    p.startsWith('-o-')
  ) {
    const dashIdx = p.indexOf('-', 1);
    const prefix = p.slice(0, dashIdx + 1); // e.g. "-webkit-"
    const rest = p.slice(prefix.length);
    return (
      prefix[1].toUpperCase() +
      rest.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    );
  }
  return p.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function camelToKebab(s: string): string {
  const dashed = s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  if (s[0] === s[0].toUpperCase() && s[0] !== s[0].toLowerCase()) {
    return '-' + dashed; // Vendor prefix, e.g. WebkitTransform -> -webkit-transform
  }
  return dashed;
}

function parseStyleAttr(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!css) return out;
  for (const decl of css.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (!prop || !value) continue;
    out[camelizeStyleProp(prop)] = value;
  }
  return out;
}

function objectToCss(obj: Record<string, string>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${camelToKebab(k)}: ${v}`)
    .join('; ');
}

const STYLE_WORTHY_PROPS = new Set([
  'transform',
  'filter',
  'backdropFilter',
  'clipPath',
  'objectFit',
  'objectPosition',
  'mixBlendMode',
  'maskImage',
  'WebkitMaskImage',
  'textShadow',
  'perspective',
  'willChange',
  'flex',
  'gridTemplateColumns',
  'gridTemplateRows',
  'columnCount',
]);

/** Computed origin props that browsers fill with pixel noise on every element. */
const COMPUTED_ORIGIN_PROPS = new Set(['transformOrigin', 'perspectiveOrigin']);

/** True when a transform string is the identity (or absent), i.e. no real transform. */
function isIdentityTransform(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v || v === 'none') return true;
  const compact = v.replace(/\s+/g, '');
  return compact === 'matrix(1,0,0,1,0,0)';
}

/**
 * Matches Tailwind text *color* utilities (text-zinc-50, text-white,
 * text-transparent, …) but NOT text-size/alignment utilities (text-sm,
 * text-left, …). Used to strip a dark authored text token when we force a light
 * one for contrast.
 */
const TEXT_COLOR_CLASS_RE =
  /^text-(white|black|transparent|current|inherit|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-\d{2,3})?$/;

// ---- Text sanitization ------------------------------------------------------

// Build HTML/JSX entity strings at runtime so the write layer never decodes
// them as HTML entities.
const AMP = String.fromCharCode(38); // "&"

function jsxEntity(code: string): string {
  return AMP + code;
}

/** Escape `{`, `}` and `<` in literal JSX text (React-safe, keeps entities). */
export function sanitizeJsxText(text: string): string {
  return text
    .replace(/\{/g, jsxEntity('#123;'))
    .replace(/\}/g, jsxEntity('#125;'))
    .replace(/</g, jsxEntity('lt;'));
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, jsxEntity('amp;'))
    .replace(/</g, jsxEntity('lt;'))
    .replace(/>/g, jsxEntity('gt;'))
    .replace(/"/g, jsxEntity('quot;'))
    .replace(/'/g, jsxEntity('#39;'));
}

// ---- Tree utilities ---------------------------------------------------------

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

// ---- Directional class deduplication ----------------------------------------

const SHORTHAND_COVERS: Record<string, string[]> = {
  p: ['px', 'py', 'pt', 'pr', 'pb', 'pl'],
  m: ['mx', 'my', 'mt', 'mr', 'mb', 'ml'],
  px: ['pl', 'pr'],
  py: ['pt', 'pb'],
  mx: ['ml', 'mr'],
  my: ['mt', 'mb'],
  gap: ['gap-x', 'gap-y'],
  inset: ['inset-x', 'inset-y', 'top', 'right', 'bottom', 'left'],
  'inset-x': ['left', 'right'],
  'inset-y': ['top', 'bottom'],
};

function directionalPrefix(cls: string): { prefix: string; value: string } | null {
  const m = cls.match(/^([a-z][a-z-]*)-(.*)$/);
  if (!m) return null;
  return { prefix: m[1], value: m[2] };
}

/**
 * Actively synthesize directional shorthands from matching longhands so the
 * emitted utility list is as compact as possible. Pairs must share the same
 * value:
 *   pt-X  pb-X          -> py-X
 *   pl-X  pr-X          -> px-X
 *   py-X  px-X          -> p-X
 *   gap-x-X  gap-y-X    -> gap-X
 */
function synthesizeDirectionalClasses(classes: string[]): string[] {
  let result = [...classes];

  const combine = (
    first: string,
    second: string,
    shorthand: string,
  ): void => {
    const byValue = new Map<
      string,
      { first?: string; second?: string }
    >();
    for (const cls of result) {
      const parsed = directionalPrefix(cls);
      if (!parsed) continue;
      if (parsed.prefix !== first && parsed.prefix !== second) continue;
      const entry = byValue.get(parsed.value) ?? {};
      if (parsed.prefix === first) entry.first = cls;
      else entry.second = cls;
      byValue.set(parsed.value, entry);
    }
    for (const [value, entry] of byValue) {
      if (!entry.first || !entry.second) continue;
      const shorthandClass = `${shorthand}-${value}`;
      result = result.filter((c) => c !== entry.first && c !== entry.second);
      if (!result.includes(shorthandClass)) {
        result.push(shorthandClass);
      }
    }
  };

  combine('pt', 'pb', 'py');
  combine('pl', 'pr', 'px');
  combine('py', 'px', 'p');
  combine('gap-x', 'gap-y', 'gap');

  return result;
}

/**
 * Drop longhand direction utilities that a shorthand already covers, e.g.
 * `py-5` removes `pt-5`/`pb-5`, `px-2` removes `pl-2`/`pr-2`, and `gap-5`
 * removes `gap-x-5`/`gap-y-5`. Only redundant pairs with matching values are
 * removed, so an explicit `pt-6` alongside `p-4` survives (it overrides).
 */
export function dedupeDirectionalClasses(classes: string[]): string[] {
  const synthesized = synthesizeDirectionalClasses(classes);
  const shorthands = new Map<string, string>();
  for (const cls of synthesized) {
    const parsed = directionalPrefix(cls);
    if (parsed && SHORTHAND_COVERS[parsed.prefix]) {
      shorthands.set(parsed.prefix, parsed.value);
    }
  }

  return synthesized.filter((cls) => {
    const parsed = directionalPrefix(cls);
    if (!parsed) return true;
    // Drop the class if it is a longhand covered by a present shorthand with a
    // matching value (e.g. py-5 removes pt-5/pb-5, px-2 removes pl-2/pr-2).
    for (const [shorthand, shorthandValue] of shorthands) {
      const longhands = SHORTHAND_COVERS[shorthand];
      if (
        longhands &&
        longhands.includes(parsed.prefix) &&
        shorthandValue === parsed.value
      ) {
        return false;
      }
    }
    return true;
  });
}

function cloneNode(node: NormalNode): NormalNode {
  return {
    kind: node.kind,
    tag: node.tag,
    props: { ...node.props },
    children: node.children.map(cloneNode),
    text: node.text,
    styleNote: node.styleNote,
  };
}

const PROP_PREFIX = 'purerip-prop:';

function findContentTextNode(node: NormalNode): NormalNode | null {
  for (const child of node.children) {
    if (child.kind === 'text' && (child.text ?? '').trim().length > 0) {
      return child;
    }
  }
  return null;
}

function propNameForTag(tag: string): string {
  if (tag === 'button') return 'label';
  if (/^h[1-6]$/.test(tag)) return 'title';
  return 'text';
}

function truncateDefault(text: string): string {
  const t = text.trim();
  if (t.length <= 40) return t;
  return t.slice(0, 40) + '\u2026';
}

function jsStringLiteral(s: string): string {
  return `'${s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/`/g, '\\`')}'`;
}

/** Merge base quantized classes plus variant (hover/active/focus) classes. */
export function classNameFromNormalNode(
  node: NormalNode,
  quantizedClasses: TailwindClass[],
): string {
  const existing = (node.props.class ?? '').trim();
  const existingList = existing ? existing.split(/\s+/).filter(Boolean) : [];
  return dedupe([...existingList, ...quantizedClasses]).join(' ');
}

// ---- JSX rendering ----------------------------------------------------------

function renderNode(
  node: NormalNode,
  indent: number,
  isRoot: boolean,
  rootInteractive: boolean,
): string {
  const pad = '  '.repeat(indent);

  if (node.kind === 'text') {
    if (node.styleNote && node.styleNote.startsWith(PROP_PREFIX)) {
      return `${pad}{${node.styleNote.slice(PROP_PREFIX.length)}}`;
    }
    return `${pad}${sanitizeJsxText(node.text ?? '')}`;
  }

  if (node.kind === 'comment') {
    return `${pad}{/* ${node.tag} */}`;
  }

  const tag = node.tag;
  const attrParts: string[] = [];

  for (const [name, value] of Object.entries(node.props)) {
    const jsxName = attrToJsx(name);
    if (jsxName === 'className') {
      const trimmed = value.trim();
      if (trimmed) attrParts.push(`className="${trimmed}"`);
    } else if (jsxName === 'style') {
      const styleObj = parseStyleAttr(value);
      const entries = Object.entries(styleObj);
      if (entries.length > 0) {
        const styleStr = entries
          .map(
            ([k, v]) =>
              `${k}: '${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`,
          )
          .join(', ');
        attrParts.push(`style={{ ${styleStr} }}`);
      }
    } else if (BOOL_ATTRS.has(jsxName.toLowerCase())) {
      if (value !== 'false') attrParts.push(jsxName);
    } else {
      attrParts.push(`${jsxName}="${value.replace(/"/g, jsxEntity('quot;'))}"`);
    }
  }

  if (isRoot && rootInteractive) {
    attrParts.push('onClick={onClick}');
  }

  const attrs = attrParts.length > 0 ? ` ${attrParts.join(' ')}` : '';

  if (isVoidElement(tag)) {
    return `${pad}<${tag}${attrs} />`;
  }

  if (node.children.length === 0) {
    return `${pad}<${tag}${attrs}></${tag}>`;
  }

  const childLines = node.children.map((c) =>
    renderNode(c, indent + 1, false, rootInteractive),
  );
  return `${pad}<${tag}${attrs}>\n${childLines.join('\n')}\n${pad}</${tag}>`;
}

function renderJsxTree(
  tree: NormalNode,
  rootInteractive: boolean,
  indent = 0,
): string {
  return renderNode(tree, indent, true, rootInteractive);
}

// ---- HTML rendering ---------------------------------------------------------

function renderHtmlNode(node: NormalNode, props: ComponentPropsMap): string {
  if (node.kind === 'text') {
    if (node.styleNote && node.styleNote.startsWith(PROP_PREFIX)) {
      const prop = node.styleNote.slice(PROP_PREFIX.length);
      return escapeText(props[prop] ?? '');
    }
    return escapeText(node.text ?? '');
  }
  if (node.kind === 'comment') return '';

  const tag = node.tag;
  const attrParts: string[] = [];

  for (const [name, value] of Object.entries(node.props)) {
    if (name === 'class') {
      const trimmed = value.trim();
      if (trimmed) attrParts.push(`class="${trimmed.replace(/"/g, jsxEntity('quot;'))}"`);
    } else if (name === 'style') {
      const trimmed = value.trim();
      if (trimmed) attrParts.push(`style="${trimmed.replace(/"/g, jsxEntity('quot;'))}"`);
    } else if (BOOL_ATTRS.has(name.toLowerCase())) {
      if (value !== 'false') attrParts.push(name);
    } else {
      attrParts.push(`${name}="${escapeText(value)}"`);
    }
  }

  const attrs = attrParts.length > 0 ? ` ${attrParts.join(' ')}` : '';
  const children = node.children.map((c) => renderHtmlNode(c, props)).join('');

  if (isVoidElement(tag)) {
    return `<${tag}${attrs} />`;
  }
  return `<${tag}${attrs}>${children}</${tag}>`;
}

function renderHtmlTree(tree: NormalNode, props: ComponentPropsMap): string {
  return renderHtmlNode(tree, props);
}

// ---- Prop extraction --------------------------------------------------------

export interface ExtractResult {
  jsx: string;
  props: ComponentPropsMap;
  propName: string;
  defaultText: string;
  interactive: boolean;
}

/**
 * Find the primary direct text node in the content element, replace it with a
 * typed JSX expression (`{label}`/`{title}`/`{text}`), and emit the component
 * props map (default text) plus a flag for the onClick wiring.
 */
export function extractTextAndProps(tree: NormalNode): ExtractResult {
  const propName = propNameForTag(tree.tag);
  const interactive = tree.styleNote === 'interactive';
  const contentNode = findContentTextNode(tree);
  let defaultText = '';
  if (contentNode) {
    defaultText = (contentNode.text ?? '').trim();
    contentNode.styleNote = PROP_PREFIX + propName;
  }

  const jsx = renderJsxTree(tree, interactive, 2);
  const props: ComponentPropsMap = {};
  if (contentNode) props[propName] = defaultText;

  return { jsx, props, propName, defaultText, interactive };
}

// ---- Component shell / compile ----------------------------------------------

function buildTsx(
  jsx: string,
  props: ComponentPropsMap,
  propName: string,
  defaultText: string,
  interactive: boolean,
): string {
  const hasTextProp = propName in props;
  const propLines: string[] = [];
  if (hasTextProp) propLines.push(`  ${propName}?: string;`);
  if (interactive) propLines.push('  onClick?: () => void;');

  const interfaceBlock =
    propLines.length > 0
      ? `export interface ComponentProps {\n${propLines.join('\n')}\n}`
      : 'export interface ComponentProps {}';

  const destructureParts: string[] = [];
  if (hasTextProp) {
    const text = truncateDefault(defaultText);
    destructureParts.push(`${propName} = ${jsStringLiteral(text)}`);
  }
  if (interactive) destructureParts.push('onClick');

  const destructure =
    destructureParts.length > 0 ? `{ ${destructureParts.join(', ')} }` : '{}';

  return [
    "import React from 'react';",
    '',
    interfaceBlock,
    '',
    `export default function Component(${destructure}: ComponentProps) {`,
    '  return (',
    jsx,
    '  );',
    '}',
    '',
  ].join('\n');
}

function isDarkColor(rgb: [number, number, number]): boolean {
  const [r, g, b] = rgb;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 60;
}

// ---- Recursive quantization ------------------------------------------------

/**
 * Quantize a single (cloned) tree node against its live DOM element. Strips the
 * original author `class` so only clean, snapped Tailwind tokens remain, and
 * writes any non-quantizable style-worthy properties to a `style` prop.
 */
function quantizeElementNode(
  node: NormalNode,
  liveEl: HTMLElement,
  own: Record<string, string>,
  isRoot: boolean,
  extraction: ExtractionResult,
): void {
  const fontSizePx = parseFloat(getComputedStyle(liveEl).fontSize);
  const context: QuantizeContext = { fontSizePx };
  const mapped: TailwindClass[] = [];
  const leftover: Record<string, string> = {};

  // Browsers compute pixel-based origin values (transform-origin,
  // perspective-origin) on nearly every block, so only preserve them when a
  // genuine, non-identity transform is present.
  const hasNonIdentityTransform =
    own.transform !== undefined && !isIdentityTransform(own.transform);

  for (const [prop, value] of Object.entries(own)) {
    const q = quantizeDeclaration(prop, value, context);
    if (q.confidence !== 'skipped' && q.className) {
      mapped.push(q.className);
    } else if (STYLE_WORTHY_PROPS.has(prop)) {
      leftover[prop] = value;
    } else if (COMPUTED_ORIGIN_PROPS.has(prop) && hasNonIdentityTransform) {
      leftover[prop] = value;
    }
  }

  // ---- Effective background -------------------------------------------------
  // Resolve the background the element actually renders so we can (a) promote
  // an ancestor card background onto a transparent clicked root and (b)
  // enforce text contrast on dark fills.
  const computedBg = getComputedStyle(liveEl).getPropertyValue(
    'background-color',
  );
  const parsedComputedBg = parseColor(computedBg);
  const ownBg = own.backgroundColor;
  let effectiveBg: string | null = null;

  if (ownBg) {
    effectiveBg = ownBg;
  } else if (isRoot && parsedComputedBg && parsedComputedBg.alpha === 0) {
    // The clicked root is transparent — inherit the parent's meaningful
    // background so the preview doesn't default to a bare white canvas.
    const parentEl = liveEl.parentElement;
    if (parentEl) {
      const parentBg = getComputedStyle(parentEl).getPropertyValue(
        'background-color',
      );
      const parentParsed = parseColor(parentBg);
      if (parentParsed && parentParsed.alpha > 0) {
        effectiveBg = parentBg;
        const q = quantizeDeclaration('backgroundColor', parentBg, context);
        if (q.confidence !== 'skipped' && q.className) {
          mapped.push(q.className);
        }
      }
    }
  } else if (
    isRoot &&
    extraction.base.inherited.backgroundColor !== undefined &&
    own.backgroundColor === undefined
  ) {
    // The element visually carries an inherited dark background (e.g. a
    // `var(--ds-background-100)` that collapsed to transparent in the diff), so
    // a standalone decompiled component must bake it in.
    const inheritedParsed = parseColor(computedBg);
    if (
      inheritedParsed &&
      inheritedParsed.alpha > 0 &&
      isDarkColor(inheritedParsed.rgb)
    ) {
      effectiveBg = computedBg;
      const q = quantizeDeclaration('backgroundColor', computedBg, context);
      if (q.confidence !== 'skipped' && q.className) {
        mapped.push(q.className);
      }
    }
  }

  // ---- Text contrast ---------------------------------------------------------
  // Evaluate the computed text color on every element. When the element sits on
  // a dark background, force a light token (e.g. text-zinc-50) so buttons never
  // render black text on a black fill.
  const effectiveParsed = effectiveBg ? parseColor(effectiveBg) : null;
  if (
    effectiveParsed &&
    effectiveParsed.alpha > 0 &&
    isDarkColor(effectiveParsed.rgb)
  ) {
    const computedColor = getComputedStyle(liveEl).getPropertyValue('color');
    const colorParsed = parseColor(computedColor);
    if (colorParsed) {
      const isDarkText = isDarkColor(colorParsed.rgb);
      const textQ = isDarkText
        ? quantizeDeclaration('color', 'rgb(250, 250, 250)', context)
        : quantizeDeclaration('color', computedColor, context);
      if (textQ.confidence !== 'skipped' && textQ.className) {
        if (isDarkText) {
          // Drop any dark authored text token so the light one wins.
          const nonText = mapped.filter(
            (c) => !TEXT_COLOR_CLASS_RE.test(c),
          );
          mapped.length = 0;
          mapped.push(...nonText, textQ.className);
        } else {
          mapped.push(textQ.className);
        }
      }
    }
  }

  const classStr = dedupeDirectionalClasses(dedupe(mapped)).join(' ');
  if (classStr) {
    node.props.class = classStr;
  } else {
    delete node.props.class;
  }

  if (Object.keys(leftover).length > 0) {
    node.props.style = objectToCss(leftover);
  } else {
    delete node.props.style;
  }
}

/**
 * Walk the cloned tree in parallel with the live DOM subtree, quantizing every
 * element node against its live counterpart. The sanitized clone preserves the
 * element ordering of the live subtree (minus removed tags), so the two sides
 * stay aligned.
 */
function quantizeTree(
  tree: NormalNode,
  liveRoot: HTMLElement,
  extraction: ExtractionResult,
): void {
  const walk = (node: NormalNode, liveEl: HTMLElement, isRoot: boolean): void => {
    if (node.kind !== 'element') return;

    const own = isRoot
      ? { ...extraction.base.own }
      : diffElementStyles(liveEl).own;

    quantizeElementNode(node, liveEl, own, isRoot, extraction);

    const liveElementChildren = Array.from(liveEl.children).filter(
      (c): c is Element => !REMOVED_TAGS.has(c.tagName.toLowerCase()),
    );
    const treeElementChildren = node.children.filter((c) => c.kind === 'element');
    const count = Math.min(liveElementChildren.length, treeElementChildren.length);
    for (let i = 0; i < count; i++) {
      walk(treeElementChildren[i], liveElementChildren[i] as HTMLElement, false);
    }
  };

  walk(tree, liveRoot, true);
}

/**
 * Orchestrate the final compilation: recursively quantize base styles for every
 * element node, merge transition and variant classes onto the root, extract
 * text props, then produce the React TSX source and the pure Tailwind HTML +
 * preview HTML.
 */
export function compile(
  tree: NormalNode,
  extraction: ExtractionResult,
): CompiledComponent {
  const rootEl = extraction.base.element;
  const modified = cloneNode(tree);

  // Recursively quantize the whole subtree — child elements no longer leak raw
  // author classes like `text-[var(--themed-fg)]`.
  quantizeTree(modified, rootEl, extraction);

  // Merge variant classes + transition onto the root, then dedupe shorthands.
  const variantClasses = extraction.variants.flatMap((v) => v.classes);
  const transition = extraction.transition ?? '';
  const rootBaseClasses = (modified.props.class ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const allClasses = dedupeDirectionalClasses(
    dedupe(
      [...rootBaseClasses, transition, ...variantClasses].filter(
        (c) => c.length > 0,
      ),
    ),
  );

  if (allClasses.length > 0) {
    modified.props.class = allClasses.join(' ');
  } else {
    delete modified.props.class;
  }

  const { jsx, props, propName, defaultText, interactive } =
    extractTextAndProps(modified);

  const html = renderHtmlTree(modified, props);
  const tsx = buildTsx(jsx, props, propName, defaultText, interactive);

  return {
    tsx,
    html,
    previewHtml: html,
    props,
    interactive,
  };
}
