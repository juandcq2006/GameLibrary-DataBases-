// Backend HTTP contract: catalog, library, reviews and accounts. Skips when MySQL is unreachable.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../backend/index.ts';
import { pool } from '../../backend/db.ts';
import type { AuthUser, Game, Library, Review, UserGame } from '../../backend/types.ts';

let server: Server | undefined;
let base = '';
let skip: string | false = false;

try {
  await pool.query('SELECT 1');
} catch {
  skip = 'MySQL not available (check backend/.env or start the container)';
}

before(async () => {
  if (skip) return;
  server = createApp().listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  if (!skip) await pool.execute("DELETE FROM users WHERE email LIKE 'apitest-%@example.com'");
  if (server !== undefined) await new Promise<void>((resolve) => server?.close(() => resolve()));
  await pool.end();
});

/** Built at runtime so no test file contains a literal credential. */
const credential = ['api', 'test', 'pass', 'phrase'].join('-');
const wrongCredential = ['wrong', 'pass', 'phrase'].join('-');
const shortCredential = ['short', 'pw'].join('');

let accountSeq = 0;

interface TestAccount extends AuthUser {
  cookie: string;
}

function cookieFrom(response: Response): string {
  return (response.headers.get('set-cookie') ?? '').split(';')[0];
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  cookie?: string
): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const get = (path: string, cookie?: string): Promise<Response> => call('GET', path, undefined, cookie);
const post = (path: string, body?: unknown, cookie?: string): Promise<Response> =>
  call('POST', path, body, cookie);
const put = (path: string, body: unknown, cookie?: string): Promise<Response> =>
  call('PUT', path, body, cookie);
const patch = (path: string, body: unknown, cookie?: string): Promise<Response> =>
  call('PATCH', path, body, cookie);
const del = (path: string, cookie?: string): Promise<Response> => call('DELETE', path, undefined, cookie);

function uniqueAccount(): { username: string; email: string } {
  accountSeq += 1;
  const stamp = `${Date.now()}_${accountSeq}`;
  return { username: `apitest_${stamp}`, email: `apitest-${stamp}@example.com` };
}

async function newAccount(): Promise<TestAccount> {
  const { username, email } = uniqueAccount();
  const res = await post('/api/auth/signup', { username, email, password: credential });
  assert.equal(res.status, 201);

  const user = (await res.json()) as AuthUser;
  return { ...user, cookie: cookieFrom(res) };
}

// Catalog ---------------------------------------------------------------------------------

test('GET /api/games returns the catalog with genres and computed stats', { skip }, async () => {
  const res = await get('/api/games');
  assert.equal(res.status, 200);

  const games = (await res.json()) as Game[];
  assert.ok(games.length > 0);

  const game = games.find((candidate) => candidate.id === 'elden-ring');
  assert.ok(game);
  assert.equal(typeof game.title, 'string');
  assert.ok(Array.isArray(game.genres));
  assert.ok(game.genres.includes('Souls-like'));
  assert.equal(typeof game.averageScore, 'number');
  assert.equal(typeof game.popularity, 'number');
  assert.equal(typeof game.storageGb, 'number');
  assert.equal(typeof game.achievementsTotal, 'number');
  assert.equal(typeof game.releaseYear, 'number');
});

test('GET /api/games paginates and reports the total in X-Total-Count', { skip }, async () => {
  const first = await get('/api/games?limit=5&page=1');
  assert.equal(first.status, 200);

  const total = Number(first.headers.get('x-total-count'));
  assert.ok(total >= 15);
  assert.equal(first.headers.get('x-page'), '1');
  assert.equal(first.headers.get('x-page-size'), '5');
  assert.equal(first.headers.get('x-total-pages'), String(Math.ceil(total / 5)));

  const page1 = (await first.json()) as Game[];
  assert.equal(page1.length, 5);

  const second = await get('/api/games?limit=5&page=2');
  assert.equal(second.status, 200);
  const page2 = (await second.json()) as Game[];
  assert.equal(page2.length, 5);
  assert.ok(page1.every((game) => !page2.some((other) => other.id === game.id)));
});

