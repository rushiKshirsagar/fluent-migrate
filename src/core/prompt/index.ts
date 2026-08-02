import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ColorOccurrence } from '../../types.js';
import type { MigrationPlan, PlanEntry } from '../plan/index.js';
import { serializePlan } from '../plan/index.js';
import { fileKind } from '../scan/files.js';

const STYLE_IMPORT =
  /(?:from\s*|require\(\s*|import\s*)['"]([^'"]+\.(?:css|scss|sass|less))['"]/g;

export interface PromptPack {
  /** Files to write, relative to the output directory. */
  files: Array<{ name: string; contents: string }>;
  components: ComponentWork[];
}

export interface ComponentWork {
  /** Component file, or the stylesheet itself when nothing imports it. */
  file: string;
  stylesheets: string[];
  occurrences: ColorOccurrence[];
}

/**
 * Builds a self-contained brief that any coding agent can follow to move a
 * component onto `makeStyles`. Every color decision is already made, so the
 * agent only has to restructure code, never to pick a token.
 */
export async function buildPromptPack(plan: MigrationPlan): Promise<PromptPack> {
  const tokenFor = buildTokenLookup(plan);
  const components = await groupByComponent(plan);

  return {
    components,
    files: [
      { name: 'plan.json', contents: `${JSON.stringify(serializePlan(plan), null, 2)}\n` },
      { name: 'PROMPT.md', contents: renderPrompt(plan, components, tokenFor) },
    ],
  };
}

type TokenLookup = (occurrence: ColorOccurrence) => string | null;

function buildTokenLookup(plan: MigrationPlan): TokenLookup {
  const decisions = new Map<ColorOccurrence, PlanEntry>();
  for (const entry of plan.entries) {
    for (const occurrence of entry.occurrences) decisions.set(occurrence, entry);
  }
  return (occurrence) => {
    const best = decisions.get(occurrence)?.best;
    return best && best.quality !== 'poor' ? best.token.name : null;
  };
}

/**
 * Pairs each component with the stylesheets it imports, so the agent is told
 * to fold `Card.css` into `Card.tsx` rather than guessing at the connection.
 */
async function groupByComponent(plan: MigrationPlan): Promise<ComponentWork[]> {
  const { root, occurrences } = plan.scan;
  const byFile = new Map<string, ColorOccurrence[]>();
  for (const occurrence of occurrences) {
    const bucket = byFile.get(occurrence.file);
    if (bucket) bucket.push(occurrence);
    else byFile.set(occurrence.file, [occurrence]);
  }

  const owners = new Map<string, string>();
  const scripts = [...byFile.keys()].filter((file) => fileKind(file) === 'script');

  for (const script of scripts) {
    const source = await readFile(path.join(root, script), 'utf8').catch(() => '');
    STYLE_IMPORT.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = STYLE_IMPORT.exec(source)) !== null) {
      const specifier = match[1]!;
      if (!specifier.startsWith('.')) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(script), specifier));
      if (byFile.has(resolved)) owners.set(resolved, script);
    }
  }

  const work = new Map<string, ComponentWork>();
  for (const [file, found] of byFile) {
    const owner = owners.get(file) ?? file;
    let entry = work.get(owner);
    if (!entry) {
      entry = { file: owner, stylesheets: [], occurrences: [] };
      work.set(owner, entry);
    }
    if (file !== owner) entry.stylesheets.push(file);
    entry.occurrences.push(...found);
  }

  return [...work.values()]
    .map((entry) => ({
      ...entry,
      stylesheets: entry.stylesheets.sort(),
      occurrences: entry.occurrences.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    }))
    .sort((a, b) => b.occurrences.length - a.occurrences.length || a.file.localeCompare(b.file));
}

