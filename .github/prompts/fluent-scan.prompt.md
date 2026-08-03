---
name: fluent-scan
description: Scan a project area for Fluent migration opportunities
agent: agent
tools: ['execute/runInTerminal']
argument-hint: folder path, e.g. ./src/components/chat
---

Ask the user which folder(s) to scan if they did not already provide a path.

Rules:
1. Do not assume `./src`.
2. Accept one folder or several relative paths from the workspace root.
3. Confirm ignore patterns before running:
   - default: `**/*.test.*` `**/*.spec.*` `**/*.stories.*` `**/__tests__/**`
   - ask if they want to ignore SCSS, generated files, or anything else
4. Then run one command per folder, or one command with the first folder as path and includes for the rest.
5. Do not modify files.
6. Summarize only: files scanned, distinct colors, total occurrences, usage categories, dark-theme occurrences, major risks.
7. Do not paste every occurrence unless asked.

Example command:

npx fluent-migrate scan "${path}" \
  --ignore "**/*.test.*" "**/*.spec.*" "**/*.stories.*" "**/__tests__/**"