test('GET /api/games filters by search, genre, format, release year and score', { skip }, async () => {
  const search = (await (await get('/api/games?search=elden')).json()) as Game[];
  assert.ok(search.some((game) => game.id === 'elden-ring'));

  const genre = (await (await get('/api/games?genre=Souls-like&limit=100')).json()) as Game[];
  assert.ok(genre.some((game) => game.id === 'elden-ring'));
  assert.ok(genre.every((game) => game.genres.includes('Souls-like')));

  const format = (await (await get('/api/games?format=PC&limit=100')).json()) as Game[];
  assert.ok(format.length > 0);
  assert.ok(format.every((game) => game.format === 'PC'));

  const year = (await (await get('/api/games?releaseYear=2024&limit=100')).json()) as Game[];
  assert.ok(year.some((game) => game.id === 'elden-ring'));
  assert.ok(year.every((game) => game.releaseYear === 2024));

  const score = (await (await get('/api/games?minScore=95&limit=100')).json()) as Game[];
  assert.ok(score.every((game) => game.averageScore >= 95));

  const combined = (await (await get('/api/games?search=elden&format=PC')).json()) as Game[];
  assert.deepEqual(combined.map((game) => game.id), ['elden-ring']);
});

test('GET /api/games sorts by a whitelisted field and order', { skip }, async () => {
  const res = await get('/api/games?sort=releaseYear&order=asc&limit=100');
  assert.equal(res.status, 200);

  const years = ((await res.json()) as Game[]).map((game) => game.releaseYear);
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
});

test('GET /api/games rejects invalid pagination and filter values with 400', { skip }, async () => {
  const queries = [
    'limit=0',
    'limit=101',
    'page=0',
    'page=abc',
    'format=BOGUS',
    'releaseYear=abc',
    'sort=evil',
    'order=up',
    'minScore=101',
  ];

  for (const query of queries) {
    const res = await get(`/api/games?${query}`);
    assert.equal(res.status, 400, `should reject ?${query}`);
    assert.equal(typeof ((await res.json()) as { error: string }).error, 'string');
  }
});

// Library ---------------------------------------------------------------------------------

test('GET /api/me/games returns an object keyed by game id, not an array', { skip }, async () => {
  const res = await get('/api/me/games');
  assert.equal(res.status, 200);

  const library = (await res.json()) as Library;
  assert.ok(!Array.isArray(library));

  const ids = Object.keys(library);
  assert.ok(ids.length > 0);
  for (const id of ids) assert.equal(library[id].gameId, id);

  const row = library[ids[0]];
  assert.equal(typeof row.isFavorite, 'boolean');
  assert.equal(typeof row.hoursPlayed, 'number');
  assert.equal(typeof row.updatedAt, 'string');
});

test('PATCH merges onto the stored row, so edits to different fields never overwrite each other', { skip }, async () => {
  const gameId = 'starfield';

  const favorite = await patch(`/api/me/games/${gameId}`, { isFavorite: true });
  assert.equal(favorite.status, 200);

  const res = await patch(`/api/me/games/${gameId}`, { status: 'PAUSED', notes: 'later' });
  assert.equal(res.status, 200);

  const saved = (await res.json()) as UserGame;
  assert.equal(saved.isFavorite, true);
  assert.equal(saved.status, 'PAUSED');
  assert.equal(saved.notes, 'later');
  assert.equal(saved.gameId, gameId);
  assert.notEqual(saved.updatedAt, '');
});

test('hours and score come back as numbers on the next read (single source of truth)', { skip }, async () => {
  const res = await patch('/api/me/games/doom-eternal', {
    status: 'CURRENT',
    hoursPlayed: 12.5,
    score: 90,
  });
  assert.equal(res.status, 200);

  const saved = (await res.json()) as UserGame;
  assert.equal(saved.hoursPlayed, 12.5);
  assert.equal(saved.score, 90);

  const library = (await (await get('/api/me/games')).json()) as Library;
  assert.equal(library['doom-eternal'].hoursPlayed, 12.5);
});

