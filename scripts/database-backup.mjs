#!/usr/bin/env node
// Database URLs and encryption key paths are deliberately accepted via environment only by the CLI.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { lstat, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MAGIC = Buffer.from('NUVLINK_DB_V1\0');
const HEADER_BYTES = MAGIC.length + 12;
const TAG_BYTES = 16;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export class BackupError extends Error {
  constructor(code) { super(code); this.name = 'BackupError'; this.code = code; }
}
const fail = (code) => { throw new BackupError(code); };

async function keyBytes(keyFile) {
  if (!keyFile) fail('KEY_FILE_REQUIRED');
  try {
    const info = await lstat(keyFile);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size !== 32 ||
      (info.mode & 0o077) !== 0 || typeof process.getuid !== 'function' || info.uid !== process.getuid()) {
      fail('KEY_FILE_UNSAFE');
    }
    // O_NOFOLLOW also prevents a symlink replacement between lstat and open.
    const { constants } = await import('node:fs');
    const handle = await open(keyFile, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (opened.ino !== info.ino || opened.dev !== info.dev) fail('KEY_FILE_UNSAFE');
      return await handle.readFile();
    } finally { await handle.close(); }
  } catch (error) {
    if (error instanceof BackupError) throw error;
    fail('KEY_FILE_UNAVAILABLE');
  }
}

