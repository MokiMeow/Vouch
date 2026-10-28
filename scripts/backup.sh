#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ $# -ne 1 || -z "$1" ]]; then
  echo 'Usage: bash scripts/backup.sh NEW_BACKUP_DIRECTORY' >&2
  exit 2
fi
cd "$(dirname "${BASH_SOURCE[0]}")/.."
compose_env=${VOUCH_COMPOSE_ENV:-.env.production}
compose=(docker compose --env-file "$compose_env")
backup_path=$1
if [[ -e "$backup_path" || -L "$backup_path" ]]; then
  echo 'Backup destination must not already exist.' >&2
  exit 1
fi
parent=$(dirname -- "$backup_path")
if [[ ! -d "$parent" ]]; then
  echo 'Create the backup parent directory first.' >&2
  exit 1
fi
running=$("${compose[@]}" ps --status running --services)
if [[ $'\n'"$running"$'\n' =~ $'\n'(api|worker|maintenance|migrate)$'\n' ]]; then
  echo 'Stop api, worker, maintenance and migrate before taking a consistent snapshot.' >&2
  exit 1
fi
stage=$(mktemp -d "$parent/.vouch-backup.XXXXXXXX")
trap 'rm -rf -- "$stage"' EXIT
"${compose[@]}" exec -T database sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$stage/database.dump"
"${compose[@]}" run --rm -T --no-deps --entrypoint tar api \
  --exclude='*.tmp' -C /var/lib/vouch/artifacts -cf - . > "$stage/artifacts.tar"
printf 'vouch-backup-v1\n' > "$stage/FORMAT"
(
  cd "$stage"
  sha256sum database.dump artifacts.tar FORMAT > SHA256SUMS
)
# An atomic rename publishes only a complete snapshot. Never replace an existing path.
if [[ -e "$backup_path" || -L "$backup_path" ]]; then
  echo 'The backup destination was created concurrently.' >&2
  exit 1
fi
mv -T --no-clobber -- "$stage" "$backup_path"
if [[ -d "$stage" ]]; then
  echo 'Backup destination changed before publication.' >&2
  exit 1
fi
trap - EXIT
printf 'Backup completed. Keep the artifact encryption key separately and securely.\n'
