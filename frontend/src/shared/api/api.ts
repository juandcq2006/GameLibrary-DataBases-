import type {
  AuthUser,
  Game,
  GameFormat,
  Library,
  LoginInput,
  Review,
  SignUpInput,
  UserGame,
} from '../domain/game';

/**
 * The only module that knows where data comes from (ADR-0001).
 * Requests use relative /api URLs; Vite proxies them to the Express server in dev
 * (vite.config.ts), so the browser never needs CORS. Session cookies are same-origin.
 */

/** Turns a non-2xx response into an Error carrying the API message. */
async function errorFrom(response: Response): Promise<Error> {
  const payload: unknown = await response.json().catch(() => null);
  const message =
    typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `HTTP error ${response.status}`;
  return new Error(message);
}

/** Fetches JSON and turns a non-2xx response into an Error carrying the API message. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...init });

  if (!response.ok) throw await errorFrom(response);
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

/** Optional filters for GET /api/games. Every field is whitelisted by the API. */
export interface GameQuery {
  page?: number;
  limit?: number;
  search?: string;
  genre?: string;
  format?: GameFormat;
  releaseYear?: number;
  developer?: string;
  publisher?: string;
  minScore?: number;
  maxScore?: number;
  sort?: 'title' | 'averageScore' | 'popularity' | 'releaseYear';
  order?: 'asc' | 'desc';
}

function gamesPath(query: GameQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const search = params.toString();
  return search === '' ? '/games' : `/games?${search}`;
}

/** GET /api/games: the catalog with genres and computed stats, optionally paged/filtered. */
export async function getGames(query: GameQuery = {}): Promise<Game[]> {
  return request<Game[]>(gamesPath(query));
}

/** GET /api/me/games: the current user's user_games rows. */
export async function getLibrary(): Promise<Library> {
  return request<Library>('/me/games');
}

/**
 * PATCH /api/me/games/:gameId: merge `changes` onto the stored row (or the column defaults), return it as stored.
 * Merging on the server, not in the UI, means concurrent edits to different fields can't overwrite each other.
 */
export async function saveUserGame(gameId: string, changes: Partial<UserGame>): Promise<UserGame> {
  return request<UserGame>(`/me/games/${encodeURIComponent(gameId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(changes),
  });
}

/** GET /api/games/:gameId/reviews: everyone's public reviews of one game, newest first. */
export async function getGameReviews(gameId: string): Promise<Review[]> {
  return request<Review[]>(`/games/${encodeURIComponent(gameId)}/reviews`);
}

/** PUT /api/me/reviews/:gameId: create or replace the current user's review of a game. */
export async function saveMyReview(gameId: string, body: string): Promise<Review> {
  return request<Review>(`/me/reviews/${encodeURIComponent(gameId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

/** DELETE /api/me/reviews/:gameId: remove the current user's review of a game. */
export async function deleteMyReview(gameId: string): Promise<void> {
  await request<void>(`/me/reviews/${encodeURIComponent(gameId)}`, { method: 'DELETE' });
}

/** POST /api/auth/signup: create an account and start a session. */
export async function signUp(input: SignUpInput): Promise<AuthUser> {
  return request<AuthUser>('/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** POST /api/auth/login: start a session for an existing account. */
export async function logIn(input: LoginInput): Promise<AuthUser> {
  return request<AuthUser>('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

/** POST /api/auth/logout: end the current session. */
export async function logOut(): Promise<void> {
  await request<void>('/auth/logout', { method: 'POST' });
}

/** GET /api/auth/me: the signed-in account, or null when there is no session. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  if (response.status === 401) return null;
  if (!response.ok) throw await errorFrom(response);
  return (await response.json()) as AuthUser;
}

/** Column defaults of `user_games`, for a game the user hasn't touched yet. */
export const newUserGame = (gameId: string): UserGame => ({
  gameId,
  status: null,
  score: null,
  hoursPlayed: 0,
  isFavorite: false,
  isInstalled: false,
  achievementsUnlocked: 0,
  notes: null,
  lastPlayedAt: null,
  updatedAt: new Date().toISOString(),
});
