import type { ColorOccurrence } from '../../types.js';
import { findColors } from '../color/parse.js';
import { classifyProperty } from '../usage.js';
import { lexScript } from './lexer.js';
import { positionAt } from './position.js';

/** `color: '#fff'`, `'background-color': '#fff'`, `borderColor="#fff"`. */
const KEY_BEFORE_LITERAL = /(?:([A-Za-z_$][\w$-]*)|['"]([^'"]+)['"])\s*[:=]\s*$/;
/** `color: #fff` inside a CSS template literal. */
const KEY_IN_CSS = /(?:^|[;{}\n])\s*(--[\w-]+|[-a-zA-Z]+)\s*:\s*[^;{}]*$/;

export function scanScript(file: string, source: string): ColorOccurrence[] {
  const { masked, spans } = lexScript(source);
  const occurrences: ColorOccurrence[] = [];

  for (const span of spans) {
    if (span.end <= span.start) continue;
    const content = masked.slice(span.start, span.end);
    const colors = findColors(content, { namedContext: 'value-only' });
    if (colors.length === 0) continue;

    for (const color of colors) {
      const offset = span.start + color.index;
      const { line, column } = positionAt(source, offset);
      const property =
        propertyFromCss(content, color.index) ?? propertyBeforeLiteral(masked, span.start);
      occurrences.push({
        raw: color.raw,
        hex: color.hex,
        alpha: color.alpha,
        syntax: color.syntax,
        usage: classifyProperty(property, content),
        ...(property ? { property } : {}),
        ...(property?.startsWith('--') ? { declaresVariable: property } : {}),
        ...(themeFromContext(masked, offset) ?? {}),
        file,
        line,
        column,
      });
    }
  }

  return occurrences;
}

function propertyFromCss(content: string, index: number): string | undefined {
  const match = KEY_IN_CSS.exec(content.slice(0, index));
  return match?.[1];
}

function propertyBeforeLiteral(masked: string, literalStart: number): string | undefined {
  const lineStart = masked.lastIndexOf('\n', literalStart - 1) + 1;
  const before = masked.slice(lineStart, Math.max(lineStart, literalStart - 1));
  const match = KEY_BEFORE_LITERAL.exec(before);
  return match?.[1] ?? match?.[2];
}

const DARK_SCOPE = /(?:^|[\s.[#:'"])(?:dark|theme-dark|dark-theme|dark-mode)\b|prefers-color-scheme:\s*dark/i;
const LIGHT_SCOPE = /(?:^|[\s.[#:'"])(?:light|theme-light|light-theme|light-mode)\b|prefers-color-scheme:\s*light/i;

/**
 * Picks up `dark` / `light` scoping in theme objects and CSS-in-JS blocks by
 * walking out through enclosing braces, innermost first.
 */
function themeFromContext(masked: string, offset: number): { theme: 'light' | 'dark' } | undefined {
  let depth = 0;
  for (let i = offset - 1; i >= 0; i--) {
    const char = masked[i];
    if (char === '}') {
      depth++;
    } else if (char === '{') {
      if (depth > 0) {
        depth--;
        continue;
      }
      const before = masked.slice(Math.max(0, i - 200), i);
      const header = before.slice(before.lastIndexOf('\n') + 1);
      if (DARK_SCOPE.test(header)) return { theme: 'dark' };
      if (LIGHT_SCOPE.test(header)) return { theme: 'light' };
    }
  }
  return undefined;
}
