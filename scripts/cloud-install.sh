#!/usr/bin/env bash
set -euo pipefail
repo_path="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_path"
export PNPM_HOME="${PNPM_HOME:-$repo_path/.cache/pnpm}"
export PATH="$PNPM_HOME:$PATH"
mkdir -p "$PNPM_HOME"
if ! command -v pnpm >/dev/null 2>&1; then
  echo 'Install the pnpm version declared in package.json before setup.' >&2
  exit 1
fi
pnpm install --frozen-lockfile
if [[ ! -e .env ]]; then
  (umask 077; cp .env.example .env)
fi
# Placeholder-only setup builds without contacting a database or provider.
pnpm build
if node --input-type=module -e 'import "dotenv/config";const v=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL||"";process.exit(v && !/\[|<|YOUR_|REPLACE_|CHANGE_ME|PLACEHOLDER/i.test(v)?0:1)' >/dev/null 2>&1; then
  pnpm db:migrate
else
  echo 'Build ready. Configure Supabase connection placeholders, then run pnpm db:migrate.'
fi
