// Account passwords and stateless session cookies.
//
// Passwords are hashed with bcrypt (bcryptjs, pure JavaScript, no native build).
// A session is a short signed token in an httpOnly cookie; there is no session table,
// so the API stays stateless and a restart only invalidates sessions when AUTH_SECRET
// changes. Set AUTH_SECRET in production so tokens survive a deploy.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { HttpError } from './http-error.ts';

export const SESSION_COOKIE = 'geekbond_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // one week
const BCRYPT_ROUNDS = 12;

/** Used only while AUTH_REQUIRE_LOGIN is not "true"; see currentUserId(). */
export const DEMO_USER_ID = 1;

// A per-process random secret is fine for development and tests. In production set
// AUTH_SECRET to a long random value, or every restart logs everyone out.
const secret = process.env.AUTH_SECRET || randomBytes(32).toString('hex');

interface SessionPayload {
  sub: number;
  exp: number;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function sign(payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function encodeSession(userId: number): string {
  const payload: SessionPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

function decodeSession(token: string): number | null {
  const [encoded, signature] = token.split('.');
  if (encoded === undefined || signature === undefined) return null;

  const expected = sign(encoded);
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<SessionPayload>;
    if (typeof payload.sub !== 'number' || typeof payload.exp !== 'number') return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/** Reads one cookie without pulling in a parser dependency. */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (header === undefined) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return null;
}

/** The signed-in user id, or null when the request has no valid session. */
export function sessionUserId(req: Request): number | null {
  const token = readCookie(req, SESSION_COOKIE);
  return token === null ? null : decodeSession(token);
}

/**
 * The user a request acts as.
 *
 * A valid session always wins. Without one the API keeps using the demo user so the
 * current frontend keeps working until its login screen exists; set
 * AUTH_REQUIRE_LOGIN=true to answer 401 instead.
 */
export function currentUserId(req: Request): number {
  const userId = sessionUserId(req);
  if (userId !== null) return userId;
  if (process.env.AUTH_REQUIRE_LOGIN === 'true') throw new HttpError(401, 'Authentication required');
  return DEMO_USER_ID;
}

export function setSessionCookie(res: Response, userId: number): void {
  res.cookie(SESSION_COOKIE, encodeSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}
