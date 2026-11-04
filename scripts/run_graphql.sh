#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JS_SCRIPT="$ROOT_DIR/scripts/_lib/run_graphql.mjs"

if [[ ! -f "$JS_SCRIPT" ]]; then
  echo "[ERROR] Missing Node entrypoint: $JS_SCRIPT" >&2
  echo "[ERROR] Run 'pnpm run prepare' from the monorepo root to populate _lib/." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] 'node' not found in PATH. Install Node.js 18 or newer." >&2
  exit 1
fi

MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [[ "$MAJOR" -lt 18 ]]; then
  echo "[ERROR] Node.js 18+ required (found $(node --version))." >&2
  exit 1
fi

exec node -- "$JS_SCRIPT" "$@"
