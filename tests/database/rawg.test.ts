// database/rawg.ts: mapping RAWG's API shape onto our schema, and SQL escaping. No network, no MySQL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSkipped,
  sqlString,
  toSeedAchievements,
  toSeedGame,
  toSeedSql,
  type RawgGame,
  type SeedGame,
} from '../../database/rawg.ts';

const base: RawgGame = {
  slug: 'the-game',
  name: 'The Game',
  released: '2020-05-01',
  background_image: 'https://media.rawg.io/a.jpg',
  platforms: [{ platform: { name: 'PlayStation 4' } }, { platform: { name: 'PC' } }],
  genres: [{ name: 'Action' }],
  developers: [{ name: 'Studio' }],
  publishers: [{ name: 'Publisher' }],
};

test('maps the fields our games table needs', () => {
  const game = toSeedGame(base) as SeedGame;
  assert.equal(game.id, 'the-game');
  assert.equal(game.releaseYear, 2020);
  assert.equal(game.format, 'PC');
  assert.deepEqual(game.platforms, ['PlayStation 4', 'PC']);
  assert.equal(game.bannerUrl, 'https://media.rawg.io/a.jpg', 'falls back to the cover image');
});

test('picks the preferred format and renames Xbox Series S/X to our ENUM value', () => {
  const xbox = toSeedGame({ ...base, platforms: [{ platform: { name: 'Xbox Series S/X' } }] }) as SeedGame;
  assert.equal(xbox.format, 'Xbox Series X');
  assert.deepEqual(xbox.platforms, ['Xbox Series X']);
});

test('a game with no publisher is treated as self-published', () => {
  assert.equal((toSeedGame({ ...base, publishers: [] }) as SeedGame).publisher, 'Studio');
});

test('skips games the schema cannot hold, with a reason', () => {
  const cases: [Partial<RawgGame>, RegExp][] = [
    [{ released: null }, /release/],
    [{ developers: [] }, /developer/],
    [{ platforms: [{ platform: { name: 'PlayStation 4' } }] }, /not on/],
    [{ slug: 'Bad Slug!' }, /slug/],
  ];
  for (const [patch, reason] of cases) {
    const result = toSeedGame({ ...base, ...patch });
    assert.ok(isSkipped(result), JSON.stringify(patch));
    assert.match(result.reason, reason);
  }
});

test('long descriptions are cut to fit, at a word boundary', () => {
  const game = toSeedGame({ ...base, description_raw: 'word '.repeat(1000) }) as SeedGame;
  assert.ok((game.summary ?? '').length <= 2000);
  assert.ok((game.summary ?? '').endsWith('word…'));
});

test('sqlString escapes quotes and backslashes, and maps null to NULL', () => {
  assert.equal(sqlString("Baldur's Gate"), "'Baldur''s Gate'");
  assert.equal(sqlString('C:\\games'), "'C:\\\\games'");
  assert.equal(sqlString(null), 'NULL');
});

test('the seed never contains a raw quote that could end a string early', () => {
  const sql = toSeedSql([toSeedGame({ ...base, name: "Tom Clancy's '); DROP TABLE games; --" }) as SeedGame]);
  assert.match(sql, /'Tom Clancy''s ''\); DROP TABLE games; --'/);
});

test('only RAWG genres stay genres; other labels and English tags become tags, without duplicates', () => {
  const game = toSeedGame({
    ...base,
    genres: [{ name: 'Action' }, { name: 'Souls-like' }],
    tags: [
      { name: 'Open World', language: 'eng' },
      { name: 'Action', language: 'eng' }, // already a genre
      { name: 'Открытый мир', language: 'rus' },
      { name: 'Souls-like', language: 'eng' },
      { name: 'Comma, Separated', language: 'eng' }, // would break the API's comma-joined list
    ],
  }) as SeedGame;
  assert.deepEqual(game.genres, ['Action']);
  assert.deepEqual(game.tags, ['Souls-like', 'Open World']);
});

test('slugs must be hyphen-separated words, as the games table requires', () => {
  assert.ok(isSkipped(toSeedGame({ ...base, slug: 'double--hyphen' })));
  assert.ok(isSkipped(toSeedGame({ ...base, slug: '-leading' })));
});

test('achievements are trimmed, de-duplicated by name, and keep only http(s) images', () => {
  const list = toSeedAchievements([
    { name: '  First Blood ', description: ' Win a fight. ', image: 'https://media.rawg.io/x.jpg' },
    { name: 'first blood', description: 'duplicate' },
    { name: '', description: 'no name' },
    { name: 'Secret', description: null, image: 'javascript:alert(1)' },
  ]);
  assert.deepEqual(list, [
    { name: 'First Blood', description: 'Win a fight.', imageUrl: 'https://media.rawg.io/x.jpg' },
    { name: 'Secret', description: null, imageUrl: null },
  ]);
});

test('the seed writes tags, game_tags and achievements, including for games outside the seed', () => {
  const game = { ...(toSeedGame({ ...base, tags: [{ name: 'Co-op' }] }) as SeedGame) };
  game.achievements = toSeedAchievements([{ name: "Baldur's Hero" }]);
  const sql = toSeedSql([game], [], [{ gameId: 'elden-ring', achievements: toSeedAchievements([{ name: 'Elden Lord' }]) }]);
  assert.ok(sql.includes("INSERT INTO tags (name) VALUES\n  ('Co-op')"));
  assert.ok(sql.includes('INSERT IGNORE INTO game_tags (game_id, tag_id)'));
  assert.ok(sql.includes("('the-game', 'Baldur''s Hero', NULL, NULL)"));
  assert.ok(sql.includes("('elden-ring', 'Elden Lord', NULL, NULL)"));
});
