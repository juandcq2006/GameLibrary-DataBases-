// Migration 003: CHECK constraints, tags, achievements and the activity-history triggers, on a
// throwaway MySQL database with every migration and seed applied. Same connection settings and
// skip rule as schema.test.ts.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'database');
const { DB_HOST = 'localhost', DB_PORT = '3306', DB_USER = 'root', DB_PASSWORD = '' } = process.env;
const env = { ...process.env, MYSQL_PWD: DB_PASSWORD };
const DB = `geekbond_test_integrity_${process.pid}_${Date.now()}`;

const sql = (query: string, database: string | null = DB) =>
  execFileSync(
    'mysql',
    [
      '-h', DB_HOST, '-P', DB_PORT, '-u', DB_USER, '--batch', '--skip-column-names',
      '--default-character-set=utf8mb4', ...(database ? [database] : []),
    ],
    { env, input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim().replace(/\r\n/g, '\n');

const rejects = (query: string, message: RegExp) =>
  assert.throws(() => sql(query), (e: { stderr?: string }) => message.test(e.stderr ?? ''));

const files = (dir: string) =>
  readdirSync(join(databaseDir, dir)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();

/** The newest activity rows for one user and game, oldest first, as "TYPE old→new". */
const history = (userId: number, gameId: string, last = 10) =>
  sql(`SELECT CONCAT(type, ' ', COALESCE(old_value, '-'), '→', COALESCE(new_value, '-'))
         FROM (SELECT * FROM activity WHERE user_id = ${userId} AND game_id = '${gameId}'
                ORDER BY id DESC LIMIT ${last}) AS recent
        ORDER BY id`).split('\n').filter(Boolean);

let skip: string | false = false;
try {
  sql('SELECT 1', null);
} catch {
  skip = `MySQL not reachable at ${DB_USER}@${DB_HOST}:${DB_PORT}`;
}

before(() => {
  if (skip) return;
  sql(`CREATE DATABASE \`${DB}\``, null);
  for (const file of files('migrations')) sql(readFileSync(join(databaseDir, 'migrations', file), 'utf8'));
  for (const file of files('seeds')) sql(readFileSync(join(databaseDir, 'seeds', file), 'utf8'));
  // A game of our own with a known achievement list, independent of the RAWG seed.
  sql(`
    INSERT INTO games (id, title, developer_id, publisher_id, release_year, format, achievements_total)
    VALUES ('test-game', 'Test Game', 1, 1, 2024, 'PC', 10);
    INSERT INTO achievements (game_id, name) VALUES ('test-game', 'First'), ('test-game', 'Second'), ('test-game', 'Third');
  `);
});

after(() => {
  if (!skip) sql(`DROP DATABASE IF EXISTS \`${DB}\``, null);
});

test('CHECK constraints reject bad catalog data', { skip }, () => {
  const game = (id: string, extra = '', values = '') =>
    `INSERT INTO games (id, title, developer_id, publisher_id, release_year, format${extra})
     VALUES ('${id}', 'T', 1, 1, 2020, 'PC'${values})`;
  rejects(game('Bad Slug'), /chk_games_id/);
  rejects(game('UPPER-case'), /chk_games_id/);
  rejects(game('ok-slug', '', '').replace('2020', '1800'), /chk_games_release_year/);
  rejects(game('ok-slug', ', storage_gb', ', 0'), /chk_games_storage/);
  rejects(game('ok-slug', ', cover_url', ", 'ftp://example.com/a.png'"), /chk_games_cover_url/);
  rejects(`INSERT INTO companies (name) VALUES ('   ')`, /chk_companies_name/);
  rejects(`INSERT INTO platforms (name) VALUES ('')`, /chk_platforms_name/);
});

test('CHECK constraints reject bad accounts: usernames like sign-up, and only bcrypt hashes', { skip }, () => {
  rejects(`INSERT INTO users (username) VALUES ('no spaces allowed')`, /chk_users_username/);
  rejects(`INSERT INTO users (username) VALUES ('ab')`, /chk_users_username/);
  rejects(`INSERT INTO users (username, password_hash) VALUES ('plainuser', 'hunter2hunter2')`, /chk_users_password_hash/);
  const bcrypt = '$2b$10$' + 'a'.repeat(53);
  sql(`INSERT INTO users (username, password_hash) VALUES ('hashed_user', '${bcrypt}')`);
  assert.equal(sql(`SELECT COUNT(*) FROM users WHERE username = 'hashed_user'`), '1');
});

test('genres are only RAWG genres; finer labels live in tags', { skip }, () => {
  rejects(`INSERT INTO genres (name) VALUES ('Open World')`, /chk_genres_name/);
  assert.equal(
    sql(`SELECT GROUP_CONCAT(ge.name ORDER BY ge.name) FROM game_genres gg JOIN genres ge ON ge.id = gg.genre_id WHERE gg.game_id = 'elden-ring'`),
    'Action,RPG'
  );
  const tags = sql(`SELECT GROUP_CONCAT(t.name ORDER BY t.name) FROM game_tags gt JOIN tags t ON t.id = gt.tag_id WHERE gt.game_id = 'elden-ring'`);
  assert.match(tags, /Souls-like/);
  assert.match(tags, /Open World/);
  assert.equal(sql('SELECT COUNT(*) FROM genres ge JOIN tags t ON t.name = ge.name'), '0', 'no name is both');
});

test('unlocked achievements can never exceed the game\'s total', { skip }, () => {
  // elden-ring has 42 achievements; the demo user has unlocked 42.
  rejects(`UPDATE user_games SET achievements_unlocked = 43 WHERE user_id = 1 AND game_id = 'elden-ring'`, /ERROR 3819.*cannot be more/);
  rejects(`INSERT INTO user_games (user_id, game_id, achievements_unlocked) VALUES (4, 'elden-ring', 50)`, /ERROR 3819/);
});

test('lowering a game\'s total lowers players above it, and logs the change', { skip }, () => {
  sql(`INSERT INTO user_games (user_id, game_id, status, achievements_unlocked) VALUES (1, 'test-game', 'CURRENT', 8)`);
  sql(`UPDATE games SET achievements_total = 5 WHERE id = 'test-game'`);
  assert.equal(sql(`SELECT achievements_unlocked FROM user_games WHERE user_id = 1 AND game_id = 'test-game'`), '5');
  assert.deepEqual(history(1, 'test-game'), ['ADDED -→CURRENT', 'ACHIEVEMENTS 8→5']);
});

test('achievements can only be unlocked for a game in the library, and raise the counter', { skip }, () => {
  const ids = sql(`SELECT id FROM achievements WHERE game_id = 'test-game' ORDER BY id`).split('\n');
  // user 3 does not have test-game yet
  rejects(`INSERT INTO user_achievements (user_id, achievement_id) VALUES (3, ${ids[0]})`, /ERROR 1452.*not in the user's library/);

  sql(`INSERT INTO user_games (user_id, game_id, status) VALUES (3, 'test-game', 'CURRENT')`);
  sql(`INSERT INTO user_achievements (user_id, achievement_id) VALUES (3, ${ids[0]}), (3, ${ids[1]})`);
  assert.equal(sql(`SELECT achievements_unlocked FROM user_games WHERE user_id = 3 AND game_id = 'test-game'`), '2');
  assert.deepEqual(history(3, 'test-game'), ['ADDED -→CURRENT', 'ACHIEVEMENTS 0→1', 'ACHIEVEMENTS 1→2']);

  // The counter cannot drop below what is unlocked by name.
  rejects(`UPDATE user_games SET achievements_unlocked = 1 WHERE user_id = 3 AND game_id = 'test-game'`, /cannot be less/);
});

test('every library change is written to activity, and a no-op update writes nothing', { skip }, () => {
  sql(`UPDATE user_games SET status = 'COMPLETED', score = 90, hours_played = 12.5, is_favorite = TRUE
        WHERE user_id = 3 AND game_id = 'test-game'`);
  assert.deepEqual(history(3, 'test-game', 4), [
    'STATUS CURRENT→COMPLETED',
    'SCORE -→90',
    'HOURS 0.0→12.5',
    'FAVORITE false→true',
  ]);
  const before = sql('SELECT COUNT(*) FROM activity');
  sql(`UPDATE user_games SET status = 'COMPLETED' WHERE user_id = 3 AND game_id = 'test-game'`);
  assert.equal(sql('SELECT COUNT(*) FROM activity'), before);
});

test('reviews are logged, and removing a game logs it and forgets its unlocked achievements', { skip }, () => {
  sql(`INSERT INTO reviews (user_id, game_id, body) VALUES (3, 'test-game', 'Short and good.')`);
  sql(`UPDATE reviews SET body = 'Short and very good.' WHERE user_id = 3 AND game_id = 'test-game'`);
  assert.deepEqual(history(3, 'test-game', 2), ['REVIEW -→posted', 'REVIEW -→edited']);

  sql(`DELETE FROM user_games WHERE user_id = 3 AND game_id = 'test-game'`);
  assert.deepEqual(history(3, 'test-game', 1), ['REMOVED COMPLETED→-']);
  assert.equal(
    sql(`SELECT COUNT(*) FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id
          WHERE ua.user_id = 3 AND a.game_id = 'test-game'`),
    '0'
  );
  // The history itself stays: it is a log, not part of the library.
  assert.ok(Number(sql(`SELECT COUNT(*) FROM activity WHERE user_id = 3 AND game_id = 'test-game'`)) >= 8);
});

test('deleting a user removes their history and unlocked achievements', { skip }, () => {
  sql(`INSERT INTO users (id, username) VALUES (99, 'temp_user');
       INSERT INTO user_games (user_id, game_id) VALUES (99, 'test-game');
       INSERT INTO user_achievements (user_id, achievement_id)
       SELECT 99, id FROM achievements WHERE game_id = 'test-game' LIMIT 1;`);
  sql('DELETE FROM users WHERE id = 99');
  assert.equal(sql('SELECT (SELECT COUNT(*) FROM activity WHERE user_id = 99) + (SELECT COUNT(*) FROM user_achievements WHERE user_id = 99)'), '0');
});