function connectionEnvironment(rawUrl, restore = false) {
  let url;
  try { url = new URL(rawUrl); } catch { fail('DATABASE_URL_INVALID'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash || !url.hostname) fail('DATABASE_URL_INVALID');
  if ([...url.searchParams.keys()].some(key => !['sslmode', 'sslrootcert'].includes(key))) fail('DATABASE_URL_OPTIONS_UNSUPPORTED');
  let database, username, password;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
    username = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch { fail('DATABASE_URL_INVALID'); }
  if (!database || !username || [database, username, password].some(value => value.includes('\0'))) fail('DATABASE_URL_INVALID');
  const local = LOCAL_HOSTS.has(url.hostname);
  if (restore && (!local || !/^nuvlink_restore_[a-z0-9_]+$/.test(database))) fail('RESTORE_TARGET_REFUSED');
  const sslmode = url.searchParams.get('sslmode') || (local ? 'disable' : '');
  if (!local && sslmode !== 'verify-full') fail('REMOTE_TLS_VERIFY_FULL_REQUIRED');
  if (!['disable', 'prefer', 'require', 'verify-ca', 'verify-full'].includes(sslmode)) fail('DATABASE_TLS_INVALID');
  // Clear inherited libpq settings: PGSERVICE/PGHOSTADDR/PGOPTIONS must never redirect a guarded target.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
  Object.assign(env, {
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432', PGDATABASE: database,
    PGUSER: username, PGPASSWORD: password, PGSSLMODE: sslmode, PGCONNECT_TIMEOUT: '15',
    PGAPPNAME: restore ? 'nuvlink-isolated-restore' : 'nuvlink-encrypted-backup',
    // The source connection is read-only, including functions invoked by pg_dump.
    PGOPTIONS: restore ? '-c statement_timeout=300000' : '-c default_transaction_read_only=on -c statement_timeout=300000',
  });
  if (url.searchParams.has('sslrootcert')) env.PGSSLROOTCERT = url.searchParams.get('sslrootcert');
  return { env, database };
}

function command(binary, args, env, clientBin) {
  const executable = clientBin ? path.join(clientBin, binary) : binary;
  const child = spawn(executable, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  // Tool errors can contain rows, SQL, hostnames or credentials. Never retain or print stderr.
  child.stderr.resume();
  const done = new Promise((resolve, reject) => {
    child.once('error', () => reject(new BackupError('POSTGRES_CLIENT_UNAVAILABLE')));
    child.once('close', code => code === 0 ? resolve() : reject(new BackupError('POSTGRES_OPERATION_FAILED')));
  });
  // A stream can fail before the process exits; attach a handler immediately.
  done.catch(() => {});
  return { child, done };
}

async function queryTarget(env, clientBin) {
  const sql = `select json_build_object('database',current_database(),'objects',
    (select count(*) from pg_namespace where nspname not in ('public','information_schema') and nspname !~ '^pg_') +
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') +
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') +
    (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'))`;
  const { child, done } = command('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], env, clientBin);
  let output = '';
  for await (const chunk of child.stdout) {
    output += chunk.toString();
    if (output.length > 4096) { child.kill(); fail('RESTORE_TARGET_CHECK_FAILED'); }
  }
  await done;
  try { return JSON.parse(output); } catch { fail('RESTORE_TARGET_CHECK_FAILED'); }
}

/** Stream pg_dump directly into an authenticated encrypted archive. No plaintext dump touches disk. */
export async function runBackup({ sourceUrl, outputPath, keyFile, clientBin = process.env.PG_CLIENT_BIN }) {
  const { env } = connectionEnvironment(sourceUrl);
  const key = await keyBytes(keyFile);
  if (!outputPath) fail('BACKUP_PATH_REQUIRED');
  let output, child, created = false;
  try {
    output = await open(outputPath, 'wx', 0o600);
    created = true;
    const header = Buffer.concat([MAGIC, randomBytes(12)]);
    const cipher = createCipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
    cipher.setAAD(header);
    const encrypt = new Transform({
      transform(chunk, _encoding, callback) {
        try { callback(null, cipher.update(chunk)); } catch { callback(new BackupError('BACKUP_ENCRYPTION_FAILED')); }
      },
      flush(callback) {
        try { this.push(cipher.final()); this.push(cipher.getAuthTag()); callback(); }
        catch { callback(new BackupError('BACKUP_ENCRYPTION_FAILED')); }
      },
    });
    const operation = command('pg_dump', ['--format=custom', '--no-owner', '--no-password'], env, clientBin);
    child = operation.child;
    const destination = output.createWriteStream();
    destination.write(header);
    await Promise.all([pipeline(child.stdout, encrypt, destination), operation.done]);
    output = undefined; // createWriteStream owns and closes the file descriptor.
    return { format: 'nuvlink-db-v1', encrypted: true };
  } catch (error) {
    child?.kill();
    if (output) await output.close().catch(() => {});
    if (created) await rm(outputPath, { force: true }).catch(() => {});
    if (error instanceof BackupError) throw error;
    fail(error?.code === 'EEXIST' ? 'BACKUP_DESTINATION_EXISTS' : 'BACKUP_FAILED');
  } finally { key.fill(0); }
}

async function authenticatedPlaintext(inputPath, key, directory) {
  let source;
  try {
    source = await open(inputPath, 'r');
    const info = await source.stat();
    if (!info.isFile() || info.size <= HEADER_BYTES + TAG_BYTES) fail('BACKUP_FORMAT_INVALID');
    const header = Buffer.alloc(HEADER_BYTES);
    const tag = Buffer.alloc(TAG_BYTES);
    await source.read(header, 0, HEADER_BYTES, 0);
    await source.read(tag, 0, TAG_BYTES, info.size - TAG_BYTES);
    if (!header.subarray(0, MAGIC.length).equals(MAGIC)) fail('BACKUP_FORMAT_INVALID');
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    const plainPath = path.join(directory, 'authenticated.dump');
    const plain = await open(plainPath, 'wx', 0o600);
    // Same descriptor for header/ciphertext prevents a path replacement during validation.
    const ciphertext = source.createReadStream({ start: HEADER_BYTES, end: info.size - TAG_BYTES - 1, autoClose: false });
    await pipeline(ciphertext, decipher, plain.createWriteStream());
    return plainPath;
  } catch (error) {
    if (error instanceof BackupError) throw error;
    fail('BACKUP_AUTHENTICATION_FAILED');
  } finally { await source?.close().catch(() => {}); }
}

/** Only a fresh localhost nuvlink_restore_* database is permitted. Never cleans/drops existing objects. */
export async function runRestore({ targetUrl, inputPath, keyFile, clientBin = process.env.PG_CLIENT_BIN }) {
  const { env, database } = connectionEnvironment(targetUrl, true);
  const key = await keyBytes(keyFile);
  let directory, child;
  try {
    directory = await mkdtemp(path.join(tmpdir(), 'nuvlink-restore-')); // mkdtemp creates mode 0700.
    const plainPath = await authenticatedPlaintext(inputPath, key, directory);
    // Authentication completes before connecting to the target or making any restore write.
    const state = await queryTarget(env, clientBin);
    if (state.database !== database || Number(state.objects) !== 0) fail('RESTORE_TARGET_NOT_EMPTY');
    const operation = command('pg_restore', ['--single-transaction', '--exit-on-error', '--no-owner', '--no-password', '--dbname', database, plainPath], env, clientBin);
    child = operation.child;
    child.stdout.resume();
    await operation.done;
    return { restored: true, isolated: true };
  } catch (error) {
    child?.kill();
    if (error instanceof BackupError) throw error;
    fail('RESTORE_FAILED');
  } finally {
    key.fill(0);
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

async function cli() {
  const [operation, archive, ...extra] = process.argv.slice(2);
  if (operation === '--help' && !archive) {
    console.log('Usage: node scripts/database-backup.mjs backup|restore ARCHIVE\nEnvironment: NUVLINK_BACKUP_KEY_FILE; NUVLINK_BACKUP_DATABASE_URL or NUVLINK_RESTORE_DATABASE_URL; optional PG_CLIENT_BIN.');
    return;
  }
  if (!['backup', 'restore'].includes(operation) || !archive || extra.length) fail('USAGE_INVALID');
  const common = { keyFile: process.env.NUVLINK_BACKUP_KEY_FILE };
  if (operation === 'backup') await runBackup({ ...common, sourceUrl: process.env.NUVLINK_BACKUP_DATABASE_URL, outputPath: archive });
  else await runRestore({ ...common, targetUrl: process.env.NUVLINK_RESTORE_DATABASE_URL, inputPath: archive });
  console.log(operation === 'backup' ? 'Encrypted backup created.' : 'Isolated restore completed.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch(error => {
    console.error(`Operation refused or failed: ${error instanceof BackupError ? error.code : 'UNEXPECTED_FAILURE'}`);
    process.exitCode = 1;
  });
}
