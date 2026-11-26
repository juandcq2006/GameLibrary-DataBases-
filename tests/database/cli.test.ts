// database/cli.ts and connection.ts: DELIMITER handling, checksums, strict sql_mode, backup and
// restore, and refusing to run when an applied migration was edited. The SQL-splitting tests
// always run; the rest use throwaway databases and skip when MySQL isn't reachable.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// sql-files.ts, not connection.ts: connection.ts reads backend/.env, which may point at the shared database.
import { checksum, splitSql } from '../../database/sql-files.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { DB_HOST = 'localhost', DB_PORT = '3306', DB_USER = 'root', DB_PASSWORD = '' } = process.env;
const stamp = `${process.pid}_${Date.now()}`;
const MAIN = `geekbond_test_cli_${stamp}`;
const RESTORED = `geekbond_test_restored_${stamp}`;
const backupDir = mkdtempSync(join(tmpdir(), 'geekbond-backups-'));

const sql = (database: string | null, query: string) =>
  execFileSync(
    'mysql',
    ['-h', DB_HOST, '-P', DB_PORT, '-u', DB_USER, '--batch', '--skip-column-names', ...(database ? [database] : [])],
    { env: { ...process.env, MYSQL_PWD: DB_PASSWORD }, input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim().replace(/\r\n/g, '\n');

/**
 * Runs `node database/cli.ts …` against a test database. Every DB_* variable is passed
 * explicitly, so backend/.env (which may point at the shared group database) is never used.
 */
const cli = (database: string, ...args: string[]) =>
  spawnSync(process.execPath, [join(root, 'database', 'cli.ts'), ...args], {
    env: {
      ...process.env,
      DB_HOST, DB_PORT, DB_USER, DB_PASSWORD,
      DB_NAME: database,
      DB_BACKUP_DIR: backupDir,
    },
    encoding: 'utf8',
  });

let skip: string | false = false;
try {
  sql(null, 'SELECT 1');
} catch {
  skip = `MySQL not reachable at ${DB_USER}@${DB_HOST}:${DB_PORT}`;
}

before(() => {
  if (!skip) sql(null, `CREATE DATABASE \`${MAIN}\`; CREATE DATABASE \`${RESTORED}\``);
});

after(() => {
  if (!skip) sql(null, `DROP DATABASE IF EXISTS \`${MAIN}\`; DROP DATABASE IF EXISTS \`${RESTORED}\``);
  rmSync(backupDir, { recursive: true, force: true });
});

test('splitSql keeps files without DELIMITER whole, and splits trigger bodies like the mysql client', () => {
  assert.deepEqual(splitSql('SELECT 1;\nSELECT 2;'), ['SELECT 1;\nSELECT 2;']);
  const chunks = splitSql(
    'CREATE TABLE t (a INT);\r\nDELIMITER $$\r\nCREATE TRIGGER x BEFORE INSERT ON t FOR EACH ROW\r\nBEGIN\r\n  SET NEW.a = 1;\r\nEND$$\r\n-- comment only\r\nDELIMITER ;\r\nSELECT 1;'
  );
  assert.deepEqual(chunks, [
    'CREATE TABLE t (a INT);',
    'CREATE TRIGGER x BEFORE INSERT ON t FOR EACH ROW\nBEGIN\n  SET NEW.a = 1;\nEND',
    'SELECT 1;',
  ]);
});

test('checksums ignore Windows vs Unix line endings but catch real edits', () => {
  assert.equal(checksum('a;\r\nb;\r\n'), checksum('a;\nb;\n'));
  assert.notEqual(checksum('a;\nb;\n'), checksum('a;\nb ;\n'));
});

test('db:migrate backs up first, applies every migration and records a checksum for each', { skip }, () => {
  const run = cli(MAIN, 'migrate');
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /backed up .* to /);
  assert.match(run.stdout, /applying 003_integrity_activity_tags\.sql … ok/);
  assert.equal(readdirSync(backupDir).length, 1, 'one backup file');

  const migrations = readdirSync(join(root, 'database', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  assert.equal(
    sql(MAIN, 'SELECT filename, checksum FROM schema_migrations ORDER BY filename'),
    migrations.map((f) => `${f}\t${checksum(readFileSync(join(root, 'database', 'migrations', f), 'utf8'))}`).join('\n')
  );
  assert.ok(Number(sql(MAIN, 'SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = DATABASE()')) >= 10);

  const again = cli(MAIN, 'migrate');
  assert.match(again.stdout, /Nothing to migrate/);
  assert.equal(readdirSync(backupDir).length, 1, 'no backup when nothing is pending');
});

test('db:seed loads the seeds, and db:status reports strict mode and the triggers', { skip }, () => {
  const seeded = cli(MAIN, 'seed');
  assert.equal(seeded.status, 0, seeded.stderr);
  const status = cli(MAIN, 'status');
  assert.match(status.stdout, /SQL mode: strict/);
  assert.match(status.stdout, /\[x\] 003_integrity_activity_tags\.sql/);
  assert.match(status.stdout, /Triggers: .*trg_user_games_after_update/);
});

// The class server's global sql_mode is empty. Changing a server's global mode here would race
// the other test files, so this checks for STRICT_ALL_TABLES instead: no MySQL default has it,
// so seeing it proves our own SET SESSION ran on the connection.
test('the API pool and the CLI set strict sql_mode on every connection', { skip }, () => {
  const probe = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const { pool } = await import(${JSON.stringify(new URL('../../backend/db.ts', import.meta.url).href)});
       const [[row]] = await pool.query('SELECT @@SESSION.sql_mode AS mode');
       console.log(row.mode); await pool.end();`,
    ],
    { env: { ...process.env, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME: MAIN }, encoding: 'utf8' }
  );
  assert.match(probe.stdout, /STRICT_ALL_TABLES/, probe.stderr);
  assert.match(cli(MAIN, 'status').stdout, /SQL mode: strict/);
});

test('db:backup and db:restore round-trip tables, rows, views and triggers', { skip }, () => {
  const backup = cli(MAIN, 'backup');
  assert.equal(backup.status, 0, backup.stderr);
  const file = /to (.+\.sql)/.exec(backup.stdout)?.[1] ?? '';
  assert.ok(file.endsWith('.sql'), backup.stdout);
  assert.doesNotMatch(readFileSync(file, 'utf8'), /DEFINER=/, 'restorable by any teammate account');

  const refused = cli(RESTORED, 'restore', file);
  assert.equal(refused.status, 1, 'needs --yes');
  const restored = cli(RESTORED, 'restore', file, '--yes');
  assert.equal(restored.status, 0, restored.stderr);

  const snapshot = (db: string) =>
    sql(db, `SELECT (SELECT COUNT(*) FROM games), (SELECT COUNT(*) FROM user_games), (SELECT COUNT(*) FROM reviews),
                    (SELECT COUNT(*) FROM activity), (SELECT COUNT(*) FROM game_tags), (SELECT COUNT(*) FROM schema_migrations),
                    (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = DATABASE()),
                    (SELECT COUNT(*) FROM information_schema.views WHERE table_schema = DATABASE())`);
  assert.equal(snapshot(RESTORED), snapshot(MAIN));
  // Triggers work after a restore, and restoring did not add activity rows of its own.
  assert.throws(() => sql(RESTORED, "UPDATE user_games SET achievements_unlocked = 999 WHERE user_id = 1 AND game_id = 'elden-ring'"));
});

test('db:migrate refuses to run when an applied migration no longer matches its file', { skip }, () => {
  sql(MAIN, `UPDATE schema_migrations SET checksum = REPEAT('0', 64) WHERE filename = '001_init.sql'`);
  const run = cli(MAIN, 'migrate');
  assert.equal(run.status, 1);
  assert.match(run.stderr, /changed after they were applied[\s\S]*001_init\.sql/);
  assert.match(cli(MAIN, 'status').stdout, /\[!\] 001_init\.sql/);
});