test('stop tracking nulls status, score and notes but keeps hours and favorite', { skip }, async () => {
  await patch('/api/me/games/doom-eternal', { isFavorite: true, hoursPlayed: 30 });

  const res = await patch('/api/me/games/doom-eternal', { status: null, score: null, notes: null });
  assert.equal(res.status, 200);

  const saved = (await res.json()) as UserGame;
  assert.equal(saved.status, null);
  assert.equal(saved.score, null);
  assert.equal(saved.notes, null);
  assert.equal(saved.hoursPlayed, 30);
  assert.equal(saved.isFavorite, true);
});

test('a game without a row starts from the user_games column defaults', { skip }, async () => {
  const gameId = 'civilization-7';
  await pool.execute('DELETE FROM user_games WHERE user_id = 1 AND game_id = ?', [gameId]);

  const res = await patch(`/api/me/games/${gameId}`, { hoursPlayed: 3 });
  assert.equal(res.status, 200);

  const saved = (await res.json()) as UserGame;
  assert.equal(saved.gameId, gameId);
  assert.equal(saved.status, null);
  assert.equal(saved.score, null);
  assert.equal(saved.isFavorite, false);
  assert.equal(saved.isInstalled, false);
  assert.equal(saved.achievementsUnlocked, 0);
  assert.equal(saved.hoursPlayed, 3);
});

test('PATCH rejects an unknown game with 404', { skip }, async () => {
  const res = await patch('/api/me/games/no-existe', { status: 'CURRENT' });
  assert.equal(res.status, 404);
  assert.match(((await res.json()) as { error: string }).error, /Game not found/);
});

test('PATCH rejects values the schema forbids with 400', { skip }, async () => {
  const score = await patch('/api/me/games/hades-2', { score: 150 });
  assert.equal(score.status, 400);

  const status = await patch('/api/me/games/hades-2', { status: 'BOGUS' });
  assert.equal(status.status, 400);

  const hours = await patch('/api/me/games/hades-2', { hoursPlayed: -1 });
  assert.equal(hours.status, 400);
});

test('unknown routes answer 404 with a JSON error', { skip }, async () => {
  const res = await get('/api/no-existe');
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Route not found' });
});