function renderPrompt(
  plan: MigrationPlan,
  components: ComponentWork[],
  tokenFor: TokenLookup,
): string {
  const unmatched = plan.entries.filter((entry) => !entry.best || entry.best.quality === 'poor');

  return [
    heading(plan, components),
    RULES,
    renderPairs(plan),
    renderUnmatched(unmatched),
    renderComponents(components, tokenFor),
    CHECKLIST,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function heading(plan: MigrationPlan, components: ComponentWork[]): string {
  const colors = plan.entries.length;
  return `# Migrate this app to Fluent UI \`makeStyles\`

You are migrating a React app from hand-written CSS onto Fluent UI v9
\`makeStyles\` with design tokens.

**The color decisions are already made.** \`plan.json\` beside this file maps every
color in the codebase to a Fluent token, chosen by perceptual distance and by
what the color is used for. Apply that mapping exactly — do not pick tokens
yourself, and do not introduce colors that are not in it.

There are ${colors} color/role combinations across ${components.length} components to work through.`;
}

const RULES = `## How to migrate a component

For each component below:

1. Add a \`makeStyles\` hook at the top of the component file:

   \`\`\`tsx
   import { makeStyles, tokens } from '@fluentui/react-components';

   const useStyles = makeStyles({
     root: {
       backgroundColor: tokens.colorNeutralBackground1,
       color: tokens.colorNeutralForeground1,
     },
   });
   \`\`\`

2. Move every rule from the imported stylesheet into the hook, one key per
   class. Keep the existing class names as the keys so the mapping stays
   obvious: \`.card\` becomes \`root\`, \`.card__header\` becomes \`header\`.
3. Call the hook in the component and apply the classes with
   \`className={styles.root}\`, or \`mergeClasses(styles.root, props.className)\`
   when the component forwards a className.
4. Replace pseudo-classes and nested selectors with Griffel's nested syntax:
   \`':hover': { backgroundColor: tokens.colorNeutralBackground1Hover }\`.
5. Delete the stylesheet import once every rule has moved, and delete the
   stylesheet file if nothing else imports it.

## Rules

- Reference tokens as \`tokens.colorNeutralForeground1\`, not as raw
  \`var(--colorNeutralForeground1)\` strings.
- Never leave a hard-coded color behind unless it is listed under
  "Colors with no token" below.
- Use Griffel shorthands where a CSS shorthand does not translate directly:
  \`...shorthands.borderColor(tokens.colorNeutralStroke1)\`.
- Do not change layout, spacing, typography or behavior. This migration is
  about color and about where the styles live.
- Do not change the rendered markup or the public props of any component.
- Keep the component's existing structure and naming conventions.
- The app needs a \`FluentProvider\` at the root for tokens to resolve. If there
  is not one, add it in the app entry point with \`webLightTheme\`.`;

function renderPairs(plan: MigrationPlan): string {
  if (plan.pairs.length === 0) return '';
  const rows = plan.pairs.map((pair) => {
    const token = pair.split
      ? `${pair.split.light.token.name} (light) / ${pair.split.dark.token.name} (dark)`
      : (pair.best?.token.name ?? '—');
    return `| \`${pair.name}\` | ${pair.file} | \`${pair.light}\` | \`${pair.dark}\` | \`${token}\` |`;
  });

  return `## Light and dark pairs

These definitions have one value per theme. Fluent tokens carry both values, so
a single token replaces the pair and the dark-mode override can be deleted
outright.

| Definition | File | Light | Dark | Token |
| --- | --- | --- | --- | --- |
${rows.join('\n')}`;
}

function renderUnmatched(entries: PlanEntry[]): string {
  if (entries.length === 0) return '';
  const rows = entries.map((entry) => {
    const where = entry.occurrences
      .slice(0, 3)
      .map((o) => `${o.file}:${o.line}`)
      .join(', ');
    return `| \`${entry.hex}\` | ${entry.usage} | ${where} |`;
  });

  return `## Colors with no token

No Fluent token is close enough to these. Leave them as literal values in the
\`makeStyles\` hook and add a short comment saying why. Do not substitute a
token that merely looks similar.

| Color | Used as | Where |
| --- | --- | --- |
${rows.join('\n')}`;
}

function renderComponents(components: ComponentWork[], tokenFor: TokenLookup): string {
  const sections = components.map((component) => {
    const stylesheets =
      component.stylesheets.length > 0
        ? `Stylesheets to fold in: ${component.stylesheets.map((s) => `\`${s}\``).join(', ')}`
        : 'No imported stylesheet; the colors are inline in this file.';

    const rows = component.occurrences.map((occurrence) => {
      const token = tokenFor(occurrence);
      return `| ${occurrence.file}:${occurrence.line} | \`${occurrence.selector ?? '—'}\` | \`${
        occurrence.property ?? '—'
      }\` | \`${occurrence.raw}\` | ${token ? `\`tokens.${token}\`` : '**keep as is**'} |`;
    });

    return `### \`${component.file}\`

${stylesheets}

| Location | Selector | Property | Current | Replace with |
| --- | --- | --- | --- | --- |
${rows.join('\n')}`;
  });

  return `## Components\n\n${sections.join('\n\n')}`;
}

const CHECKLIST = `## When you are done

- \`grep\` the touched files for \`#\`, \`rgb(\`, \`rgba(\` and \`hsl(\` — the only
  matches left should be the colors listed under "Colors with no token".
- No component still imports a stylesheet whose rules have all moved.
- The app type-checks and builds.
- Every \`makeStyles\` key is actually used by a \`className\`.`;
