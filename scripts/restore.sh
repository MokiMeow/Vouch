#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ $# -ne 1 || -z "$1" ]]; then
  echo 'Usage: bash scripts/restore.sh BACKUP_DIRECTORY' >&2
  exit 2
fi
backup_path=$(cd -- "$1" && pwd -P)
cd "$(dirname "${BASH_SOURCE[0]}")/.."
compose_env=${VOUCH_COMPOSE_ENV:-.env.production}
compose=(docker compose --env-file "$compose_env")
for file in database.dump artifacts.tar FORMAT SHA256SUMS; do
  if [[ ! -f "$backup_path/$file" || -L "$backup_path/$file" ]]; then
    echo 'Backup files must be regular files without symlinks.' >&2
    exit 1
  fi
done
if [[ $(cat "$backup_path/FORMAT") != 'vouch-backup-v1' ]]; then
  echo 'Unsupported backup format.' >&2
  exit 1
fi
# Only the known snapshot files may be read by the checksum tool.
declare -A manifest_files=()
manifest_pattern='^[0-9a-f]{64}  (database\.dump|artifacts\.tar|FORMAT)$'
while IFS= read -r line; do
  if [[ ! "$line" =~ $manifest_pattern ]]; then
    echo 'Invalid backup checksum manifest.' >&2
    exit 1
  fi
  name=${BASH_REMATCH[1]}
  if [[ -n ${manifest_files[$name]:-} ]]; then
    echo 'Duplicate backup checksum entry.' >&2
    exit 1
  fi
  manifest_files[$name]=1
done < "$backup_path/SHA256SUMS"
if [[ ${#manifest_files[@]} -ne 3 ]]; then
  echo 'Incomplete backup checksum manifest.' >&2
  exit 1
fi
(cd "$backup_path" && sha256sum --check --status SHA256SUMS)
# Reject links, special files and every path except the root and generated UUID files.
archive_names=$(tar -tf "$backup_path/artifacts.tar")
artifact_pattern='^\./[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bin$'
while IFS= read -r name; do
  if [[ "$name" != './' && ! "$name" =~ $artifact_pattern ]]; then
    echo 'The artifact archive contains an unsupported path.' >&2
    exit 1
  fi
done <<< "$archive_names"
archive_types=$(tar -tvf "$backup_path/artifacts.tar")
while IFS= read -r entry; do
  if [[ "${entry:0:1}" != '-' && "${entry:0:1}" != 'd' ]]; then
    echo 'The artifact archive contains links or unsupported entry types.' >&2
    exit 1
  fi
done <<< "$archive_types"
running=$("${compose[@]}" ps --status running --services)
if [[ $'\n'"$running"$'\n' =~ $'\n'(api|worker|maintenance|migrate)$'\n' ]]; then
  echo 'Stop api, worker, maintenance and migrate before restoring.' >&2
  exit 1
fi
objects=$("${compose[@]}" exec -T database sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname = '\''public'\'' AND c.relkind IN ('\''r'\'','\''p'\'','\''v'\'','\''m'\'','\''S'\'')"')
if [[ "$objects" != '0' ]]; then
  echo 'Restore requires an empty database. Existing data will never be overwritten.' >&2
  exit 1
fi
"${compose[@]}" run --rm -T --no-deps --entrypoint node api -e \
  'const fs=require("node:fs");if(fs.readdirSync(process.env.VOUCH_ARTIFACT_DIR).length)process.exit(1)'
# Policies in a schema dump reference this cluster role. Grants are repaired by migration.
"${compose[@]}" exec -T database sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vouch_runtime') THEN
    CREATE ROLE vouch_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
SQL
"${compose[@]}" run --rm -T --no-deps --entrypoint tar api \
  --extract --file - --directory /var/lib/vouch/artifacts \
  --no-same-owner --no-same-permissions --keep-old-files < "$backup_path/artifacts.tar"
"${compose[@]}" exec -T database sh -c 'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --single-transaction --no-owner --no-acl' < "$backup_path/database.dump"
printf 'Restore completed. Run the migration service before starting api and worker.\n'
