/* Local fixture drill only: never read production rows or restore into a Supabase project. */
const { mkdtemp, writeFile, readFile, rm, chmod, stat } = require('node:fs/promises');
const { randomBytes } = require('node:crypto');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const quote = value => `"${value.replace(/"/g, '""')}"`;
const scope = "n.nspname not in ('information_schema') and n.nspname !~ '^pg_'";

async function snapshot(client) {
  const tables = (await client.query(`select n.nspname as schema,c.relname as name,c.relrowsecurity as rls,
    c.relforcerowsecurity as force_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where ${scope} and c.relkind in ('r','p') order by 1,2`)).rows;
  const rows = [];
  for (const table of tables) {
    const value = (await client.query(`select count(*)::int as count,
      md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) as fingerprint
      from ${quote(table.schema)}.${quote(table.name)} t`)).rows[0];
    rows.push({ ...table, ...value });
  }
  const constraints = (await client.query(`select n.nspname as schema,c.relname as table_name,k.conname as name,
    pg_get_constraintdef(k.oid,true) as definition,k.convalidated as validated
    from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
    where ${scope} order by 1,2,3`)).rows;
  const policies = (await client.query(`select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    from pg_policies where schemaname !~ '^pg_' and schemaname<>'information_schema' order by 1,2,3`)).rows;
  const functions = (await client.query(`select n.nspname as schema,p.proname as name,
    pg_get_function_identity_arguments(p.oid) as arguments,pg_get_functiondef(p.oid) as definition,
    (select array_agg(a::text order by a::text) from unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a) as grants
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${scope} and p.prokind in ('f','p') order by 1,2,3`)).rows;
  const grants = (await client.query(`select n.nspname as schema,c.relname as name,c.relkind as kind,
    (select array_agg(a::text order by a::text) from unnest(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))) a) as grants
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where ${scope} order by 1,2,3`)).rows;
  const schemaGrants = (await client.query(`select n.nspname as schema,
    (select array_agg(a::text order by a::text) from unnest(coalesce(n.nspacl,acldefault('n',n.nspowner))) a) as grants
    from pg_namespace n where ${scope} order by 1`)).rows;
  const columnGrants = (await client.query(`select n.nspname as schema,c.relname as table_name,a.attname as column_name,
    (select array_agg(p::text order by p::text) from unnest(a.attacl) p) as grants
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    where ${scope} and a.attnum>0 and not a.attisdropped and a.attacl is not null order by 1,2,3`)).rows;
  return { rows, constraints, policies, functions, grants, schemaGrants, columnGrants };
}

