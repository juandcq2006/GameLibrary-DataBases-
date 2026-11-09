import type { Review } from '../../domain/game';

/**
 * Demo reviews, keyed by game id and shaped exactly like GET /api/games/:gameId/reviews.
 * They mirror database/seeds/003_demo_reviews.sql so Juan can build the UI before the
 * API is running. The rating comes from the reviewer's user_games row.
 */
export const mockReviews: Record<string, Review[]> = {
  'elden-ring': [
    {
      gameId: 'elden-ring',
      userId: 3,
      username: 'speedrunsam',
      score: 99,
      body: 'Four hundred hours in and I still find new builds. Perfect game for replays.',
      createdAt: '2026-11-02T08:00:00.000Z',
      updatedAt: '2026-11-02T08:00:00.000Z',
    },
    {
      gameId: 'elden-ring',
      userId: 1,
      username: 'demo',
      score: 98,
      body: 'Shadow of the Erdtree is the best DLC I have played. Messmer alone is worth it.',
      createdAt: '2026-11-01T21:00:00.000Z',
      updatedAt: '2026-11-01T21:00:00.000Z',
    },
    {
      gameId: 'elden-ring',
      userId: 2,
      username: 'pixelpam',
      score: 95,
      body: 'Hard but fair. Exploring without a quest log felt great once it clicked.',
      createdAt: '2026-10-21T10:00:00.000Z',
      updatedAt: '2026-10-21T10:00:00.000Z',
    },
  ],
  'witcher-3': [
    {
      gameId: 'witcher-3',
      userId: 1,
      username: 'demo',
      score: 97,
      body: 'Still the gold standard for side quests. Blood and Wine is a whole game on its own.',
      createdAt: '2026-10-27T22:00:00.000Z',
      updatedAt: '2026-10-27T22:00:00.000Z',
    },
  ],
  'baldurs-gate-3': [
    {
      gameId: 'baldurs-gate-3',
      userId: 4,
      username: 'cozycasey',
      score: 98,
      body: 'Every choice matters. My second run felt like a different game.',
      createdAt: '2026-10-29T15:00:00.000Z',
      updatedAt: '2026-10-29T15:00:00.000Z',
    },
  ],
};
