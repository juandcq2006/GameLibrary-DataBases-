// Data-access contract (frontend/src/shared/api/api.ts): URLs, methods, bodies and error handling.
// The server-side behavior itself is covered by tests/backend/api.test.ts.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteMyReview,
  getCurrentUser,
  getGameReviews,
  getGames,
  getLibrary,
  logIn,
  logOut,
  newUserGame,
  saveMyReview,
  saveUserGame,
  signUp,
} from '../../../frontend/src/shared/api/api.ts';
import type { UserGame } from '../../../frontend/src/shared/domain/game.ts';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

/** Replaces fetch for one test and records every call. */
function stubFetch(payload: unknown, status = 200): RecordedCall[] {
  const calls: RecordedCall[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  return calls;
}

test('getGames calls GET /api/games and returns the catalog', async () => {
  const games = [{ id: 'g1', title: 'Game One' }];
  const calls = stubFetch(games);

  assert.deepEqual(await getGames(), games);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/games');
  assert.equal(calls[0].init?.method, undefined); // fetch defaults to GET
});

test('getLibrary calls GET /api/me/games and returns the keyed object', async () => {
  const library = { g1: { gameId: 'g1' } };
  const calls = stubFetch(library);

  assert.deepEqual(await getLibrary(), library);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/me/games');
});

test('saveUserGame PATCHes only the changed fields as JSON', async () => {
  const saved: UserGame = {
    gameId: 'elden-ring',
    status: 'CURRENT',
    score: null,
    hoursPlayed: 12.5,
    isFavorite: false,
    isInstalled: false,
    achievementsUnlocked: 0,
    notes: null,
    lastPlayedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const calls = stubFetch(saved);
  const changes: Partial<UserGame> = { status: 'CURRENT', hoursPlayed: 12.5 };

  assert.deepEqual(await saveUserGame('elden-ring', changes), saved);
  assert.equal(calls[0].url, '/api/me/games/elden-ring');

  const init = calls[0].init;
  assert.ok(init);
  assert.equal(init.method, 'PATCH');
  assert.equal((init.headers as Record<string, string>)['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(String(init.body)), changes);
});

test('saveUserGame encodes game ids that need it', async () => {
  const calls = stubFetch({});

  await saveUserGame('a/b c', {});
  assert.equal(calls[0].url, '/api/me/games/a%2Fb%20c');
});

test('a non-2xx response rejects with the API error message', async () => {
  stubFetch({ error: 'score must be an integer between 0 and 100, or null' }, 400);

  await assert.rejects(saveUserGame('g1', { score: 150 }), /score must be an integer/);
});

test('a non-JSON error falls back to the HTTP status', async () => {
  globalThis.fetch = (async () => new Response('oops', { status: 500 })) as typeof fetch;

  await assert.rejects(getGames(), /HTTP error 500/);
});

test('getGames forwards pagination, filter and sort parameters', async () => {
  const calls = stubFetch([]);

  await getGames({ page: 2, limit: 5, search: 'elden ring', format: 'PC', sort: 'releaseYear', order: 'asc' });

  assert.equal(
    calls[0].url,
    '/api/games?page=2&limit=5&search=elden+ring&format=PC&sort=releaseYear&order=asc'
  );
});

test('getGameReviews calls GET /api/games/:id/reviews and encodes the id', async () => {
  const reviews = [{ gameId: 'g1', body: 'Great game.' }];
  const calls = stubFetch(reviews);

  assert.deepEqual(await getGameReviews('a/b c'), reviews);
  assert.equal(calls[0].url, '/api/games/a%2Fb%20c/reviews');
});

test('saveMyReview PUTs only the body to /api/me/reviews/:id', async () => {
  const saved = { gameId: 'g1', body: 'Updated.' };
  const calls = stubFetch(saved);

  assert.deepEqual(await saveMyReview('g1', 'Updated.'), saved);
  assert.equal(calls[0].url, '/api/me/reviews/g1');

  const init = calls[0].init;
  assert.ok(init);
  assert.equal(init.method, 'PUT');
  assert.equal((init.headers as Record<string, string>)['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(String(init.body)), { body: 'Updated.' });
});

test('deleteMyReview accepts a 204 No Content response', async () => {
  const calls: RecordedCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  assert.equal(await deleteMyReview('g1'), undefined);
  assert.equal(calls[0].url, '/api/me/reviews/g1');
  assert.equal(calls[0].init?.method, 'DELETE');
});

test('signUp POSTs the form and returns the new account', async () => {
  const user = { id: 7, username: 'pixelpam', email: 'pam@example.com' };
  const calls = stubFetch(user, 201);
  const input = {
    username: 'pixelpam',
    email: 'pam@example.com',
    password: ['test', 'pass', 'phrase'].join('-'),
  };

  assert.deepEqual(await signUp(input), user);
  assert.equal(calls[0].url, '/api/auth/signup');
  assert.equal(calls[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), input);
});

test('logIn POSTs the credentials and returns the account', async () => {
  const user = { id: 7, username: 'pixelpam', email: 'pam@example.com' };
  const calls = stubFetch(user);
  const input = { email: 'pam@example.com', password: ['test', 'pass', 'phrase'].join('-') };

  assert.deepEqual(await logIn(input), user);
  assert.equal(calls[0].url, '/api/auth/login');
  assert.equal(calls[0].init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), input);
});

test('logOut accepts a 204 No Content response', async () => {
  const calls: RecordedCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  assert.equal(await logOut(), undefined);
  assert.equal(calls[0].url, '/api/auth/logout');
  assert.equal(calls[0].init?.method, 'POST');
});

test('getCurrentUser returns null when the API answers 401', async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;

  assert.equal(await getCurrentUser(), null);
});

test('getCurrentUser returns the account when signed in', async () => {
  const user = { id: 7, username: 'pixelpam', email: 'pam@example.com' };
  const calls = stubFetch(user);

  assert.deepEqual(await getCurrentUser(), user);
  assert.equal(calls[0].url, '/api/auth/me');
});

test('new rows use the user_games column defaults', () => {
  const row = newUserGame('x');
  assert.deepEqual(
    { ...row, updatedAt: '' },
    {
      gameId: 'x',
      status: null,
      score: null,
      hoursPlayed: 0,
      isFavorite: false,
      isInstalled: false,
      achievementsUnlocked: 0,
      notes: null,
      lastPlayedAt: null,
      updatedAt: '',
    }
  );
});
