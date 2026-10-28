#!/usr/bin/env bash
set -euo pipefail
export PNPM_HOME=/workspace/.pnpm
export PATH="$PNPM_HOME:$PATH"
cd /workspace/Vouch
pnpm install --frozen-lockfile --store-dir /workspace/.pnpm-store
bash scripts/db-start.sh
pnpm db:migrate
pnpm build
