# fluent-migrate

Move a React app off hand-written CSS/SCSS colors and onto Fluent UI `makeStyles` with design tokens.

```bash
npx fluent-migrate scan ./src
```

## How the migration works

The tool runs as a pipeline. Each stage is inspectable on its own, so you can stop
and check the output before letting the next stage touch your code.

| Stage | Command | What it does |
| --- | --- | --- |
| 1. Scan | `fluent-migrate scan` | Finds every color in the codebase and reports how each one is used. |
| 2. Plan | `fluent-migrate plan` | Matches each color to a Fluent token, exactly where possible and by nearest perceptual distance otherwise. |
| 3. Fix | `fluent-migrate fix` | Rewrites every color literal to the Fluent CSS variable for its token. |
| 4. Prompt | `fluent-migrate prompt` | Writes a brief your coding agent can follow to move the styles into `makeStyles` hooks. |

## Stage 1: scan

`scan` reads every stylesheet and script in the project and reports each distinct
color, how often it appears, how many files use it, and what role it plays.

```bash
npx fluent-migrate scan ./src            # report
npx fluent-migrate scan ./src --verbose  # every occurrence with file:line:column
npx fluent-migrate scan ./src --json colors.json
```

### Options

| Option | Description |
| --- | --- |
| `-i, --include <globs...>` | File globs to scan. Defaults to CSS, SCSS, Sass, Less, JS, JSX, TS and TSX. |
| `-e, --ignore <globs...>` | Extra globs to skip, on top of `node_modules`, build output and minified files. |
| `-l, --limit <n>` | How many colors to list. `0` shows all. Defaults to `40`. |
| `-v, --verbose` | Print every occurrence with its exact location. |
| `--json <file>` | Write the full result as JSON. |

### What it finds

Colors are read from stylesheets through PostCSS (with the SCSS and Less
dialects) and from scripts through a lexer that understands strings, template
literals, comments and regex literals.

- Every CSS color syntax: hex, `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`,
  `oklab()`, `oklch()`, `color()` and the 148 named colors.
- Custom properties and preprocessor variables: `--app-bg: #f5f5f5`, `$brand: #0f6cbd`.
- Inline React styles, CSS-in-JS template literals and theme objects.
- Colors inside `@media (prefers-color-scheme: dark)`, `.dark` selectors and
  `dark: {}` theme branches are tagged with the theme they belong to.

It deliberately skips things that only look like colors: hex in comments, inside
regex literals, inside `url()`, class names such as `text-blue-500`, and
identifiers such as `const blue = ...`.

### Why usage is tracked

Fluent has separate token families for foreground, background and stroke, so
`#ffffff` used as text is a different token than `#ffffff` used as a background.
Every occurrence is classified as `text`, `background`, `border`, `outline`,
`shadow`, `fill`, `stroke`, `gradient`, `variable` or `unknown`, which is what
stage 2 uses to pick a token.

Roles come from the CSS property when there is one, and otherwise from the name:
`--text-muted` is text, `$divider-color` is a border, `surface` is a background.

## Stage 2: plan

`plan` takes everything `scan` found and decides which Fluent token each color
should become.

```bash
npx fluent-migrate plan ./src
npx fluent-migrate plan ./src --alternatives   # show runner-up tokens
npx fluent-migrate plan ./src --json plan.json
```

```
      COLOR      USED AS           THEME  USES  FIT     FLUENT TOKEN
  ──  ─────────  ────────────────  ─────  ────  ──────  ─────────────────────────
  ██  #242424    text                        4  exact   colorNeutralForeground1
  ██  #e0e0e0    border                      4  exact   colorNeutralStrokeSubtle
  ██  #292929    background        dark      3  exact   colorNeutralBackground1
  ██  #00000024  shadow                      1  exact   colorNeutralShadowKey
  ██  #0074cc    stroke                      1  close   colorBrandForegroundOnLight Δ0.029
```

### How a token is chosen

Candidates are filtered to the tokens that can do the job — a `border` only
considers stroke tokens — and then ranked by perceptual distance in OKLab,
using the theme's own values, so a color in a dark block is compared against
Fluent's dark values.

Two adjustments keep the ranking honest:

- **Saturation counts extra.** Plain distance is happy to swap a slate gray for
  a brand blue of the same lightness. A gap in how vivid two colors are counts
  against the fit, so grays stay gray.
- **Opacity counts extra.** OKLab ignores alpha, so it is weighted back in and
  a fully transparent token is never offered for an opaque color.

Ties are broken toward the token a Fluent developer would reach for first: rest
before hover, neutral and brand before palette, lower index before higher. Every
tie-break is far smaller than a just-noticeable difference, so it can never
override a closer color.

### Reading the fit

The scale is anchored: black to white is `1.0`, and one step between adjacent
Fluent neutrals is about `0.05`.

| Fit | Distance | Meaning |
| --- | --- | --- |
| `exact` | 0 | The token already holds this value. |
| `near` | < 0.02 | Below the threshold of perception. |
| `close` | < 0.05 | A subtle shift, smaller than one neutral step. |
| `approx` | < 0.15 | A visible shift to the nearest token in the same family. |
| `no fit` | ≥ 0.15 | Nothing suitable; keep a custom value. |

### Light and dark pairs

Colors defined once per theme — a custom property redefined in a dark block, or
the `light` and `dark` branches of a theme object — are pulled out separately,
because a single token can replace both halves and theme itself:

