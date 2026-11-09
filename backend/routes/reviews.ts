// Reviews: read a game's public reviews, and write or delete your own.
// A review can only exist for a game in the reviewer's library (the schema's composite
// foreign key enforces it), and its rating is that row's user_games.score.
import { Router } from 'express';
import type { ResultSetHeader } from 'mysql2/promise';
import { currentUserId } from '../auth.ts';
import { pool } from '../db.ts';
import { HttpError } from '../http-error.ts';
import { toReview, type ReviewRow } from '../map.ts';
import type { Review } from '../types.ts';

export const reviewsRouter: Router = Router();

const SELECT_REVIEW = `
  SELECT r.game_id, r.user_id, u.username, ug.score, r.body, r.created_at, r.updated_at
    FROM reviews r
    JOIN users u      ON u.id = r.user_id
    JOIN user_games ug ON ug.user_id = r.user_id AND ug.game_id = r.game_id
   WHERE r.game_id = ? AND r.user_id = ?
`;

const SELECT_REVIEWS_OF_GAME = `
  SELECT r.game_id, r.user_id, u.username, ug.score, r.body, r.created_at, r.updated_at
    FROM reviews r
    JOIN users u      ON u.id = r.user_id
    JOIN user_games ug ON ug.user_id = r.user_id AND ug.game_id = r.game_id
   WHERE r.game_id = ?
   ORDER BY r.created_at DESC, r.user_id ASC
`;

async function assertGameExists(gameId: string): Promise<void> {
  const [rows] = await pool.query('SELECT id FROM games WHERE id = ?', [gameId]);
  if ((rows as unknown[]).length === 0) throw new HttpError(404, `Game not found: ${gameId}`);
}

function readObject(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

/** The schema allows 1 to 5000 characters after trimming; count code points, not UTF-16 units. */
function readReviewBody(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'body must be a string');
  const text = value.trim();
  const length = [...text].length;
  if (length < 1 || length > 5000) {
    throw new HttpError(400, 'body must be between 1 and 5000 characters');
  }
  return text;
}

async function selectReview(userId: number, gameId: string): Promise<Review | null> {
  const [rows] = await pool.query(SELECT_REVIEW, [gameId, userId]);
  const row = (rows as ReviewRow[])[0];
  return row === undefined ? null : toReview(row);
}

reviewsRouter.get('/games/:gameId/reviews', async (req, res) => {
  const gameId = req.params.gameId;
  await assertGameExists(gameId);

  const [rows] = await pool.query(SELECT_REVIEWS_OF_GAME, [gameId]);
  res.json((rows as ReviewRow[]).map(toReview));
});

reviewsRouter.put('/me/reviews/:gameId', async (req, res) => {
  const gameId = req.params.gameId;
  const userId = currentUserId(req);

  await assertGameExists(gameId);
  const body = readReviewBody(readObject(req.body).body);

  const [library] = await pool.query(
    'SELECT 1 FROM user_games WHERE user_id = ? AND game_id = ?',
    [userId, gameId]
  );
  if ((library as unknown[]).length === 0) {
    throw new HttpError(409, `Game is not in your library: ${gameId}`);
  }

  const [existing] = await pool.query(
    'SELECT 1 FROM reviews WHERE user_id = ? AND game_id = ?',
    [userId, gameId]
  );
  const created = (existing as unknown[]).length === 0;

  await pool.execute(
    `INSERT INTO reviews (user_id, game_id, body) VALUES (?, ?, ?) AS new
     ON DUPLICATE KEY UPDATE body = new.body`,
    [userId, gameId, body]
  );

  const review = await selectReview(userId, gameId);
  if (review === null) throw new HttpError(500, 'Review disappeared after writing it');
  res.status(created ? 201 : 200).json(review);
});

reviewsRouter.delete('/me/reviews/:gameId', async (req, res) => {
  const gameId = req.params.gameId;
  const userId = currentUserId(req);

  const [result] = await pool.execute<ResultSetHeader>(
    'DELETE FROM reviews WHERE user_id = ? AND game_id = ?',
    [userId, gameId]
  );
  if (result.affectedRows === 0) throw new HttpError(404, `Review not found: ${gameId}`);

  res.status(204).end();
});
