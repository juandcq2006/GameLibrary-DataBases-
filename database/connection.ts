// Shared by database/cli.ts and database/backup.ts: how we connect, and how SQL files are run.
import { fileURLToPath } from 'node:url';
import { createConnection, type Connection } from 'mysql2/promise';
import { splitSql } from './sql-files.ts';

export { checksum, splitSql } from './sql-files.ts';

/**
 * MySQL 8's default sql_mode plus STRICT_ALL_TABLES. The CSE 335 server's global sql_mode is
 * empty, which makes MySQL truncate or zero out bad values with only a warning. Setting it per
 * session restores the strict behaviour the schema was designed for: bad data is rejected with
 * an error. (Every table is InnoDB, so STRICT_ALL_TABLES changes nothing else; it also lets the
 * tests tell our setting apart from a server's default.)
 * backend/db.ts sets the same value on every pooled connection.
 */
export const SQL_MODE =
  'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../backend/.env', import.meta.url)));
  } catch {
    // No backend/.env: use the process environment.
  }
}

export const env = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME ?? '',
};

/** One connection, strict sql_mode, UTF-8, several statements per query (migration files hold many). */
export async function connect(database: string | undefined = env.database || undefined): Promise<Connection> {
  const db = await createConnection({
    host: env.host,
    port: env.port,
    user: env.user,
    password: env.password,
    database,
    multipleStatements: true,
    charset: 'utf8mb4',
    dateStrings: true, // backups write DATETIME values exactly as stored
  });
  await db.query('SET SESSION sql_mode = ?', [SQL_MODE]);
  return db;
}

/** Runs a whole SQL file (migration, seed or backup) on one connection. */
export async function runSql(db: Connection, sql: string): Promise<void> {
  for (const chunk of splitSql(sql)) await db.query(chunk);
}
