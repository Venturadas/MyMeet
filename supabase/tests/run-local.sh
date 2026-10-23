#!/usr/bin/env bash
# Disposable databases only. This creates mock auth.users, never real Supabase auth.
set -euo pipefail
if [[ "${1:-}" == '--help' ]]; then
  cat <<'HELP'
Usage: cd supabase/tests && npm ci && npm test
PG_BIN=/path/to/postgresql/bin npm test   # Optional system PostgreSQL 15+
PG_CLIENT_BIN=/path/to/postgresql/17/bin npm test  # pg_dump, pg_restore and psql
DATABASE_URL=postgresql://...@localhost/... npm test

DATABASE_URL must identify an EMPTY, local, disposable database whose name
starts with nuvemmeet_security_. Tests create mock Auth objects; never use a real
Supabase project. Without DATABASE_URL a temporary cluster is created and removed.
The local test role must also create/drop the random isolated restore database.
Backup clients must support the server version; the default embedded server is 17.
HELP
  exit 0
fi
[[ $# -eq 0 ]] || { echo 'Unsupported argument. Use --help.' >&2; exit 1; }
TEST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export NODE_PATH="${NUVEMMEET_TEST_MODULES:-$TEST_ROOT/node_modules}${NODE_PATH:+:$NODE_PATH}"
for client in pg_dump pg_restore psql; do
  if [[ -n "${PG_CLIENT_BIN:-}" ]]; then
    [[ -x "$PG_CLIENT_BIN/$client" ]] || { echo "Missing $client in PG_CLIENT_BIN; install PostgreSQL 17 clients. Use --help." >&2; exit 1; }
  else
    command -v "$client" >/dev/null || { echo "Missing $client; install PostgreSQL 17 clients or set PG_CLIENT_BIN. Use --help." >&2; exit 1; }
  fi
done

if [[ -n "${DATABASE_URL:-}" ]]; then
  exec node "$TEST_ROOT/security.cjs"
fi

PG_BIN="${PG_BIN:-}"
if [[ -z "$PG_BIN" ]]; then
  PG_BIN="$(node -e 'const path=require("node:path"); const entry=require.resolve(`@embedded-postgres/${process.platform}-${process.arch}`); process.stdout.write(path.join(path.dirname(entry),"../native/bin"));')"
fi
[[ -x "$PG_BIN/initdb" && -x "$PG_BIN/pg_ctl" ]] || { echo 'Set PG_BIN to a PostgreSQL 15+ bin directory containing initdb and pg_ctl.' >&2; exit 1; }
TEST_TMP="$(mktemp -d "${TMPDIR:-/tmp}/nuvemmeet-security.XXXXXXXX")"
TEST_PORT="$(node -e 'const server=require("node:net").createServer();server.listen(0,"127.0.0.1",()=>{process.stdout.write(String(server.address().port));server.close();});')"
cleanup() {
  "$PG_BIN/pg_ctl" -D "$TEST_TMP/data" -m immediate -w stop >/dev/null 2>&1 || true
  rm -rf "$TEST_TMP"
}
trap cleanup EXIT INT TERM
"$PG_BIN/initdb" -D "$TEST_TMP/data" -U postgres --auth-local=trust --auth-host=trust --encoding=UTF8 --no-locale >"$TEST_TMP/initdb.log" 2>&1 || { cat "$TEST_TMP/initdb.log" >&2; exit 1; }
"$PG_BIN/pg_ctl" -D "$TEST_TMP/data" -l "$TEST_TMP/postgres.log" -o "-h 127.0.0.1 -p $TEST_PORT -k $TEST_TMP" -w start >/dev/null || { cat "$TEST_TMP/postgres.log" >&2; exit 1; }
export DATABASE_URL="postgresql://postgres@127.0.0.1:$TEST_PORT/nuvemmeet_security_local"
node - <<'NODE'
const { Client } = require('pg');
const url = new URL(process.env.DATABASE_URL);
url.pathname = '/postgres';
(async () => {
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try { await client.query('CREATE DATABASE nuvemmeet_security_local'); }
  finally { await client.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
NODE
node "$TEST_ROOT/security.cjs"
