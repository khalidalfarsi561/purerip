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
import { quantizeDeclaration, type QuantizeContext } from './tailwind-quantizer';
import { isVoidElement } from './dom-traversal';

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
  'transformOrigin',
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
  'perspectiveOrigin',
  'willChange',
  'flex',
  'gridTemplateColumns',
  'gridTemplateRows',
  'columnCount',
]);

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

/**
 * Orchestrate the final compilation: quantize base styles, merge transition
 * and variant classes onto the root, extract text props, then produce the
 * React TSX source and the pure Tailwind HTML + preview HTML.
 */
export function compile(
  tree: NormalNode,
  extraction: ExtractionResult,
): CompiledComponent {
  const rootEl = extraction.base.element;
  const fontSizePx = parseFloat(getComputedStyle(rootEl).fontSize);
  const context: QuantizeContext = { fontSizePx };

  const mapped: TailwindClass[] = [];
  const leftover: Record<string, string> = {};
  for (const [prop, value] of Object.entries(extraction.base.own)) {
    const q = quantizeDeclaration(prop, value, context);
    if (q.confidence !== 'skipped' && q.className) {
      mapped.push(q.className);
    } else if (STYLE_WORTHY_PROPS.has(prop)) {
      leftover[prop] = value;
    }
  }

  const variantClasses = extraction.variants.flatMap((v) => v.classes);
  const transition = extraction.transition ?? '';
  const allClasses = dedupe(
    [...mapped, transition, ...variantClasses].filter((c) => c.length > 0),
  );

  const modified = cloneNode(tree);
  modified.props.class = classNameFromNormalNode(modified, allClasses);

  if (Object.keys(leftover).length > 0) {
    modified.props.style = objectToCss(leftover);
  } else {
    // All styles were quantized into Tailwind classes — drop the original
    // inline style so the generated markup isn't redundant.
    delete modified.props.style;
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
