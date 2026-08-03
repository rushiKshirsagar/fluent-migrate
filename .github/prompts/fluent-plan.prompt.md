---
name: fluent-plan
description: Map hard-coded colors onto Fluent design tokens
agent: agent
tools: ['execute/runInTerminal']
argument-hint: folder path, e.g. ./src/components/chat
---

Ask the user which folder(s) to plan if they did not already provide a path.

Rules:
1. Do not assume `./src`.
2. Accept one folder or several relative paths from the workspace root.
3. Confirm ignore patterns before running:
   - default: `**/*.test.*` `**/*.spec.*` `**/*.stories.*` `**/__tests__/**`
   - ask if they want to ignore SCSS, generated files, or anything else
4. Then run one command per folder.
5. Do not modify files.
6. Summarize only:
   - colors mapped with exact / near / close / approx / no fit
   - confident automation rate (exact + near)
   - light/dark pairs worth collapsing
   - colors that must stay custom
7. Do not paste the full plan table unless asked.

Example command:

npx fluent-migrate plan "${path}" \
  --ignore "**/*.test.*" "**/*.spec.*" "**/*.stories.*" "**/__tests__/**"
