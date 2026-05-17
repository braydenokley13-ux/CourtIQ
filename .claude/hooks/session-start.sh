#!/bin/bash
# SessionStart hook — prepares the workspace so tests and linters work
# in Claude Code on the web sessions.
#
# A fresh remote container clones the repo without node_modules, without
# a generated Prisma client, and without the compiled @courtiq/* shared
# packages. Until those exist, `vitest` in apps/web fails to resolve
# `@courtiq/core` and the Prisma enums (e.g. SessionMode) are undefined
# at runtime. This hook installs and builds them once at session start.
set -euo pipefail

# Only run in the remote (Claude Code on the web) environment; local
# checkouts manage their own dependencies.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Install all workspace dependencies (pnpm monorepo).
pnpm install --frozen-lockfile

# Generate the Prisma client (@courtiq/db) and compile the shared
# @courtiq/core package. apps/web resolves both at test time, so they
# must exist before vitest runs. Idempotent — safe to re-run.
pnpm --filter "@courtiq/db" --filter "@courtiq/core" run build
