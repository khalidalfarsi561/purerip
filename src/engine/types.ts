// Shared strict TypeScript definitions for the PureRip decompilation engine.

/** A Tailwind utility class, e.g. "px-4", "bg-blue-600", "rounded-lg". */
export type TailwindClass = string;

export interface QuantizedDeclaration {
  /** CSS property (camelCase), e.g. "paddingLeft". */
  property: string;
  /** Computed value, e.g. "16px". */
  value: string;
  /** Mapped utility, e.g. "pl-4". */
  className: TailwindClass;
  /** How confident the mapping is. */
  confidence: 'exact' | 'snapped' | 'skipped';
  /** Why the property was skipped (never arbitrary bracket soup). */
  skipReason?: string;
}

// ---- Normalized node tree ----

export type NodeKind = 'element' | 'text' | 'comment';

export interface NormalNode {
  kind: NodeKind;
  /** Lowercase tag (or '#text'). */
  tag: string;
  /** Raw attributes (class, href, etc.). */
  props: Record<string, string>;
  children: NormalNode[];
  /** For text nodes; trimmed of whitespace. */
  text?: string;
  /** e.g. interactive role detected. */
  styleNote?: string;
}

// ---- Style diff ----

export interface DiffResult {
  element: HTMLElement;
  /** Properties that differ from defaults/inherited. */
  own: Record<string, string>;
  /** Properties inherited from ancestors (excluded from output). */
  inherited: Record<string, string>;
}

// ---- State extraction ----

export interface StateVariant {
  pseudo: 'hover' | 'active' | 'focus';
  classes: TailwindClass[];
}

export interface ExtractionResult {
  base: DiffResult;
  variants: StateVariant[];
  /** e.g. "transition-all duration-300 ease-in-out". */
  transition?: string;
}

// ---- Final component ----

export interface ComponentPropsMap {
  [propName: string]: string;
}

export interface CompiledComponent {
  /** Full component source. */
  tsx: string;
  /** Pure Tailwind HTML (class-based, no React). */
  html: string;
  /** Sanitized markup for the static preview tab. */
  previewHtml: string;
  props: ComponentPropsMap;
  interactive: boolean;
}

// ---- Quantizer palette / spacing types ----

/** Tailwind spacing scale: scale step -> px. Keys 0, 0.5, 1, 1.5, 2 … 96. */
export type SpacingScale = ReadonlyMap<number, number>;

export interface NamedColor {
  name: string;
  rgb: [number, number, number];
}

export type ColorPalette = NamedColor[];
