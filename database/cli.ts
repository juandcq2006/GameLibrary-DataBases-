// Applies migrations and seeds to the database named in backend/.env (the shared group database).
//
//   npm run db:status    which server, user and database you are connected to, and what is applied
//   npm run db:backup    writes the whole database to database/backups/<db>-<time>.sql
//   npm run db:migrate   backs up, then applies every migration not yet recorded in schema_migrations
//   npm run db:seed      runs every file in database/seeds/ (they are idempotent, safe to re-run)
//   npm run db:restore -- <file> --yes   replaces the database with a backup
//
// Connection: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, the same variables the API uses.
// Every session runs in strict sql_mode (see SQL_MODE in connection.ts).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { backupDatabase } from './backup.ts';
import { checksum, connect, env, runSql } from './connection.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const MIGRATIONS = join(here, 'migrations');
const SEEDS = join(here, 'seeds');

/** If a database was set up by hand before this tool existed, these tables prove a migration ran. */
const APPLIED_IF_TABLE_EXISTS: Record<string, string> = {
  '001_init.sql': 'users',
  '002_normalization.sql': 'companies',
};

const sqlFiles = (dir: string) =>
  readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort();

const readMigration = (file: string) => readFileSync(join(MIGRATIONS, file), 'utf8');

async function rows<T>(db: Connection, sql: string, params: unknown[] = []): Promise<T[]> {
  const [result] = await db.query<RowDataPacket[]>(sql, params);
  return result as T[];
}

