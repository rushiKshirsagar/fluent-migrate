---
name: fluent-prompt
description: Generate a makeStyles migration brief for a scoped folder
agent: agent
tools: ['execute/runInTerminal']
argument-hint: folder path, e.g. ./src/components/chat
---

Ask the user which folder(s) to generate a prompt pack for if they did not already provide a path.

Rules:
1. Do not assume `./src`. Prefer a small product or component folder — whole-repo packs are often too large for chat.
2. Confirm ignore patterns before running:
   - default: `**/*.test.*` `**/*.spec.*` `**/*.stories.*` `**/__tests__/**`
3. Write output to a scoped directory, e.g. `.fluent-migrate/<folder-name>`.
4. After the command finishes, do not paste the full PROMPT.md into chat.
5. Summarize only:
   - output path
   - component count
   - color decisions already made
   - unmatched / hard-coded leftovers
6. Offer next steps: open the generated PROMPT.md in a new chat for the structural rewrite.

Example command:

npx fluent-migrate prompt "${path}" \
  --ignore "**/*.test.*" "**/*.spec.*" "**/*.stories.*" "**/__tests__/**" \
  --out ".fluent-migrate/${name}"
