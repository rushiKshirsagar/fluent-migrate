/** How a color literal was written in the source. */
export type ColorSyntax =
  | 'hex'
  | 'rgb'
  | 'hsl'
  | 'hwb'
  | 'lab'
  | 'lch'
  | 'oklab'
  | 'oklch'
  | 'color'
  | 'named';

/**
 * What the color is used for. This drives token selection later: Fluent has
 * separate token families for foreground, background and stroke, so a `#fff`
 * used as text is not the same token as a `#fff` used as a background.
 */
export type UsageKind =
  | 'text'
  | 'background'
  | 'border'
  | 'outline'
  | 'shadow'
  | 'fill'
  | 'stroke'
  | 'gradient'
  | 'variable'
  | 'unknown';

/** Where a color literal lives, and what it is doing there. */
export interface ColorOccurrence {
  /** The literal exactly as authored, e.g. `#FFF` or `rgba(0, 0, 0, .5)`. */
  raw: string;
  /** Normalized `#rrggbb`, or `#rrggbbaa` when the color is translucent. */
  hex: string;
  alpha: number;
  syntax: ColorSyntax;
  usage: UsageKind;
  /** CSS property or JS style key the color was assigned to, when known. */
  property?: string;
  /** Enclosing CSS selector, when known. */
  selector?: string;
  /** Custom property or preprocessor variable being defined, e.g. `--brand`. */
  declaresVariable?: string;
  /** Set when the color sits inside a dark-mode block or a `.dark` scope. */
  theme?: 'light' | 'dark';
  /** Path relative to the scan root. */
  file: string;
  line: number;
  column: number;
}

/** All occurrences of one distinct color value. */
export interface ColorGroup {
  hex: string;
  alpha: number;
  count: number;
  fileCount: number;
  usages: Partial<Record<UsageKind, number>>;
  occurrences: ColorOccurrence[];
}

export interface ScanResult {
  root: string;
  filesScanned: number;
  filesWithColors: number;
  occurrences: ColorOccurrence[];
  groups: ColorGroup[];
  durationMs: number;
}

export interface ScanOptions {
  root: string;
  include?: string[];
  ignore?: string[];
}
