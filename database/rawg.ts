// Turns RAWG game details (https://api.rawg.io/docs) into an idempotent seed for the 003 schema.
// Pure functions only: no network, no database. database/import-rawg.ts does the fetching.

/** The fields of RAWG's GET /api/games/{id} response that the seed uses. */
export interface RawgGame {
  slug: string;
  name: string;
  released: string | null; // 'YYYY-MM-DD'
  background_image: string | null;
  background_image_additional?: string | null;
  description_raw?: string | null;
  achievements_count?: number | null;
  platforms?: { platform: { name: string } }[] | null;
  genres?: { name: string }[] | null;
  tags?: { name: string; language?: string | null }[] | null;
  developers?: { name: string }[] | null;
  publishers?: { name: string }[] | null;
}

/** One entry of RAWG's GET /api/games/{id}/achievements response. */
export interface RawgAchievement {
  name: string;
  description?: string | null;
  image?: string | null;
}

/** RAWG's 19 genres: the only names migration 003 allows in the genres table. */
export const GENRES = new Set([
  'Action', 'Adventure', 'Arcade', 'Board Games', 'Card', 'Casual', 'Educational', 'Family', 'Fighting',
  'Indie', 'Massively Multiplayer', 'Platformer', 'Puzzle', 'Racing', 'RPG', 'Shooter', 'Simulation',
  'Sports', 'Strategy',
]);

/** Most-relevant tags first (RAWG's order); the rest are dropped. */
const MAX_TAGS = 10;

/** Values of the games.format ENUM in 001_init, in the order we prefer them. */
const FORMATS = ['PC', 'PlayStation 5', 'Xbox Series X', 'Nintendo Switch'] as const;

/** RAWG platform names that are spelled differently from our ENUM. */
const PLATFORM_ALIASES: Record<string, string> = { 'Xbox Series S/X': 'Xbox Series X' };

const LIMITS = {
  slug: 100, title: 200, company: 150, genre: 50, platform: 60, url: 500, summary: 2000,
  achievement: 200, achievementDescription: 500,
};

export interface SeedAchievement {
  name: string;
  description: string | null;
  imageUrl: string | null;
}

export interface SeedGame {
  id: string;
  title: string;
  developer: string;
  publisher: string;
  releaseYear: number;
  format: (typeof FORMATS)[number];
  coverUrl: string | null;
  bannerUrl: string | null;
  achievementsTotal: number;
  summary: string | null;
  genres: string[];
  tags: string[];
  platforms: string[];
  achievements: SeedAchievement[];
}

export type Skipped = { slug: string; reason: string };

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

// No commas: the API joins genre and tag names with commas (GROUP_CONCAT) and splits them again.
const uniqueNames = (list: { name: string }[] | null | undefined, max: number) => [
  ...new Set(
    (list ?? []).map((x) => clean(x.name)).filter((n) => n.length > 0 && n.length <= max && !n.includes(','))
  ),
];

/** Cuts long text at a word boundary so it fits the column. */
function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2))}…`;
}

const urlOrNull = (url: string | null | undefined) => {
  const u = clean(url);
  return u.length > 0 && u.length <= LIMITS.url && /^https?:\/\//.test(u) ? u : null;
};

/** Maps one RAWG game to a row our schema accepts, or explains why it can't. */
export function toSeedGame(raw: RawgGame): SeedGame | Skipped {
  const slug = clean(raw.slug);
  const skip = (reason: string): Skipped => ({ slug, reason });

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > LIMITS.slug) return skip('slug is not a short a-z0-9- id');
  const title = clean(raw.name);
  if (title.length === 0 || title.length > LIMITS.title) return skip('missing or too-long title');

  const year = Number((raw.released ?? '').slice(0, 4));
  if (!Number.isInteger(year) || year < 1950) return skip('no release date');

  const developers = uniqueNames(raw.developers, LIMITS.company);
  const publishers = uniqueNames(raw.publishers, LIMITS.company);
  if (developers.length === 0) return skip('no developer listed');

  const platforms = uniqueNames(
    (raw.platforms ?? []).map((p) => ({ name: PLATFORM_ALIASES[p.platform.name] ?? p.platform.name })),
    LIMITS.platform
  );
  const format = FORMATS.find((f) => platforms.includes(f));
  if (format === undefined) return skip(`not on ${FORMATS.join(' / ')}`);

  const summary = clean(raw.description_raw);

  // Anything RAWG lists as a genre that is not on its own genre list is treated as a tag.
  const allGenres = uniqueNames(raw.genres, LIMITS.genre);
  const genres = allGenres.filter((g) => GENRES.has(g));
  const englishTags = (raw.tags ?? []).filter((t) => !t.language || t.language === 'eng');
  const tags = [...new Set([...allGenres.filter((g) => !GENRES.has(g)), ...uniqueNames(englishTags, LIMITS.genre)])]
    .filter((t) => !GENRES.has(t))
    .slice(0, MAX_TAGS);

  return {
    id: slug,
    title,
    developer: developers[0],
    publisher: publishers[0] ?? developers[0], // self-published when RAWG lists no publisher
    releaseYear: year,
    format,
    coverUrl: urlOrNull(raw.background_image),
    bannerUrl: urlOrNull(raw.background_image_additional) ?? urlOrNull(raw.background_image),
    achievementsTotal: Math.min(Math.max(Math.trunc(raw.achievements_count ?? 0), 0), 65535),
    summary: summary.length > 0 ? shorten(summary, LIMITS.summary) : null,
    genres,
    tags,
    platforms,
    achievements: [],
  };
}

/** Maps RAWG's achievement list for one game: trimmed, unique by name, too-long names dropped. */
export function toSeedAchievements(list: RawgAchievement[]): SeedAchievement[] {
  const seen = new Set<string>();
  const out: SeedAchievement[] = [];
  for (const a of list) {
    const name = clean(a.name);
    if (name.length === 0 || name.length > LIMITS.achievement || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const description = clean(a.description);
    out.push({
      name,
      description: description.length > 0 ? shorten(description, LIMITS.achievementDescription) : null,
      imageUrl: urlOrNull(a.image),
    });
  }
  return out;
}

export const isSkipped = (x: SeedGame | Skipped): x is Skipped => 'reason' in x;

/** A MySQL string literal (default sql_mode: backslash escapes are on). */
export function sqlString(value: string | null): string {
  if (value === null) return 'NULL';
  // eslint-disable-next-line no-control-regex
  const safe = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return `'${safe.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

