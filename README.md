# fluent-migrate

Migrate hard-coded CSS/SCSS/JS colors to Fluent UI design tokens — safely, reviewably, and stage by stage.

```bash
npx fluent-migrate scan ./src
```

## Pipeline

| Stage | Command | What it does |
| --- | --- | --- |
| 1. Scan | `fluent-migrate scan` | Inventory colors and how each is used |
| 2. Plan | `fluent-migrate plan` | Map each color to the nearest Fluent token |
| 3. Fix | `fluent-migrate fix` | Rewrite literals to `var(--tokenName)` (dry-run by default) |
| 4. Prompt | `fluent-migrate prompt` | Write an agent brief for `makeStyles` restructuring |

Each stage can stop for review before the next one runs.

## Quick start

```bash
# Inventory
npx fluent-migrate scan ./src

# Token mapping
npx fluent-migrate plan ./src

# Preview rewrites (nothing written)
npx fluent-migrate fix ./src

# Apply (requires a clean git tree)
npx fluent-migrate fix ./src --write

# Agent brief for makeStyles migration
npx fluent-migrate prompt ./src
```

## Scope folders and ignore noise

Pass any folder — not only `./src`:

```bash
npx fluent-migrate scan ./packages/ui
npx fluent-migrate plan ./src/components/chat
```

Skip tests, stories, and other noise on **every** stage (settings are not persisted):

```bash
npx fluent-migrate scan ./src \
  --ignore "**/*.test.*" "**/*.spec.*" "**/*.stories.*" "**/__tests__/**"

npx fluent-migrate plan ./src \
  --ignore "**/*.test.*" "**/*.spec.*" "**/*.stories.*" "**/__tests__/**"

npx fluent-migrate fix ./src \
  --ignore "**/*.test.*" "**/*.spec.*" "**/*.stories.*" "**/__tests__/**"

npx fluent-migrate prompt ./src \
  --ignore "**/*.test.*" "**/*.spec.*" "**/*.stories.*" "**/__tests__/**" \
  --out .fluent-migrate/chat
```

Common options on `scan` / `plan` / `fix` / `prompt`:

| Option | Description |
| --- | --- |
| `[path]` | Root folder to process. Defaults to `.` |
| `-i, --include <globs...>` | File globs to include |
| `-e, --ignore <globs...>` | Extra globs to skip |

## Safety

- `fix` is a **dry run** unless you pass `--write`
- `--write` refuses dirty / non-git trees (override with `--allow-dirty`)
- Default `--accept near` only applies imperceptible color shifts
- Sass variables and color-function args are skipped unless you opt in
- Running `fix` twice is a no-op

```bash
npx fluent-migrate fix ./src                      # preview
npx fluent-migrate fix ./src --write              # apply
npx fluent-migrate fix ./src --accept close       # allow subtle shifts
npx fluent-migrate fix ./src --preprocessor-vars  # also rewrite $vars
```

## Fit quality

| Fit | Meaning |
| --- | --- |
| `exact` | Token already holds this value |
| `near` | Below the threshold of perception |
| `close` | Subtle shift, less than one Fluent neutral step |
| `approx` | Visible shift to the nearest suitable token |
| `no fit` | Keep a custom value |

Matching is role-aware (`#fff` as text ≠ `#fff` as background), theme-aware (light/dark), and uses perceptual distance rather than hex equality. Details: [docs/how-it-works.md](docs/how-it-works.md).

## Optional: VS Code Copilot

Slash-command prompts live in [`.github/prompts/`](.github/prompts/). They are **not** installed with the npm package — copy them into the app you are migrating:

```text
your-app/
  .github/
    prompts/
      fluent-scan.prompt.md
      fluent-plan.prompt.md
      fluent-fix-preview.prompt.md
      fluent-prompt.prompt.md
```

Then in Copilot Chat:

```text
/fluent-scan
/fluent-plan
/fluent-fix-preview
/fluent-prompt
```

Each command asks which folder(s) to target and which ignore patterns to use, then runs the matching CLI and summarizes the result.

## License

MIT