```
  DEFINITION        LIGHT      DARK       FIT    FLUENT TOKEN
  ────────────────  ─────────  ─────────  ─────  ────────────────────────────
  --app-text        ██ #242424 ██ #ffffff exact  colorNeutralForeground1
  --app-background  ██ #f5f5f5 ██ #292929 close  colorNeutralBackground3 in light /
                                                 colorNeutralBackground1 in dark
```

When no single token covers both halves, the best token for each theme is shown
instead of a compromise that is wrong in both.

### The token database

`src/core/tokens/generated.ts` holds all 366 Fluent color tokens with their
light and dark values, plus the role, family, state and rank parsed out of each
name. It is generated from `@fluentui/react-theme` and checked in, so nothing
needs Fluent installed to run a scan or a plan.

```bash
npm run tokens   # regenerate after a Fluent upgrade
```

## Stage 3: fix

`fix` replaces every color literal with the Fluent CSS variable for its token,
in place. Stylesheets stay where they are and nothing is restructured, so the
change is reviewable line by line.

**Nothing is written without `--write`.** The default is a dry run that prints
the diff.

`fix` keeps no backup of its own, so `--write` also requires a clean git tree:
if the target is not a repository, or has uncommitted changes, it refuses
rather than leave you with no way back. `git diff` is the undo button.

```bash
npx fluent-migrate fix ./src            # preview
npx fluent-migrate fix ./src --write    # apply, if git can undo it
```

```
  src/components/Card.css 12 changes
      2:21 -   background-color: #ffffff;
           +   background-color: var(--colorNeutralBackground1);
      5:25 -   box-shadow: 0 2px 4px rgba(0, 0, 0, 0.14);
           +   box-shadow: 0 2px 4px var(--colorNeutralShadowKey);
     16:38 -   background: linear-gradient(90deg, #c50f1f 0%, #b10e1c 100%);
           +   background: linear-gradient(90deg, var(--colorStatusDangerBackground3) 0%,
                           var(--colorStatusDangerBackground3Hover) 100%);
```

### Options

| Option | Description |
| --- | --- |
| `-w, --write` | Apply the changes. Without it nothing is written. |
| `--accept <fit>` | Worst fit to apply: `exact`, `near`, `close` or `approximate`. Defaults to `near`, so no color visibly changes. |
| `--preprocessor-vars` | Rewrite Sass and Less variable declarations too. Off by default. |
| `--allow-dirty` | Write even when git cannot undo the result. |
| `-q, --quiet` | Summarize instead of printing every changed line. |

### What it refuses to touch

Every skipped literal is reported with the reason.

- **Sass and Less variables.** `$brand: #0f6cbd` is often passed to
  `darken()` or `rgba()`, which cannot take a `var()`. Opt in with
  `--preprocessor-vars` once you have checked.
- **Arguments to color functions.** `darken(#0f6cbd, 10%)` and
  `rgba(#0f6cbd, 0.5)` are left alone for the same reason.
- **Colors with no close token**, and colors whose nearest token is further
  away than `--accept` allows.
- **Anything that has moved.** Each literal is checked against the exact source
  span the scan recorded, so a file edited after the scan is skipped rather
  than corrupted.

Tokens carry their own dark value, so any dark-mode override that gets rewritten
is now saying the same thing twice. `fix` counts those for you; they can be
deleted.

Running `fix` twice is a no-op: the second pass finds nothing left to change.

## Stage 4: prompt

The mechanical part is done by `fix`. Moving styles into `makeStyles` hooks is a
restructuring job, so `prompt` writes a brief for whatever coding agent you
already use instead of calling a model itself.

```bash
npx fluent-migrate prompt ./src
# .fluent-migrate/PROMPT.md
# .fluent-migrate/plan.json
```

`PROMPT.md` contains the conventions to follow, the light/dark pairs that
collapse into a single token, the colors that must stay hard-coded, and a table
per component giving the file, line, selector, property and exact token for
every color. Components are matched to the stylesheets that import them, so the
brief says "fold `Card.css` into `Card.tsx`" rather than leaving the agent to
work out the connection.

Because every color decision is already made, the agent never has to choose a
token — it only restructures code.

## Programmatic use

```ts
import { buildPlan, matchColor, scanProject } from 'fluent-migrate';

const plan = buildPlan(await scanProject({ root: './src' }));
for (const entry of plan.entries) {
  console.log(entry.hex, entry.usage, '->', entry.best?.token.name);
}

matchColor('#3b82f6', { usage: 'background' });
// [{ token: { name: 'colorBrandBackground', ... }, deltaE: 0.107, quality: 'approximate' }, ...]
```

```ts
import { applyFix, planFix } from 'fluent-migrate';

const result = await planFix(plan, { accept: 'near' });
console.log(result.edits, 'edits across', result.changes.length, 'files');
await applyFix(plan.scan.root, result); // only when you mean it
```

## Development

```bash
npm install
npm test          # vitest
npm run typecheck
npm run tokens    # regenerate the Fluent token database
npm run build     # tsup -> dist/
node dist/cli.js test/fixtures/app --verbose
```

`scripts/calibrate.mts` prints reference distances and sample matches, which is
how the fit thresholds above were set.

`test/fixtures/app` is a small React app that exercises the tricky cases: SCSS
nesting, dark-mode blocks, styled-components, inline styles, and the false
positives the scanner must not report.

## License

MIT
