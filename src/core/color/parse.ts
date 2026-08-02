import { colorsNamed, formatHex, formatHex8, parse as parseColor } from 'culori';
import type { ColorSyntax } from '../../types.js';

export interface FoundColor {
  raw: string;
  /** Offset of the literal within the scanned text. */
  index: number;
  hex: string;
  alpha: number;
  syntax: ColorSyntax;
}

/** Keywords that parse as colors but carry no value worth tokenizing. */
const SKIPPED_KEYWORDS = new Set(['transparent', 'currentcolor']);

const NAMED_COLORS = new Set(
  Object.keys(colorsNamed).filter((name) => !SKIPPED_KEYWORDS.has(name)),
);

const FUNCTION_SYNTAX: Record<string, ColorSyntax> = {
  rgb: 'rgb',
  rgba: 'rgb',
  hsl: 'hsl',
  hsla: 'hsl',
  hwb: 'hwb',
  lab: 'lab',
  lch: 'lch',
  oklab: 'oklab',
  oklch: 'oklch',
  color: 'color',
};

const CANDIDATE =
  /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|oklab|oklch|lab|lch|color)\s*\(|\b[a-zA-Z]{3,20}\b/g;

const VALID_HEX_LENGTHS = new Set([3, 4, 6, 8]);

export interface FindColorsOptions {
  /**
   * `any` matches named colors anywhere (safe for CSS declaration values).
   * `value-only` requires the name to sit after a `:` or to be the whole text,
   * which keeps identifiers like `blue` in JS from being treated as colors.
   */
  namedContext?: 'any' | 'value-only' | 'off';
}

/** Finds every color literal in a chunk of text, in source order. */
export function findColors(text: string, options: FindColorsOptions = {}): FoundColor[] {
  const namedContext = options.namedContext ?? 'any';
  const found: FoundColor[] = [];

  CANDIDATE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CANDIDATE.exec(text)) !== null) {
    const token = match[0];
    const index = match.index;

    if (token.startsWith('#')) {
      const digits = token.slice(1);
      if (!VALID_HEX_LENGTHS.has(digits.length)) continue;
      if (text[index - 1] === '.') continue; // JS private field
      push(found, text, index, token);
      continue;
    }

    if (token.endsWith('(')) {
      const name = token.slice(0, token.indexOf('(')).trim().toLowerCase();
      if (!(name in FUNCTION_SYNTAX)) continue;
      const end = matchParen(text, index + token.length - 1);
      if (end === -1) continue;
      const raw = text.slice(index, end + 1);
      if (push(found, text, index, raw)) {
        CANDIDATE.lastIndex = end + 1;
      }
      continue;
    }

    if (namedContext === 'off') continue;
    const lower = token.toLowerCase();
    if (!NAMED_COLORS.has(lower)) continue;
    if (isIdentifierPart(text[index - 1]) || isIdentifierPart(text[index + token.length])) continue;
    if (namedContext === 'value-only' && !inValuePosition(text, index, token)) continue;
    push(found, text, index, token);
  }

  return found;
}

function push(found: FoundColor[], text: string, index: number, raw: string): boolean {
  const parsed = parseColor(raw);
  if (!parsed) return false;
  const alpha = parsed.alpha ?? 1;
  found.push({
    raw,
    index,
    alpha,
    hex: alpha < 1 ? formatHex8(parsed) : formatHex(parsed),
    syntax: syntaxOf(raw),
  });
  return true;
}

function syntaxOf(raw: string): ColorSyntax {
  if (raw.startsWith('#')) return 'hex';
  const paren = raw.indexOf('(');
  if (paren === -1) return 'named';
  return FUNCTION_SYNTAX[raw.slice(0, paren).trim().toLowerCase()] ?? 'named';
}

function matchParen(text: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    const char = text[i];
    if (char === '(') depth++;
    else if (char === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function isIdentifierPart(char: string | undefined): boolean {
  return char !== undefined && /[\w$@#\-.]/.test(char);
}

/** True when the offset sits on the value side of a `key: value` pair. */
function inValuePosition(text: string, index: number, token: string): boolean {
  if (text.trim().toLowerCase() === token.toLowerCase()) return true;
  const lineStart = text.lastIndexOf('\n', index - 1) + 1;
  return /:\s*[^;{}]*$/.test(text.slice(lineStart, index));
}

export { NAMED_COLORS };
