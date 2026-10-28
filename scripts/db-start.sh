#!/usr/bin/env bash
set -euo pipefail
repo_path="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_path"
exec node scripts/db-start.mjs
