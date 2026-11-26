// npm run db:backup: writes the whole database (tables, rows, views, triggers) to one .sql file.
// db:migrate calls it before applying anything to the shared database. Written in Node instead
// of calling mysqldump, so it works on any teammate's machine with only `npm install`.
//
// Restore with `npm run db:restore -- <file> --yes`, the mysql client, or MySQL Workbench
// (Server → Data Import → Import from Self-Contained File).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connection, RowDataPacket } from 'mysql2/promise';

/** Git-ignored: backups hold real accounts (emails, password hashes). DB_BACKUP_DIR overrides it. */
export const BACKUP_DIR = process.env.DB_BACKUP_DIR || fileURLToPath(new URL('./backups', import.meta.url));

const ROWS_PER_INSERT = 200;
const q = (name: string) => `\`${name.replace(/`/g, '``')}\``;

/** `DEFINER=user@host` only works when restoring as that same account, so backups leave it out. */
const withoutDefiner = (sql: string) => sql.replace(/\sDEFINER\s*=\s*`[^`]*`@`[^`]*`/i, '');

async function list<T>(db: Connection, sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await db.query<RowDataPacket[]>(sql, params);
  return rows as T[];
}

/** The backup as SQL text: drop everything, recreate tables, insert rows, then views and triggers. */
export async function dumpDatabase(db: Connection): Promise<string> {
  const [{ name: database }] = await list<{ name: string }>(db, 'SELECT DATABASE() AS name');
  const objects = await list<{ name: string; type: string }>(
    db,
    `SELECT table_name AS name, table_type AS type FROM information_schema.tables
      WHERE table_schema = DATABASE() ORDER BY table_name`
  );
  const tables = objects.filter((o) => o.type === 'BASE TABLE').map((o) => o.name);
  const views = objects.filter((o) => o.type === 'VIEW').map((o) => o.name);
  const triggers = await list<{ name: string }>(
    db,
    `SELECT trigger_name AS name FROM information_schema.triggers
      WHERE trigger_schema = DATABASE() ORDER BY event_object_table, action_timing, event_manipulation, action_order`
  );

  const out: string[] = [
    `-- Backup of database ${q(database)}, taken ${new Date().toISOString()} by npm run db:backup.`,
    '-- Restoring REPLACES every table, view and trigger below in the database you run it on.',
    '',
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS = 0;',
    "SET SESSION sql_mode = 'NO_AUTO_VALUE_ON_ZERO';",
    '',
  ];

  for (const t of await list<{ name: string }>(
    db,
    `SELECT trigger_name AS name FROM information_schema.triggers WHERE trigger_schema = DATABASE()`
  )) {
    out.push(`DROP TRIGGER IF EXISTS ${q(t.name)};`);
  }
  for (const v of views) out.push(`DROP VIEW IF EXISTS ${q(v)};`);
  for (const t of tables) out.push(`DROP TABLE IF EXISTS ${q(t)};`);
  out.push('');

  // Rows go in before the triggers exist, so restoring does not write new activity history.
  for (const table of tables) {
    const [[create]] = await db.query<RowDataPacket[]>(`SHOW CREATE TABLE ${q(table)}`);
    out.push(`${create['Create Table']};`, '');

    const [rows, fields] = await db.query({ sql: `SELECT * FROM ${q(table)}`, rowsAsArray: true });
    const data = rows as unknown[][];
    if (data.length === 0) continue;
    const columns = fields.map((f) => q(f.name)).join(', ');
    for (let i = 0; i < data.length; i += ROWS_PER_INSERT) {
      const values = data.slice(i, i + ROWS_PER_INSERT).map((row) => `(${row.map((v) => db.escape(v)).join(', ')})`);
      out.push(`INSERT INTO ${q(table)} (${columns}) VALUES\n${values.join(',\n')};`);
    }
    out.push('');
  }

  // Views read only tables here (none reads another view), so their order does not matter.
  for (const view of views) {
    const [[create]] = await db.query<RowDataPacket[]>(`SHOW CREATE VIEW ${q(view)}`);
    out.push(`${withoutDefiner(create['Create View'])};`, '');
  }

  if (triggers.length > 0) {
    out.push('DELIMITER $$');
    for (const { name } of triggers) {
      const [[create]] = await db.query<RowDataPacket[]>(`SHOW CREATE TRIGGER ${q(name)}`);
      out.push(`${withoutDefiner(create['SQL Original Statement'])}$$`, '');
    }
    out.push('DELIMITER ;', '');
  }

  out.push('SET FOREIGN_KEY_CHECKS = 1;', '');
  return out.join('\n');
}

/** Writes the backup to BACKUP_DIR and returns the file's path. */
export async function backupDatabase(db: Connection): Promise<string> {
  const sql = await dumpDatabase(db);
  const [{ name }] = await list<{ name: string }>(db, 'SELECT DATABASE() AS name');
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = join(BACKUP_DIR, `${name}-${stamp}.sql`);
  writeFileSync(file, sql);
  return file;
}