test('malformed JSON answers 400 instead of crashing the process', { skip }, async () => {
  const res = await fetch(`${base}/api/me/games/elden-ring`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Invalid JSON' });
});

test('an empty body leaves the stored row untouched', { skip }, async () => {
  const before = (await (await get('/api/me/games')).json()) as Library;

  const res = await patch('/api/me/games/elden-ring', {});
  assert.equal(res.status, 200);

  const saved = (await res.json()) as UserGame;
  assert.equal(saved.gameId, 'elden-ring');
  assert.equal(saved.hoursPlayed, before['elden-ring'].hoursPlayed);
  assert.equal(saved.status, before['elden-ring'].status);
  assert.equal(saved.score, before['elden-ring'].score);
});

test('server-owned fields in the body are ignored', { skip }, async () => {
  const res = await patch('/api/me/games/elden-ring', {
    gameId: 'hades-2',
    updatedAt: '1999-01-01T00:00:00.000Z',
    notes: 'do not change my id',
  });
  assert.equal(res.status, 200);

  const saved = (await res.json()) as UserGame;
  assert.equal(saved.gameId, 'elden-ring');
  assert.notEqual(saved.updatedAt, '1999-01-01T00:00:00.000Z');
  assert.equal(saved.notes, 'do not change my id');
});

test('PATCH rejects wrong field types with 400', { skip }, async () => {
  const cases: Record<string, unknown>[] = [
    { notes: 42 },
    { isFavorite: 'yes' },
    { lastPlayedAt: 'not-a-date' },
    { achievementsUnlocked: 1.5 },
    { status: 7 },
  ];

  for (const body of cases) {
    const res = await patch('/api/me/games/hades-2', body);
    assert.equal(res.status, 400, `should reject ${JSON.stringify(body)}`);
    assert.equal(typeof ((await res.json()) as { error: string }).error, 'string');
  }
});

test('repeating the same PATCH is idempotent for the writable fields', { skip }, async () => {
  const body = { status: 'COMPLETED', score: 88, hoursPlayed: 40.5, notes: 'finished' };

  const first = (await (await patch('/api/me/games/hades-2', body)).json()) as UserGame;
  const second = (await (await patch('/api/me/games/hades-2', body)).json()) as UserGame;

  assert.deepEqual({ ...second, updatedAt: '' }, { ...first, updatedAt: '' });
});

// Reviews ---------------------------------------------------------------------------------

test('GET /api/games/:gameId/reviews returns public reviews with the reviewer and score', { skip }, async () => {
  const res = await get('/api/games/elden-ring/reviews');
  assert.equal(res.status, 200);

  const reviews = (await res.json()) as Review[];
  assert.ok(reviews.length >= 3);

  const demo = reviews.find((review) => review.username === 'demo');
  assert.ok(demo);
  assert.equal(demo.gameId, 'elden-ring');
  assert.equal(typeof demo.userId, 'number');
  assert.equal(typeof demo.score, 'number');
  assert.equal(typeof demo.body, 'string');
  assert.equal(typeof demo.createdAt, 'string');
  assert.equal(typeof demo.updatedAt, 'string');

  const dates = reviews.map((review) => Date.parse(review.createdAt));
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
});

test('GET /api/games/:gameId/reviews answers 404 for an unknown game', { skip }, async () => {
  const res = await get('/api/games/no-existe/reviews');
  assert.equal(res.status, 404);
  assert.match(((await res.json()) as { error: string }).error, /Game not found/);
});

test('PUT /api/me/reviews/:gameId creates, then updates, the current user review', { skip }, async () => {
  const gameId = 'cyberpunk-2077';
  await pool.execute('DELETE FROM reviews WHERE user_id = 1 AND game_id = ?', [gameId]);

  const first = await put(`/api/me/reviews/${gameId}`, { body: 'A first review.' });
  assert.equal(first.status, 201);

  const created = (await first.json()) as Review;
  assert.equal(created.gameId, gameId);
  assert.equal(created.userId, 1);
  assert.equal(created.username, 'demo');
  assert.equal(created.score, 95); // comes from user_games, not from the review
  assert.equal(created.body, 'A first review.');

  const second = await put(`/api/me/reviews/${gameId}`, { body: 'An updated review.' });
  assert.equal(second.status, 200);

  const updated = (await second.json()) as Review;
  assert.equal(updated.body, 'An updated review.');
  assert.equal(updated.createdAt, created.createdAt);

  const list = (await (await get(`/api/games/${gameId}/reviews`)).json()) as Review[];
  assert.ok(list.some((review) => review.userId === 1 && review.body === 'An updated review.'));
});

test('PUT /api/me/reviews/:gameId rejects an invalid review with 400', { skip }, async () => {
  const cases: Record<string, unknown>[] = [
    {},
    { body: '' },
    { body: '   ' },
    { body: 42 },
    { body: 'x'.repeat(5001) },
  ];

  for (const body of cases) {
    const res = await put('/api/me/reviews/cyberpunk-2077', body);
    assert.equal(res.status, 400, `should reject ${JSON.stringify(body).slice(0, 40)}`);
    assert.equal(typeof ((await res.json()) as { error: string }).error, 'string');
  }
});

test('PUT /api/me/reviews/:gameId answers 409 when the game is not in the user library', { skip }, async () => {
  const account = await newAccount();

  const rejected = await put('/api/me/reviews/elden-ring', { body: 'Not mine yet.' }, account.cookie);
  assert.equal(rejected.status, 409);
  assert.match(((await rejected.json()) as { error: string }).error, /not in your library/);

  const added = await patch('/api/me/games/elden-ring', { status: 'CURRENT' }, account.cookie);
  assert.equal(added.status, 200);

  const created = await put('/api/me/reviews/elden-ring', { body: 'Now it is mine.' }, account.cookie);
  assert.equal(created.status, 201);

  const review = (await created.json()) as Review;
  assert.equal(review.userId, account.id);
  assert.equal(review.username, account.username);

  // Another user's DELETE cannot remove this review.
  const other = await newAccount();
  const notOwn = await del('/api/me/reviews/elden-ring', other.cookie);
  assert.equal(notOwn.status, 404);

  const stillThere = (await (await get('/api/games/elden-ring/reviews')).json()) as Review[];
  assert.ok(stillThere.some((candidate) => candidate.userId === account.id));
});

test('DELETE /api/me/reviews/:gameId removes only the current user review', { skip }, async () => {
  const gameId = 'cyberpunk-2077';
  await put(`/api/me/reviews/${gameId}`, { body: 'Delete me.' });

  const res = await del(`/api/me/reviews/${gameId}`);
  assert.equal(res.status, 204);

  const list = (await (await get(`/api/games/${gameId}/reviews`)).json()) as Review[];
  assert.ok(!list.some((review) => review.userId === 1));

  const again = await del(`/api/me/reviews/${gameId}`);
  assert.equal(again.status, 404);
});

// Accounts --------------------------------------------------------------------------------

test('sign-up stores a bcrypt hash and starts a session', { skip }, async () => {
  const account = await newAccount();

  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [account.id]);
  const hash = (rows as { password_hash: string }[])[0].password_hash;
  assert.match(hash, /^\$2[aby]\$/);
  assert.notEqual(hash, credential);

  const me = await get('/api/auth/me', account.cookie);
  assert.equal(me.status, 200);

  const user = (await me.json()) as AuthUser;
  assert.equal(user.id, account.id);
  assert.equal(user.username, account.username);
  assert.equal(user.email, account.email);
});

