// Downloads real games from the RAWG API and writes database/seeds/002_rawg_games.sql.
//
//   npm run db:import-rawg               # 100 most-added games
//   npm run db:import-rawg -- --count 250
//
// Needs RAWG_API_KEY (free at https://rawg.io/apidocs) in backend/.env or the environment.
// The key is only sent to api.rawg.io and never written to the seed file.
// RAWG's terms require crediting RAWG as the data source with a link to rawg.io.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  isSkipped,
  toSeedAchievements,
  toSeedGame,
  toSeedSql,
  type RawgAchievement,
  type RawgGame,
  type SeedAchievement,
  type SeedGame,
} from './rawg.ts';

const API = 'https://api.rawg.io/api';
const OUT = fileURLToPath(new URL('./seeds/002_rawg_games.sql', import.meta.url));

/** Achievements imported per game: RAWG's first page, most-unlocked first. */
const ACHIEVEMENTS_PER_GAME = 20;

/**
 * The demo games in 001_seed. The import leaves their catalog data alone (the demo users'
 * libraries were written against it) and only adds their achievement lists.
 */
const DEMO_SLUGS = new Set(
  [...readFileSync(fileURLToPath(new URL('./seeds/001_seed.sql', import.meta.url)), 'utf8').matchAll(
    /^\s+\('([a-z0-9-]+)', '/gm
  )].map((m) => m[1])
);

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../backend/.env', import.meta.url)));
  } catch {
    // No backend/.env: use the process environment.
  }
}

const key = process.env.RAWG_API_KEY?.trim();
if (!key) {
  console.error('RAWG_API_KEY is not set. Get a free key at https://rawg.io/apidocs and add it to backend/.env.');
  process.exit(1);
}

const countArg = process.argv.indexOf('--count');
const count = countArg === -1 ? 100 : Number(process.argv[countArg + 1]);
if (!Number.isInteger(count) || count < 1 || count > 1000) {
  console.error('--count must be a whole number between 1 and 1000');
  process.exit(1);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** GET a RAWG endpoint, retrying on rate limits and server errors. The key never reaches the logs. */
async function rawg<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries({ ...params, key: key as string })) url.searchParams.set(k, v);

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 401 || res.status === 403) throw new Error('RAWG rejected the API key (check RAWG_API_KEY)');
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    throw new Error(`RAWG ${path} answered HTTP ${res.status}`);
  }
}

// 1. Pick the games: the list endpoint, most-added first, until we have enough candidates.
// Some get skipped later (no developer, not on our platforms), so ask for 50% extra.
const wanted = Math.ceil(count * 1.5);
const candidates: { id: number; slug: string }[] = [];
for (let page = 1; candidates.length < wanted; page++) {
  const list = await rawg<{ results: { id: number; slug: string }[]; next: string | null }>('/games', {
    ordering: '-added',
    page_size: '40',
    page: String(page),
  });
  candidates.push(...list.results);
  if (list.next === null) break;
}

/** A game's first page of achievements; an empty list when RAWG has none for it. */
async function achievementsOf(idOrSlug: number | string): Promise<SeedAchievement[]> {
  try {
    const page = await rawg<{ results: RawgAchievement[] }>(`/games/${idOrSlug}/achievements`, {
      page_size: String(ACHIEVEMENTS_PER_GAME),
    });
    return toSeedAchievements(page.results ?? []).slice(0, ACHIEVEMENTS_PER_GAME);
  } catch (error) {
    if ((error as Error).message.includes('rejected the API key')) throw error;
    return []; // 404: RAWG does not know this slug or has no achievement list
  }
}

// 2. The list has no developers/publishers/description/tags, so fetch each game's details,
// then its achievements. Demo games are skipped here: 001_seed owns their catalog rows.
const games: SeedGame[] = [];
const skipped: string[] = [];
for (const { id, slug } of candidates) {
  if (games.length >= count) break;
  if (DEMO_SLUGS.has(slug)) continue;
  const mapped = toSeedGame(await rawg<RawgGame>(`/games/${id}`));
  if (isSkipped(mapped)) {
    skipped.push(`${slug}: ${mapped.reason}`);
  } else {
    await sleep(150); // be gentle with the free tier
    mapped.achievements = mapped.achievementsTotal > 0 ? await achievementsOf(id) : [];
    games.push(mapped);
  }
  process.stdout.write(`\r${games.length}/${count} games`);
  await sleep(150);
}
process.stdout.write('\n');

// 3. Achievement lists for the demo games, so the demo users can unlock achievements by name.
const demoAchievements: { gameId: string; achievements: SeedAchievement[] }[] = [];
for (const slug of DEMO_SLUGS) {
  const achievements = await achievementsOf(slug);
  if (achievements.length > 0) demoAchievements.push({ gameId: slug, achievements });
  process.stdout.write(`\rachievements for ${demoAchievements.length} demo games`);
  await sleep(150);
}
process.stdout.write('\n');

const achievementCount = [...games, ...demoAchievements].reduce((n, g) => n + g.achievements.length, 0);
writeFileSync(
  OUT,
  toSeedSql(
    games,
    [
      '002_rawg_games: real catalog data from RAWG (https://rawg.io), generated by database/import-rawg.ts.',
      'Data source: RAWG Video Games Database API. Credit RAWG with a link to https://rawg.io wherever it is shown.',
      `Generated ${new Date().toISOString().slice(0, 10)}: ${games.length} games, most-added first, ` +
        `${achievementCount} achievements (including the demo games').`,
    ],
    demoAchievements
  )
);

console.log(`Wrote ${games.length} games and ${achievementCount} achievements to database/seeds/002_rawg_games.sql`);
if (skipped.length > 0) console.log(`Skipped ${skipped.length}:\n  ${skipped.join('\n  ')}`);
console.log('Next: npm run db:seed');
