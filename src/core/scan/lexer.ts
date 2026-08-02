export interface StringSpan {
  /** Offset of the first character of the literal's content. */
  start: number;
  /** Offset one past the last character of the content. */
  end: number;
  kind: 'quoted' | 'template';
}

export interface LexResult {
  /** Source with comment bodies replaced by spaces, so offsets stay valid. */
  masked: string;
  spans: StringSpan[];
}

type Context =
  | { kind: 'root' }
  | { kind: 'expr'; braces: number }
  | { kind: 'template'; chunkStart: number };

const REGEX_PRECEDERS = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>',
]);

/**
 * Walks JS/TS source, blanking out comments and recording string and template
 * chunk spans. This is deliberately a lexer, not a parser: it only needs to
 * know which byte ranges can legally hold a color literal.
 */
export function lexScript(source: string): LexResult {
  const chars = source.split('');
  const spans: StringSpan[] = [];
  const stack: Context[] = [{ kind: 'root' }];
  let lastMeaningful = '';
  let i = 0;

  const top = () => stack[stack.length - 1]!;

  while (i < source.length) {
    const char = source[i]!;
    const next = source[i + 1];
    const context = top();

    if (context.kind === 'template') {
      if (char === '\\') {
        i += 2;
        continue;
      }
      if (char === '`') {
        spans.push({ start: context.chunkStart, end: i, kind: 'template' });
        stack.pop();
        lastMeaningful = '`';
        i++;
        continue;
      }
      if (char === '$' && next === '{') {
        spans.push({ start: context.chunkStart, end: i, kind: 'template' });
        stack.push({ kind: 'expr', braces: 1 });
        i += 2;
        continue;
      }
      i++;
      continue;
    }

    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blank(chars, i, stop);
      i = stop;
      continue;
    }

    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(chars, i, stop);
      i = stop;
      continue;
    }

    if (char === '/' && isRegexStart(lastMeaningful)) {
      i = skipRegex(source, i);
      lastMeaningful = '/';
      continue;
    }

    if (char === '"' || char === "'") {
      const end = skipQuoted(source, i, char);
      spans.push({ start: i + 1, end: Math.min(end - 1, source.length), kind: 'quoted' });
      i = end;
      lastMeaningful = char;
      continue;
    }

    if (char === '`') {
      stack.push({ kind: 'template', chunkStart: i + 1 });
      i++;
      continue;
    }

    if (context.kind === 'expr') {
      if (char === '{') context.braces++;
      else if (char === '}') {
        context.braces--;
        if (context.braces === 0) {
          stack.pop();
          const parent = top();
          if (parent.kind === 'template') parent.chunkStart = i + 1;
          i++;
          continue;
        }
      }
    }

    if (!/\s/.test(char)) lastMeaningful = char;
    i++;
  }

  return { masked: chars.join(''), spans };
}

function blank(chars: string[], start: number, end: number): void {
  for (let i = start; i < end; i++) {
    if (chars[i] !== '\n') chars[i] = ' ';
  }
}

function isRegexStart(previous: string): boolean {
  return previous === '' || REGEX_PRECEDERS.has(previous);
}

function skipRegex(source: string, start: number): number {
  let i = start + 1;
  let inClass = false;
  while (i < source.length) {
    const char = source[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === '\n') return i;
    if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) return i + 1;
    i++;
  }
  return i;
}

function skipQuoted(source: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < source.length) {
    const char = source[i];
    if (char === '\\') {
      i += 2;
      continue;
    }
    if (char === quote) return i + 1;
    if (char === '\n') return i;
    i++;
  }
  return i;
}
