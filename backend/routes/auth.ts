// POST /api/auth/signup, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me.
// One endpoint per function in frontend/src/shared/api/api.ts.
import { Router } from 'express';
import type { ResultSetHeader } from 'mysql2/promise';
import { clearSessionCookie, hashPassword, sessionUserId, setSessionCookie, verifyPassword } from '../auth.ts';
import { pool } from '../db.ts';
import { HttpError } from '../http-error.ts';
import type { AuthUser } from '../types.ts';

export const authRouter: Router = Router();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[A-Za-z0-9_-]+$/;

interface UserRow {
  id: number;
  username: string;
  email: string | null;
  password_hash: string | null;
}

function readObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

function readText(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be a string`);
  const text = value.trim();
  if (text.length < min || text.length > max) {
    throw new HttpError(400, `${field} must be between ${min} and ${max} characters`);
  }
  return text;
}

/** bcrypt only reads the first 72 bytes, so reject longer passwords instead of truncating them. */
function readPassword(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'password must be a string');
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes < 8 || bytes > 72) throw new HttpError(400, 'password must be between 8 and 72 bytes');
  return value;
}

function toAuthUser(row: UserRow): AuthUser {
  return { id: Number(row.id), username: row.username, email: row.email ?? '' };
}

async function selectUser(id: number): Promise<AuthUser | null> {
  const [rows] = await pool.query('SELECT id, username, email FROM users WHERE id = ?', [id]);
  const row = (rows as UserRow[])[0];
  return row === undefined ? null : toAuthUser(row);
}

authRouter.post('/signup', async (req, res) => {
  const body = readObject(req.body);

  const username = readText(body.username, 'username', 3, 50);
  if (!USERNAME.test(username)) {
    throw new HttpError(400, 'username may only contain letters, numbers, underscores and hyphens');
  }

  const email = readText(body.email, 'email', 3, 255).toLowerCase();
  if (!EMAIL.test(email)) throw new HttpError(400, 'email must look like name@example.com');

  const password = readPassword(body.password);
  const passwordHash = await hashPassword(password);

  let insertId: number;
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, passwordHash]
    );
    insertId = result.insertId;
  } catch (error) {
    if ((error as { errno?: number }).errno === 1062) {
      throw new HttpError(409, 'username or email is already registered');
    }
    throw error;
  }

  setSessionCookie(res, insertId);
  res.status(201).json({ id: insertId, username, email });
});

authRouter.post('/login', async (req, res) => {
  const body = readObject(req.body);
  const email = readText(body.email, 'email', 3, 255).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  const [rows] = await pool.query(
    'SELECT id, username, email, password_hash FROM users WHERE email = ?',
    [email]
  );
  const row = (rows as UserRow[])[0];

  // Same answer for an unknown email and a wrong password, so the endpoint cannot be used to discover accounts.
  if (row === undefined || row.password_hash === null || !(await verifyPassword(password, row.password_hash))) {
    throw new HttpError(401, 'Invalid email or password');
  }

  setSessionCookie(res, Number(row.id));
  res.json(toAuthUser(row));
});

authRouter.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', async (req, res) => {
  const userId = sessionUserId(req);
  if (userId === null) throw new HttpError(401, 'Authentication required');

  const user = await selectUser(userId);
  if (user === null) {
    clearSessionCookie(res);
    throw new HttpError(401, 'Authentication required');
  }

  res.json(user);
});
