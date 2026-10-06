#!/bin/bash
# Prepare remote Claude Code workspaces with the pinned dependencies and
# validated local basketball content. This product needs no backend setup.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
pnpm install --frozen-lockfile
pnpm content:materialize