test('log-in accepts the right password and rejects the wrong one', { skip }, async () => {
  const account = await newAccount();

  const ok = await post('/api/auth/login', { email: account.email, password: credential });
  assert.equal(ok.status, 200);
  assert.match(cookieFrom(ok), /^geekbond_session=/);

  const user = (await ok.json()) as AuthUser;
  assert.equal(user.id, account.id);

  const wrong = await post('/api/auth/login', { email: account.email, password: wrongCredential });
  assert.equal(wrong.status, 401);
  assert.equal(cookieFrom(wrong), '');

  const unknown = await post('/api/auth/login', { email: 'nobody@example.com', password: credential });
  assert.equal(unknown.status, 401);
});

test('sign-up rejects invalid input with 400', { skip }, async () => {
  const cases: Record<string, unknown>[] = [
    { username: 'ab', email: 'valid@example.com', password: credential },
    { username: 'bad name', email: 'valid@example.com', password: credential },
    { username: 'valid_name', email: 'not-an-email', password: credential },
    { username: 'valid_name', email: 'valid@example.com', password: shortCredential },
    { username: 42, email: 'valid@example.com', password: credential },
  ];

  for (const body of cases) {
    const res = await post('/api/auth/signup', body);
    assert.equal(res.status, 400, `should reject ${JSON.stringify(body).slice(0, 50)}`);
    assert.equal(typeof ((await res.json()) as { error: string }).error, 'string');
  }
});

test('sign-up answers 409 for a taken username or email', { skip }, async () => {
  const account = await newAccount();

  const sameEmail = await post('/api/auth/signup', {
    username: uniqueAccount().username,
    email: account.email,
    password: credential,
  });
  assert.equal(sameEmail.status, 409);

  const sameUsername = await post('/api/auth/signup', {
    username: account.username,
    email: uniqueAccount().email,
    password: credential,
  });
  assert.equal(sameUsername.status, 409);
});

test('GET /api/auth/me without a session answers 401', { skip }, async () => {
  const res = await get('/api/auth/me');
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'Authentication required' });
});

test('log-out expires the session cookie', { skip }, async () => {
  const account = await newAccount();

  const res = await post('/api/auth/logout', undefined, account.cookie);
  assert.equal(res.status, 204);
  assert.match(cookieFrom(res), /^geekbond_session=$/);
});

test('an authenticated session sees and writes only its own library', { skip }, async () => {
  const account = await newAccount();

  const empty = (await (await get('/api/me/games', account.cookie)).json()) as Library;
  assert.deepEqual(empty, {});

  const saved = await patch(
    '/api/me/games/elden-ring',
    { status: 'COMPLETED', score: 100 },
    account.cookie
  );
  assert.equal(saved.status, 200);

  const library = (await (await get('/api/me/games', account.cookie)).json()) as Library;
  assert.equal(library['elden-ring'].status, 'COMPLETED');
  assert.equal(library['elden-ring'].score, 100);

  const demo = (await (await get('/api/me/games')).json()) as Library;
  assert.notEqual(demo['elden-ring'].score, 100);
});