module.exports = async function backupRestoreDrill({ admin, as, check, equal, Client, connectionString, ids }) {
  const source = new URL(connectionString);
  const sourceDb = decodeURIComponent(source.pathname.slice(1));
  if (!['localhost','127.0.0.1','[::1]'].includes(source.hostname) || !/^nuvemmeet_security_[a-z0-9_]+$/.test(sourceDb)) {
    throw new Error('Backup drill requires a guarded local synthetic fixture database.');
  }
  equal((await admin.query('select current_database() as db')).rows[0].db, sourceDb, 'Backup source is the synthetic fixture');
  const { runBackup, runRestore, BackupError } = await import(pathToFileURL(path.join(__dirname, '../../scripts/database-backup.mjs')).href);
  const directory = await mkdtemp(path.join(tmpdir(), 'nuvlink-backup-drill-'));
  const keyFile = path.join(directory, 'key');
  const wrongKeyFile = path.join(directory, 'wrong-key');
  const archive = path.join(directory, 'fixture.nuvlink');
  const targetDb = `nuvlink_restore_${randomBytes(8).toString('hex')}`;
  const targetUrl = new URL(source);
  targetUrl.pathname = `/${targetDb}`;
  let target, targetCreated = false;
  const refuse = async (operation, code, message) => {
    try { await operation(); } catch (error) {
      check(error instanceof BackupError && error.code === code, `${message}: controlled ${code}`);
      return;
    }
    throw new Error(message);
  };
  try {
    await writeFile(keyFile, randomBytes(32), { mode: 0o600, flag: 'wx' });
    await writeFile(wrongKeyFile, randomBytes(32), { mode: 0o600, flag: 'wx' });
    const sourceSnapshot = await snapshot(admin);
    check(sourceSnapshot.rows.some(table => table.schema === 'auth' && table.count > 0), 'Drill includes synthetic authentication accounts');
    check(sourceSnapshot.rows.some(table => table.schema === 'storage'), 'Drill includes synthetic Storage metadata');
    await runBackup({ sourceUrl: connectionString, outputPath: archive, keyFile });
    equal((await stat(archive)).mode & 0o777, 0o600, 'Encrypted archive permissions are private');
    const encrypted = await readFile(archive);
    check(!encrypted.includes(Buffer.from('alice@example.test')), 'Encrypted archive does not expose a known synthetic identity');
    await refuse(() => runBackup({ sourceUrl: connectionString, outputPath: archive, keyFile }), 'BACKUP_DESTINATION_EXISTS', 'Backup cannot overwrite an existing archive');
    equal(await readFile(archive), encrypted, 'Refused overwrite preserves the original archive');
    await chmod(keyFile, 0o644);
    await refuse(() => runBackup({ sourceUrl: connectionString, outputPath: path.join(directory, 'unsafe'), keyFile }), 'KEY_FILE_UNSAFE', 'Backup refuses a publicly readable key');
    await chmod(keyFile, 0o600);
    await refuse(() => runRestore({ targetUrl: connectionString, inputPath: archive, keyFile }), 'RESTORE_TARGET_REFUSED', 'Restore cannot target the source or a production-named database');

    // CREATE/DROP are restricted to this random localhost-only disposable database.
    await admin.query(`create database ${quote(targetDb)} template template0`);
    targetCreated = true;
    target = new Client({ connectionString: targetUrl.href });
    await target.connect();
    const emptySnapshot = await snapshot(target);
    const corrupted = Buffer.from(encrypted);
    corrupted[Math.floor(corrupted.length / 2)] ^= 1;
    const tampered = path.join(directory, 'tampered.nuvlink');
    await writeFile(tampered, corrupted, { mode: 0o600, flag: 'wx' });
    await refuse(() => runRestore({ targetUrl: targetUrl.href, inputPath: tampered, keyFile }), 'BACKUP_AUTHENTICATION_FAILED', 'Tampering fails authentication before restore');
    equal(await snapshot(target), emptySnapshot, 'Tampered archive makes no target changes');
    await refuse(() => runRestore({ targetUrl: targetUrl.href, inputPath: archive, keyFile: wrongKeyFile }), 'BACKUP_AUTHENTICATION_FAILED', 'Wrong key fails authentication before restore');
    equal(await snapshot(target), emptySnapshot, 'Wrong key makes no target changes');
    await target.query('create table public.restore_guard_probe(id integer)');
    await refuse(() => runRestore({ targetUrl: targetUrl.href, inputPath: archive, keyFile }), 'RESTORE_TARGET_NOT_EMPTY', 'Restore refuses a nonempty target');
    equal((await target.query('select count(*)::int as count from public.restore_guard_probe')).rows[0].count, 0, 'Existing target objects remain untouched');
    await target.query('drop table public.restore_guard_probe');

    await runRestore({ targetUrl: targetUrl.href, inputPath: archive, keyFile });
    const restored = await snapshot(target);
    equal(restored.rows, sourceSnapshot.rows, 'Restored table counts, row fingerprints and RLS flags match every source table');
    equal(restored.constraints, sourceSnapshot.constraints, 'Restored primary/foreign/check/unique/exclusion constraints match');
    equal(restored.policies, sourceSnapshot.policies, 'Restored RLS policies match');
    equal(restored.functions, sourceSnapshot.functions, 'Restored function definitions and execution grants match');
    equal(restored.grants, sourceSnapshot.grants, 'Restored table and sequence grants match');
    equal(restored.schemaGrants, sourceSnapshot.schemaGrants, 'Restored schema grants match');
    equal(restored.columnGrants, sourceSnapshot.columnGrants, 'Restored column-specific grants match');
    equal((await as(ids.alice, 'select id from public.profiles', [], target)).rows.map(row => row.id), [ids.alice], 'Restored RLS isolates customer profile');
    const visibleAppointments = (await as(ids.alice, 'select customer_id from public.appointments', [], target)).rows;
    check(visibleAppointments.length > 0 && visibleAppointments.every(row => row.customer_id === ids.alice), 'Restored RLS isolates customer appointments');
    equal((await as(ids.hostA, 'select owner_id from public.businesses', [], target)).rows.map(row => row.owner_id),
      (await as(ids.hostA, 'select owner_id from public.businesses')).rows.map(row => row.owner_id), 'Restored tenant visibility matches original policies');
    await refuse(() => runRestore({ targetUrl: targetUrl.href, inputPath: archive, keyFile }), 'RESTORE_TARGET_NOT_EMPTY', 'Successful restoration cannot be overwritten');
    equal(await snapshot(admin), sourceSnapshot, 'Read-only backup and isolated drill preserve the source');
    console.log('PASS: encrypted local fixture backup/restore; authentication, counts, constraints, grants, RLS and tenant isolation.');
  } finally {
    await target?.end();
    if (targetCreated) await admin.query(`drop database ${quote(targetDb)}`);
    await rm(directory, { recursive: true, force: true });
  }
};
