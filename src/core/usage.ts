import type { UsageKind } from '../types.js';

/** `backgroundColor` -> `background-color`, `WebkitTextFillColor` -> `-webkit-text-fill-color`. */
export function toKebabCase(property: string): string {
  if (property.startsWith('--')) return property;
  const kebab = property.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  return /^[A-Z]/.test(property) ? `-${kebab}` : kebab;
}

/**
 * Maps a CSS property (or JS style key) to the role the color plays.
 * Custom properties are classified by their name so `--text-muted: #666`
 * still reports as text rather than an opaque variable.
 */
export function classifyProperty(property: string | undefined, value?: string): UsageKind {
  if (!property) return 'unknown';
  const prop = toKebabCase(property.trim());

  if (value && /\b(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i.test(value)) {
    return 'gradient';
  }

  if (prop.startsWith('--') || prop.startsWith('$') || prop.startsWith('@')) {
    return classifyVariableName(prop);
  }

  const cssRole = classifyCssProperty(prop);
  if (cssRole !== 'unknown') return cssRole;

  // Keys from theme objects (`text`, `surface`, `divider`) are not CSS
  // properties but still say what the color is for.
  const hinted = classifyVariableName(prop);
  return hinted === 'variable' ? 'unknown' : hinted;
}

function classifyCssProperty(prop: string): UsageKind {
  if (prop === 'fill') return 'fill';
  if (prop === 'stroke') return 'stroke';
  if (prop.includes('shadow')) return 'shadow';
  if (prop.startsWith('outline')) return 'outline';
  if (prop.startsWith('border') || prop === 'column-rule' || prop === 'column-rule-color') {
    return 'border';
  }
  if (prop.startsWith('background')) return 'background';
  if (
    prop === 'color' ||
    prop === 'caret-color' ||
    prop === 'accent-color' ||
    prop.startsWith('text-decoration') ||
    prop.startsWith('text-emphasis') ||
    prop === '-webkit-text-fill-color' ||
    prop === '-webkit-text-stroke-color'
  ) {
    return 'text';
  }
  return 'unknown';
}

const VARIABLE_HINTS: Array<[RegExp, UsageKind]> = [
  [/(^|[-_])(bg|background|surface|canvas)([-_]|$)/, 'background'],
  [/(^|[-_])(fg|foreground|text|font|label|ink|copy)([-_]|$)/, 'text'],
  [/(^|[-_])(border|divider|rule)([-_]|$)/, 'border'],
  [/(^|[-_])(shadow|elevation)([-_]|$)/, 'shadow'],
  [/(^|[-_])outline([-_]|$)/, 'outline'],
  [/(^|[-_])stroke([-_]|$)/, 'stroke'],
  [/(^|[-_])fill([-_]|$)/, 'fill'],
];

function classifyVariableName(name: string): UsageKind {
  const normalized = name.replace(/^(--|\$|@)/, '').toLowerCase();
  for (const [pattern, kind] of VARIABLE_HINTS) {
    if (pattern.test(normalized)) return kind;
  }
  return 'variable';
}

/** JS style keys that hold colors even though the property name is generic. */
export function isColorLikeKey(key: string): boolean {
  return /color|fill|stroke|shadow|background|border|outline/i.test(key);
}
