import postcss, { type AtRule, type ChildNode, type Declaration, type Parser, type Root } from 'postcss';
import postcssLess from 'postcss-less';
import postcssScss from 'postcss-scss';
import type { ColorOccurrence } from '../../types.js';
import { findColors } from '../color/parse.js';
import { classifyProperty } from '../usage.js';
import { advance, blankOut, type Position } from './position.js';

const DARK_SELECTOR = /(^|[\s.[#:])(dark|theme-dark|dark-theme|dark-mode)\b|["']dark["']/i;
const LIGHT_SELECTOR = /(^|[\s.[#:])(light|theme-light|light-theme|light-mode)\b|["']light["']/i;

function parserFor(file: string): Parser<Root> {
  if (/\.less$/i.test(file)) return postcssLess.parse as Parser<Root>;
  if (/\.(scss|sass)$/i.test(file)) return postcssScss.parse as Parser<Root>;
  return postcss.parse;
}

export function scanStylesheet(file: string, source: string): ColorOccurrence[] {
  try {
    return parseWithPostcss(file, source);
  } catch {
    return scanPlainText(file, source);
  }
}

function parseWithPostcss(file: string, source: string): ColorOccurrence[] {
  const root = parserFor(file)(source, { from: file });
  const occurrences: ColorOccurrence[] = [];

  root.walkDecls((decl) => {
    const start = decl.source?.start;
    if (!start) return;
    const between = decl.raws.between ?? ': ';
    const prefix = decl.prop.length + between.length;
    collect(occurrences, {
      file,
      text: decl.value,
      property: decl.prop,
      selector: selectorOf(decl),
      theme: themeOf(decl),
      origin: advance(start, decl.prop + between, prefix),
    });
  });

  root.walkAtRules((atRule) => {
    if (!atRule.params) return;
    const start = atRule.source?.start;
    if (!start) return;
    const afterName = atRule.raws.afterName ?? ' ';
    const prefix = 1 + atRule.name.length + afterName.length;
    collect(occurrences, {
      file,
      text: atRule.params,
      property: undefined,
      selector: `@${atRule.name}`,
      theme: themeOf(atRule),
      origin: advance(start, `@${atRule.name}${afterName}`, prefix),
    });
  });

  occurrences.sort((a, b) => a.line - b.line || a.column - b.column);
  return occurrences;
}

interface CollectInput {
  file: string;
  text: string;
  property: string | undefined;
  selector: string | undefined;
  theme: 'light' | 'dark' | undefined;
  origin: Position;
}

function collect(target: ColorOccurrence[], input: CollectInput): void {
  const text = blankOut(input.text, /url\([^)]*\)/gi);
  for (const color of findColors(text)) {
    const position = advance(input.origin, input.text, color.index);
    target.push({
      raw: color.raw,
      hex: color.hex,
      alpha: color.alpha,
      syntax: color.syntax,
      usage: classifyProperty(input.property, input.text),
      ...(input.property ? { property: input.property } : {}),
      ...(input.selector ? { selector: input.selector } : {}),
      ...(isVariable(input.property) ? { declaresVariable: input.property } : {}),
      ...(input.theme ? { theme: input.theme } : {}),
      file: input.file,
      line: position.line,
      column: position.column,
    });
  }
}

function isVariable(property: string | undefined): property is string {
  return !!property && /^(--|\$|@)/.test(property);
}

function selectorOf(decl: Declaration): string | undefined {
  let node: ChildNode | undefined = decl.parent as ChildNode | undefined;
  while (node) {
    if (node.type === 'rule') return node.selector;
    node = node.parent as ChildNode | undefined;
  }
  return undefined;
}

function themeOf(node: ChildNode | Declaration | AtRule): 'light' | 'dark' | undefined {
  let current: ChildNode | undefined = node as ChildNode;
  while (current) {
    if (current.type === 'atrule' && current.name === 'media') {
      if (/prefers-color-scheme:\s*dark/i.test(current.params)) return 'dark';
      if (/prefers-color-scheme:\s*light/i.test(current.params)) return 'light';
    }
    if (current.type === 'rule') {
      if (DARK_SELECTOR.test(current.selector)) return 'dark';
      if (LIGHT_SELECTOR.test(current.selector)) return 'light';
    }
    current = current.parent as ChildNode | undefined;
  }
  return undefined;
}

/** Fallback for files postcss cannot parse (indented Sass, syntax errors). */
function scanPlainText(file: string, source: string): ColorOccurrence[] {
  const occurrences: ColorOccurrence[] = [];
  source.split('\n').forEach((rawLine, lineIndex) => {
    const line = blankOut(rawLine, /\/\/.*$/g);
    const separator = line.indexOf(':');
    const property = separator > -1 ? line.slice(0, separator).trim() : undefined;
    for (const color of findColors(line)) {
      occurrences.push({
        raw: color.raw,
        hex: color.hex,
        alpha: color.alpha,
        syntax: color.syntax,
        usage: classifyProperty(property, line),
        ...(property ? { property } : {}),
        ...(isVariable(property) ? { declaresVariable: property } : {}),
        file,
        line: lineIndex + 1,
        column: color.index + 1,
      });
    }
  });
  return occurrences;
}
