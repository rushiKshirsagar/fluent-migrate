---
name: fluent-fix-preview
description: Preview safe Fluent token replacements (dry run only)
agent: agent
tools: ['execute/runInTerminal']
argument-hint: folder path, e.g. ./src/components/chat
---

Ask the user which folder(s) to preview if they did not already provide a path.

Rules:
1. Do not assume `./src`.
2. Accept one folder or several relative paths from the workspace root.
3. Confirm ignore patterns before running:
   - default: `**/*.test.*` `**/*.spec.*` `**/*.stories.*` `**/__tests__/**`
4. Run a dry-run only. Never add `--write`.
5. Do not modify files.
6. Summarize only:
   - files that would change
   - edit count
   - skipped reasons (counts)
   - any risky or approximate mappings
7. Do not paste the complete diff unless asked.

Example command:

npx fluent-migrate fix "${path}" \
  --ignore "**/*.test.*" "**/*.spec.*" "**/*.stories.*" "**/__tests__/**"
