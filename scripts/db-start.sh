#!/usr/bin/env bash
set -euo pipefail
repo_path="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$repo_path/.data/postgres"
# Development-only credentials and a loopback-only listener; never use in production.
if ! docker inspect vouch-postgres >/dev/null 2>&1; then
  docker run -d --name vouch-postgres -p 127.0.0.1:54329:5432 -e POSTGRES_USER=vouch -e POSTGRES_PASSWORD=vouch-local-only -e POSTGRES_DB=vouch --mount "type=bind,source=$repo_path/.data/postgres,target=/var/lib/postgresql/data" postgres:17-alpine >/dev/null
else
  docker start vouch-postgres >/dev/null
fi
for attempt in {1..30}; do
  if docker exec vouch-postgres pg_isready -U vouch -d vouch >/dev/null 2>&1; then
    echo 'Vouch PostgreSQL ready'; exit 0
  fi
  sleep 1
done
echo 'PostgreSQL did not become ready' >&2
exit 1
