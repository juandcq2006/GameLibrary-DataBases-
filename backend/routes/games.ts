// GET /api/games — the catalog with optional pagination, filtering and sorting.
// Every filter is whitelisted and every value travels as a `?` placeholder; only the
// ORDER BY expression is interpolated, and it comes from the SORT_COLUMNS map below.
import { Router, type Request } from 'express';
import { pool } from '../db.ts';
import { HttpError } from '../http-error.ts';
import { toGame, type GameRow } from '../map.ts';
import { GAME_FORMATS, type GameFormat } from '../types.ts';

export const gamesRouter: Router = Router();

const SELECT_COLUMNS = `
         g.id,
         g.title,
         g.developer,
         g.publisher,
         g.release_year,
         g.format,
         COALESCE(g.cover_url, '')  AS cover_url,
         COALESCE(g.banner_url, '') AS banner_url,
         COALESCE(g.storage_gb, 0)  AS storage_gb,
         g.achievements_total,
         COALESCE(g.summary, '')    AS summary,
         (SELECT GROUP_CONCAT(ge.name ORDER BY ge.name SEPARATOR ',')
            FROM game_genres gg
            JOIN genres ge ON ge.id = gg.genre_id
           WHERE gg.game_id = g.id) AS genres,
         COALESCE(s.average_score, 0) AS average_score,
         COALESCE(s.popularity, 0)    AS popularity
`;

const FROM = `
    FROM game_catalog g
    LEFT JOIN game_stats s ON s.game_id = g.id
`;

const SORT_COLUMNS = {
  title: 'g.title',
  averageScore: 'COALESCE(s.average_score, 0)',
  popularity: 'COALESCE(s.popularity, 0)',
  releaseYear: 'g.release_year',
} as const;

type SortField = keyof typeof SORT_COLUMNS;
type SqlValue = string | number;

function readString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be a single value`);
  const text = value.trim();
  return text === '' ? undefined : text;
}

function readInteger(value: unknown, name: string, min: number, max: number): number | undefined {
  const text = readString(value, name);
  if (text === undefined) return undefined;
  if (!/^\d+$/.test(text)) throw new HttpError(400, `${name} must be an integer between ${min} and ${max}`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(400, `${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function readFormat(value: unknown): GameFormat | undefined {
  const text = readString(value, 'format');
  if (text === undefined) return undefined;
  if (!(GAME_FORMATS as readonly string[]).includes(text)) {
    throw new HttpError(400, `format must be one of ${GAME_FORMATS.join(', ')}`);
  }
  return text as GameFormat;
}

function readSort(value: unknown): SortField {
  const text = readString(value, 'sort') ?? 'title';
  if (!(text in SORT_COLUMNS)) {
    throw new HttpError(400, `sort must be one of ${Object.keys(SORT_COLUMNS).join(', ')}`);
  }
  return text as SortField;
}

function readOrder(value: unknown, sort: SortField): 'asc' | 'desc' {
  const text = readString(value, 'order');
  if (text === undefined) return sort === 'title' ? 'asc' : 'desc';
  if (text !== 'asc' && text !== 'desc') throw new HttpError(400, 'order must be asc or desc');
  return text;
}

/** The WHERE clauses and their placeholder values, in the same order. */
function buildFilters(req: Request): { where: string[]; values: SqlValue[] } {
  const where: string[] = [];
  const values: SqlValue[] = [];

  const search = readString(req.query.search, 'search');
  if (search !== undefined) {
    // Escape LIKE wildcards so a search for "50%" matches the literal text.
    const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    where.push('(g.title LIKE ? OR g.developer LIKE ? OR g.publisher LIKE ?)');
    values.push(like, like, like);
  }

  const genre = readString(req.query.genre, 'genre');
  if (genre !== undefined) {
    where.push(`EXISTS (
      SELECT 1 FROM game_genres gg
        JOIN genres ge ON ge.id = gg.genre_id
       WHERE gg.game_id = g.id AND ge.name = ?
    )`);
    values.push(genre);
  }

  const format = readFormat(req.query.format);
  if (format !== undefined) {
    where.push('g.format = ?');
    values.push(format);
  }

  const releaseYear = readInteger(req.query.releaseYear, 'releaseYear', 1900, 2100);
  if (releaseYear !== undefined) {
    where.push('g.release_year = ?');
    values.push(releaseYear);
  }

  const developer = readString(req.query.developer, 'developer');
  if (developer !== undefined) {
    where.push('g.developer = ?');
    values.push(developer);
  }

  const publisher = readString(req.query.publisher, 'publisher');
  if (publisher !== undefined) {
    where.push('g.publisher = ?');
    values.push(publisher);
  }

  const minScore = readInteger(req.query.minScore, 'minScore', 0, 100);
  if (minScore !== undefined) {
    where.push('COALESCE(s.average_score, 0) >= ?');
    values.push(minScore);
  }

  const maxScore = readInteger(req.query.maxScore, 'maxScore', 0, 100);
  if (maxScore !== undefined) {
    where.push('COALESCE(s.average_score, 0) <= ?');
    values.push(maxScore);
  }

  return { where, values };
}

gamesRouter.get('/games', async (req, res) => {
  const page = readInteger(req.query.page, 'page', 1, 1_000_000) ?? 1;
  const limit = readInteger(req.query.limit, 'limit', 1, 100) ?? 50;
  const sort = readSort(req.query.sort);
  const order = readOrder(req.query.order, sort);
  const { where, values } = buildFilters(req);

  const whereSql = where.length === 0 ? '' : `WHERE ${where.join(' AND ')}`;
  const orderSql = `ORDER BY ${SORT_COLUMNS[sort]} ${order.toUpperCase()}, g.id ASC`;

  const [countRows] = await pool.query(`SELECT COUNT(*) AS total ${FROM} ${whereSql}`, values);
  const total = Number((countRows as { total: number }[])[0]?.total ?? 0);

  const offset = (page - 1) * limit;
  const [rows] = await pool.query(
    `SELECT ${SELECT_COLUMNS} ${FROM} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  res.set('X-Total-Count', String(total));
  res.set('X-Page', String(page));
  res.set('X-Page-Size', String(limit));
  res.set('X-Total-Pages', String(Math.ceil(total / limit)));
  res.json((rows as GameRow[]).map(toGame));
});
