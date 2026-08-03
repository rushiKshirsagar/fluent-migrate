# How fluent-migrate works

Internals behind the CLI. For day-to-day usage, see the [README](../README.md).

## Scan

Colors are read from stylesheets through PostCSS (SCSS and Less dialects) and from scripts through a lexer that understands strings, template literals, comments, and regex literals.

Supported syntaxes: hex, `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`, `color()`, and the 148 named colors.

Also found:

- Custom properties and preprocessor variables (`--app-bg`, `$brand`)
- Inline React styles, CSS-in-JS template literals, and theme objects
- Colors inside dark scopes (`prefers-color-scheme`, `.dark`, `dark: {}`)

Deliberately skipped: hex in comments, regex literals, `url()`, class names such as `text-blue-500`, and identifiers such as `const blue = ...`.

### Why usage is tracked

Fluent has separate token families for foreground, background, and stroke, so `#ffffff` used as text is a different token than `#ffffff` used as a background. Every occurrence is classified as `text`, `background`, `border`, `outline`, `shadow`, `fill`, `stroke`, `gradient`, `variable`, or `unknown`.

Roles come from the CSS property when there is one, otherwise from the name: `--text-muted` is text, `$divider-color` is a border, `surface` is a background.

## Plan

Candidates are filtered to tokens that can do the job — a `border` only considers stroke tokens — then ranked by perceptual distance in OKLab using the theme's own values.

Adjustments:

- **Saturation counts extra.** Avoids swapping a slate gray for a brand blue of the same lightness.
- **Opacity counts extra.** OKLab ignores alpha, so it is weighted back in; fully transparent tokens are never offered for opaque colors.

Ties break toward rest before hover, neutral/brand before palette, and lower index before higher.

### Fit thresholds

Anchored so black→white is `1.0`, and one Fluent neutral step is about `0.05`.

| Fit | Distance | Meaning |
| --- | --- | --- |
| `exact` | 0 | The token already holds this value |
| `near` | < 0.02 | Below the threshold of perception |
| `close` | < 0.05 | Subtle shift, smaller than one neutral step |
| `approx` | < 0.15 | Visible shift to the nearest token in the family |
| `no fit` | ≥ 0.15 | Nothing suitable; keep a custom value |

### Light and dark pairs

Custom properties redefined in a dark block, or `light` / `dark` theme object branches, are paired so a single theme-aware token can replace both halves. When no single token covers both, each half is reported separately.

### Token database

`src/core/tokens/generated.ts` holds 366 Fluent color tokens with light/dark values plus role, family, state, and rank. Generated from `@fluentui/react-theme` and checked in — consumers do not need Fluent installed to scan or plan.

```bash
npm run tokens   # regenerate after a Fluent upgrade
```

## Fix

Replaces matched literals with `var(--tokenName)` in place. Stylesheets are not restructured.

Skipped by default:

- Sass/Less variable declarations (opt in with `--preprocessor-vars`)
- Arguments to color functions (`darken()`, `rgba(#hex, 0.5)`, …)
- Colors below the `--accept` threshold
- Literals whose source span no longer matches (file edited after scan)

Dark-mode overrides that become redundant after rewrite are counted in the report but not deleted automatically.

## Prompt

`prompt` writes `.fluent-migrate/PROMPT.md` and `plan.json` for an external coding agent. Token decisions are already made; the agent only restructures styles into `makeStyles` hooks. Components are paired with stylesheets they import when the import is relative.
