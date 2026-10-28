#!/usr/bin/env bash
# Rebuilds PetOS schema + seed on a LOCAL/TEST Postgres only (drops schema public & app!).
# Usage: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/postgres ./scripts/db-reset-local.sh
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"
case "$DATABASE_URL" in *127.0.0.1*|*localhost*) ;; *) echo "Refusing: not a local database" >&2; exit 1;; esac
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
set client_min_messages = warning;
drop schema if exists app cascade;
drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres;
delete from auth.users where email like '%.petos.test';
SQL
for f in "$ROOT"/supabase/migrations/*.sql "$ROOT"/supabase/seed.sql; do
  PGOPTIONS="-c client_min_messages=warning" psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" || { echo "FAILED: $f" >&2; exit 1; }
done
echo "PetOS schema + seed applied."
# Tell PostgREST (if running) to reload its schema cache.
psql "$DATABASE_URL" -q -c "notify pgrst, 'reload schema'" >/dev/null 2>&1 || true
