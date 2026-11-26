// MySQL connection pool (ADR-0001). Credentials come only from the environment.
import { fileURLToPath } from 'node:url';
import { createPool, type Pool } from 'mysql2/promise';

// A git-ignored backend/.env is read when present; real environment variables win.
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(fileURLToPath(new URL('./.env', import.meta.url)));
  } catch {
    // No .env file: rely on the process environment (tests, docker run -e …).
  }
}

const {
  DB_HOST = '127.0.0.1',
  DB_PORT = '3306',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'geekbond',
} = process.env;

export const pool: Pool = createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  // The class server allows 2 connections per student account, so keep this low there (DB_CONNECTION_LIMIT=1).
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  // ADR-0001: DECIMAL arrives as a number, and DATETIME as text we format as ISO UTC ourselves.
  decimalNumbers: true,
  dateStrings: true,
  charset: 'utf8mb4',
});

/**
 * MySQL 8's default sql_mode plus STRICT_ALL_TABLES, set on every new connection before it is
 * used. The CSE 335 server's global sql_mode is empty, so without this MySQL silently truncates
 * or zeroes bad values instead of rejecting them. Same value as SQL_MODE in database/connection.ts.
 */
export const SQL_MODE =
  'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

// 'connection' fires once per new physical connection; the SET is queued ahead of its first query.
pool.pool.on('connection', (connection) => {
  connection.query(`SET SESSION sql_mode = '${SQL_MODE}'`, (error: Error | null) => {
    if (error) console.error('Could not set strict sql_mode:', error.message);
  });
});
