/**
 * Preprocessor functions that do arithmetic on a color. A `var()` reference is
 * opaque to Sass and Less, so `darken(var(--x), 10%)` fails to compile — any
 * literal inside one of these has to be left alone.
 */
const COLOR_FUNCTIONS = new Set([
  'darken',
  'lighten',
  'saturate',
  'desaturate',
  'grayscale',
  'greyscale',
  'adjust-hue',
  'adjust-color',
  'scale-color',
  'change-color',
  'mix',
  'tint',
  'shade',
  'transparentize',
  'opacify',
  'fade-out',
  'fade-in',
  'fadeout',
  'fadein',
  'fade',
  'rgba',
  'rgb',
  'hsl',
  'hsla',
  'complement',
  'invert',
  'color',
]);

/**
 * True when the offset sits inside a call that manipulates the color, in which
 * case the literal cannot be swapped for a CSS variable.
 *
 * `rgba()` and friends count: they parse as colors in their own right, so a
 * literal nested inside one is an argument being transformed, not a value.
 */
export function insideColorFunction(source: string, offset: number): boolean {
  let depth = 0;
  for (let i = offset - 1; i >= 0; i--) {
    const char = source[i];
    if (char === ')') {
      depth++;
      continue;
    }
    if (char !== '(') continue;
    if (depth > 0) {
      depth--;
      continue;
    }
    const name = /([\w-]+)\s*$/.exec(source.slice(Math.max(0, i - 40), i))?.[1];
    if (name && COLOR_FUNCTIONS.has(name.toLowerCase())) return true;
    // An unmatched paren that is not a color call, e.g. `calc(`; keep looking
    // outward in case that call is itself nested in one.
  }
  return false;
}

/** `$brand: #0f6cbd` in Sass or `@brand: #0f6cbd` in Less. */
export function isPreprocessorVariable(property: string | undefined): boolean {
  return !!property && /^[$@]/.test(property);
}

export function isStylesheet(file: string): boolean {
  return /\.(css|scss|sass|less)$/i.test(file);
}
