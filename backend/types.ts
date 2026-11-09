/**
 * Wire contract shared with the frontend over HTTP only (ADR-0001).
 * These types mirror `frontend/src/shared/domain/game.ts`; the two sides never import each other.
 */

/** Mirrors the `games.format` ENUM. Order = display order. */
export const GAME_FORMATS = ['PC', 'PlayStation 5', 'Xbox Series X', 'Nintendo Switch', 'Steam Deck'] as const;
export type GameFormat = (typeof GAME_FORMATS)[number];

/** Mirrors the `user_games.status` ENUM. */
export const TRACKING_STATUSES = ['CURRENT', 'PLANNING', 'COMPLETED', 'PAUSED', 'DROPPED'] as const;
export type UserTrackingStatus = (typeof TRACKING_STATUSES)[number];

/** Catalog row: `games` + its genres + the `game_stats` view. The same for every user. */
export interface Game {
  id: string;
  title: string;
  developer: string;
  publisher: string;
  releaseYear: number;
  bannerUrl: string;
  coverUrl: string;
  storageGb: number;
  genres: string[];
  averageScore: number;
  popularity: number;
  format: GameFormat;
  achievementsTotal: number;
  summary: string;
}

/** The current user's row in `user_games`. */
export interface UserGame {
  gameId: string;
  status: UserTrackingStatus | null;
  score: number | null;
  hoursPlayed: number;
  isFavorite: boolean;
  isInstalled: boolean;
  achievementsUnlocked: number;
  notes: string | null;
  lastPlayedAt: string | null;
  updatedAt: string;
}

/** The current user's `user_games` rows, keyed by game id. */
export type Library = Record<string, UserGame>;

/** Fields a client may send on PATCH; `gameId` and `updatedAt` are server-owned. */
export type WritableUserGame = Omit<UserGame, 'gameId' | 'updatedAt'>;

/**
 * A written review. The rating is not stored here: it is the reviewer's
 * `user_games.score`, joined in so the two can never disagree.
 */
export interface Review {
  gameId: string;
  userId: number;
  username: string;
  score: number | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** The account fields safe to send to a client (never the password hash). */
export interface AuthUser {
  id: number;
  username: string;
  email: string;
}

/** Body of POST /api/auth/signup. */
export interface SignUpInput {
  username: string;
  email: string;
  password: string;
}

/** Body of POST /api/auth/login. */
export interface LoginInput {
  email: string;
  password: string;
}