type Lookup = 'companies' | 'genres' | 'tags' | 'platforms';

const idOf = (table: Lookup, name: string) =>
  `(SELECT id FROM ${table} WHERE name = ${sqlString(name)})`;

const namesInsert = (table: Lookup, names: string[]) =>
  names.length === 0
    ? ''
    : `INSERT INTO ${table} (name) VALUES\n${names.map((n) => `  (${sqlString(n)})`).join(',\n')} AS new\n` +
      `  ON DUPLICATE KEY UPDATE name = new.name;\n\n`;

/**
 * The seed file: lookups first, then games, then the many-to-many links and achievements.
 * `extraAchievements` adds achievement lists for games that are already in the database
 * (the demo games from 001_seed). Safe to re-run.
 */
export function toSeedSql(
  games: SeedGame[],
  header: string[] = [],
  extraAchievements: { gameId: string; achievements: SeedAchievement[] }[] = []
): string {
  const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  const companies = sorted(games.flatMap((g) => [g.developer, g.publisher]));
  const genres = sorted(games.flatMap((g) => g.genres));
  const tags = sorted(games.flatMap((g) => g.tags));
  const platforms = sorted(games.flatMap((g) => g.platforms));

  const gameRows = games.map((g) =>
    [
      sqlString(g.id),
      sqlString(g.title),
      idOf('companies', g.developer),
      idOf('companies', g.publisher),
      String(g.releaseYear),
      sqlString(g.format),
      sqlString(g.coverUrl),
      sqlString(g.bannerUrl),
      'NULL', // storage_gb: RAWG has no install size
      String(g.achievementsTotal),
      sqlString(g.summary),
    ].join(', ')
  );

  const links = (table: 'genres' | 'tags' | 'platforms', column: string, pick: (g: SeedGame) => string[]) => {
    const rows = games.flatMap((g) => pick(g).map((name) => `  (${sqlString(g.id)}, ${idOf(table, name)})`));
    return rows.length === 0
      ? ''
      : `INSERT IGNORE INTO game_${table} (game_id, ${column}) VALUES\n${rows.join(',\n')};\n\n`;
  };

  const achievementRows = [
    ...games.map((g) => ({ gameId: g.id, achievements: g.achievements })),
    ...extraAchievements,
  ].flatMap(({ gameId, achievements }) =>
    achievements.map(
      (a) => `  (${sqlString(gameId)}, ${sqlString(a.name)}, ${sqlString(a.description)}, ${sqlString(a.imageUrl)})`
    )
  );
  const achievementsInsert =
    achievementRows.length === 0
      ? ''
      : 'INSERT INTO achievements (game_id, name, description, image_url) VALUES\n' +
        achievementRows.join(',\n') +
        ' AS new\n  ON DUPLICATE KEY UPDATE description = new.description, image_url = new.image_url;\n\n';

  return [
    ...header.map((line) => `-- ${line}`),
    '-- Apply after every migration and 001_seed. Idempotent: re-running updates the same rows.',
    '',
    'SET NAMES utf8mb4;',
    '',
    namesInsert('companies', companies) +
      namesInsert('genres', genres) +
      namesInsert('tags', tags) +
      namesInsert('platforms', platforms),
    games.length === 0
      ? ''
      : 'INSERT INTO games (id, title, developer_id, publisher_id, release_year, format, cover_url, banner_url,\n' +
        '                   storage_gb, achievements_total, summary)\nVALUES\n' +
        gameRows.map((r) => `  (${r})`).join(',\n') +
        '\nAS new\n' +
        '  ON DUPLICATE KEY UPDATE title = new.title, developer_id = new.developer_id,\n' +
        '    publisher_id = new.publisher_id, release_year = new.release_year, format = new.format,\n' +
        '    cover_url = new.cover_url, banner_url = new.banner_url,\n' +
        '    achievements_total = new.achievements_total, summary = new.summary;\n\n',
    links('genres', 'genre_id', (g) => g.genres),
    links('tags', 'tag_id', (g) => g.tags),
    links('platforms', 'platform_id', (g) => g.platforms),
    achievementsInsert,
  ].join('\n');
}