async function tableExists(db: Connection, name: string): Promise<boolean> {
  const found = await rows(db, 'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [name]);
  return found.length > 0;
}

async function columnExists(db: Connection, table: string, column: string): Promise<boolean> {
  const found = await rows(
    db,
    'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [table, column]
  );
  return found.length > 0;
}

type Applied = Map<string, string | null>; // filename → checksum recorded when it was applied

async function readApplied(db: Connection): Promise<Applied> {
  if (!(await tableExists(db, 'schema_migrations'))) return new Map();
  const hasChecksum = await columnExists(db, 'schema_migrations', 'checksum');
  const done = await rows<{ filename: string; checksum: string | null }>(
    db,
    `SELECT filename, ${hasChecksum ? 'checksum' : 'NULL AS checksum'} FROM schema_migrations`
  );
  return new Map(done.map((r) => [r.filename, r.checksum]));
}

/** Migration files whose content no longer matches what was applied. */
function editedMigrations(applied: Applied): string[] {
  return [...applied]
    .filter(([file, sum]) => sum !== null && existsSync(join(MIGRATIONS, file)) && checksum(readMigration(file)) !== sum)
    .map(([file]) => file);
}

/**
 * Creates or upgrades the bookkeeping table, records migrations that were applied by hand
 * earlier, and fills in checksums that were never recorded (trusting the files as they are now).
 */
async function prepareMigrationTable(db: Connection): Promise<Applied> {
  if (!(await tableExists(db, 'schema_migrations'))) {
    await db.query(`CREATE TABLE schema_migrations (
      filename    VARCHAR(255) PRIMARY KEY,
      checksum    CHAR(64) NULL,
      applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    for (const [file, table] of Object.entries(APPLIED_IF_TABLE_EXISTS)) {
      if (await tableExists(db, table)) {
        await db.query('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
        console.log(`  ${file} was already applied by hand (table ${table} exists), recorded it`);
      }
    }
  } else if (!(await columnExists(db, 'schema_migrations', 'checksum'))) {
    await db.query('ALTER TABLE schema_migrations ADD COLUMN checksum CHAR(64) NULL AFTER filename');
  }

  const applied = await readApplied(db);
  for (const [file, sum] of applied) {
    if (sum === null && existsSync(join(MIGRATIONS, file))) {
      await db.query('UPDATE schema_migrations SET checksum = ? WHERE filename = ?', [checksum(readMigration(file)), file]);
      console.log(`  recorded the checksum of ${file}`);
    }
  }
  return readApplied(db);
}

function refuseEdited(edited: string[]) {
  console.error(`\nThese migrations changed after they were applied to ${env.database}:`);
  for (const f of edited) console.error(`  ${f}`);
  console.error('An applied migration must never change: the database would no longer match the file.');
  console.error('Undo the edit (git checkout -- database/migrations/<file>) and put the change in a new migration.');
  process.exit(1);
}

async function migrate(db: Connection) {
  const noBackup = process.argv.includes('--no-backup');
  const applied = await prepareMigrationTable(db);
  const edited = editedMigrations(applied);
  if (edited.length > 0) refuseEdited(edited);

  const pending = sqlFiles(MIGRATIONS).filter((f) => !applied.has(f));
  if (pending.length === 0) return console.log('Nothing to migrate: the database is up to date.');

  if (noBackup) {
    console.log('  skipping the backup (--no-backup)');
  } else {
    console.log(`  backed up ${env.database} to ${await backupDatabase(db)}`);
  }

  for (const file of pending) {
    const sql = readMigration(file);
    process.stdout.write(`  applying ${file} … `);
    try {
      await runSql(db, sql);
    } catch (error) {
      console.log('FAILED');
      // MySQL DDL is not transactional: tell the team before anyone retries on the shared database.
      console.error(`\n${file} stopped part-way: ${(error as Error).message}`);
      console.error('Earlier statements in that file may already be applied. Tell the team before anyone retries.');
      if (!noBackup) console.error('To undo it, restore the backup above: npm run db:restore -- <that file> --yes');
      process.exit(1);
    }
    await db.query('INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)', [file, checksum(sql)]);
    console.log('ok');
  }
}

async function seed(db: Connection) {
  for (const file of sqlFiles(SEEDS)) {
    process.stdout.write(`  seeding ${file} … `);
    await runSql(db, readFileSync(join(SEEDS, file), 'utf8'));
    console.log('ok');
  }
}

async function backup(db: Connection) {
  console.log(`Backed up ${env.database} to ${await backupDatabase(db)}`);
  console.log('Backups hold real accounts (emails, password hashes): keep them out of git and the group chat.');
}

async function restore(db: Connection) {
  const file = process.argv.slice(3).find((a) => !a.startsWith('--'));
  if (!file || !existsSync(file)) {
    console.error('Usage: npm run db:restore -- <backup file> --yes');
    process.exit(1);
  }
  if (!process.argv.includes('--yes')) {
    console.error(`This REPLACES everything in ${env.database} with ${file}, for every teammate.`);
    console.error('Run `npm run db:backup` first if the current data matters, then add --yes to confirm.');
    process.exit(1);
  }
  // Drop what is there now, including tables a half-applied migration created that the backup lacks.
  const objects = await rows<{ name: string; type: string }>(
    db,
    'SELECT table_name AS name, table_type AS type FROM information_schema.tables WHERE table_schema = DATABASE()'
  );
  const triggers = await rows<{ name: string }>(
    db,
    'SELECT trigger_name AS name FROM information_schema.triggers WHERE trigger_schema = DATABASE()'
  );
  const q = (name: string) => `\`${name.replace(/`/g, '``')}\``;
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of triggers) await db.query(`DROP TRIGGER IF EXISTS ${q(t.name)}`);
  for (const o of objects.filter((x) => x.type === 'VIEW')) await db.query(`DROP VIEW IF EXISTS ${q(o.name)}`);
  for (const o of objects.filter((x) => x.type !== 'VIEW')) await db.query(`DROP TABLE IF EXISTS ${q(o.name)}`);
  await runSql(db, readFileSync(file, 'utf8'));
  console.log(`Restored ${env.database} from ${file}. Run npm run db:status to check it.`);
}

async function status(db: Connection) {
  const [info] = await rows<{ db: string; user: string; version: string; mode: string }>(
    db,
    'SELECT DATABASE() AS db, CURRENT_USER() AS user, VERSION() AS version, @@SESSION.sql_mode AS mode'
  );
  console.log(`Server:   ${env.host}:${env.port} (MySQL ${info.version})`);
  console.log(`User:     ${info.user}`);

  if (!info.db) {
    const dbs = await rows<{ name: string }>(
      db,
      `SELECT schema_name AS name FROM information_schema.schemata
        WHERE schema_name NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
        ORDER BY schema_name`
    );
    console.log('\nDB_NAME is empty. Databases this account can open:');
    for (const d of dbs) console.log(`  ${d.name}`);
    if (dbs.length === 0) console.log('  (none: ask the instructor to check your group access)');
    console.log('\nPut your group database (group name or group name-01) in DB_NAME in backend/.env, then run this again.');
    return;
  }
  console.log(`Database: ${info.db}   ← must be your group name or group name-01, the same for every teammate`);
  console.log(`SQL mode: ${info.mode.includes('STRICT_TRANS_TABLES') ? 'strict (bad values are rejected)' : `NOT strict: ${info.mode}`}`);

  const applied = await readApplied(db);
  const edited = new Set(editedMigrations(applied));
  console.log('\nMigrations:');
  for (const f of sqlFiles(MIGRATIONS)) {
    const mark = edited.has(f) ? '!' : applied.has(f) ? 'x' : ' ';
    console.log(`  [${mark}] ${f}${edited.has(f) ? '   ← CHANGED after it was applied' : ''}`);
  }
  if (applied.size === 0) console.log('  (no schema_migrations table yet: run npm run db:migrate)');
  if (edited.size > 0) console.log('  [!] = the file no longer matches what was applied: undo the edit, use a new migration');

  const tables = await rows<{ name: string; type: string }>(
    db,
    `SELECT table_name AS name, table_type AS type FROM information_schema.tables
      WHERE table_schema = DATABASE() ORDER BY table_name`
  );
  console.log('\nTables:');
  for (const t of tables) {
    if (t.type === 'VIEW') {
      console.log(`  ${t.name.padEnd(20)} (view)`);
      continue;
    }
    const [{ n }] = await rows<{ n: number }>(db, `SELECT COUNT(*) AS n FROM \`${t.name.replace(/`/g, '``')}\``);
    console.log(`  ${t.name.padEnd(20)} ${n} rows`);
  }

  const triggers = await rows<{ name: string }>(
    db,
    'SELECT trigger_name AS name FROM information_schema.triggers WHERE trigger_schema = DATABASE() ORDER BY trigger_name'
  );
  if (triggers.length > 0) console.log(`\nTriggers: ${triggers.map((t) => t.name).join(', ')}`);
}

const commands: Record<string, (db: Connection) => Promise<void>> = { status, backup, migrate, seed, restore };
const command = commands[process.argv[2] ?? ''];
if (!command) {
  console.error('Usage: node database/cli.ts <status|backup|migrate|seed|restore>');
  process.exit(1);
}
if (!env.database && command !== status) {
  console.error('DB_NAME is empty. Run `npm run db:status` to list your databases, then set DB_NAME in backend/.env.');
  process.exit(1);
}

let db: Connection;
try {
  db = await connect();
} catch (error) {
  const { code, message } = error as { code?: string; message: string };
  console.error(`Could not connect to ${env.user}@${env.host}:${env.port}: ${message}`);
  if (code === 'ER_ACCESS_DENIED_ERROR') console.error('Check DB_USER and DB_PASSWORD in backend/.env.');
  if (code === 'ER_DBACCESS_DENIED_ERROR' || code === 'ER_BAD_DB_ERROR') {
    console.error('Check DB_NAME in backend/.env (empty it and run `npm run db:status` to list your databases).');
  }
  if (code === 'ER_USER_LIMIT_REACHED') {
    console.error('Your account allows 2 connections at once: close MySQL Workbench tabs and stop `npm run api`, then retry.');
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    console.error('The server is unreachable from this network: try the campus network or the university VPN.');
  }
  process.exit(1);
}
try {
  await command(db);
} finally {
  await db.end();
}
