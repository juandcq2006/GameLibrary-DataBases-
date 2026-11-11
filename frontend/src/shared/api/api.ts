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
import { mockGames } from './mocks/mockGames.ts';
import { mockLibrary } from './mocks/mockLibrary.ts';
import { mockReviews } from './mocks/mockReviews.ts';

/**
 * The only module that knows where data comes from (ADR-0001).
 * Requests use relative /api URLs; Vite proxies them to the Express server in dev
 * (vite.config.ts), so the browser never needs CORS. Session cookies are same-origin.
 *
 * When running in a browser without a live API server (e.g. static frontend deployment or
 * offline preview), falls back to an in-memory + localStorage mock store built from mocks/.
 * In Node tests (import.meta.env is undefined), always calls fetch() directly.
 */

const VITE_ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
const IS_BROWSER = typeof window !== 'undefined' && VITE_ENV !== undefined;
const FORCE_MOCKS = IS_BROWSER && VITE_ENV?.VITE_USE_MOCKS === 'true';

let mockFallbackActive = FORCE_MOCKS;

export function isUsingMockData(): boolean {
  return mockFallbackActive;
}

const DEMO_STORAGE_KEY = 'geekbond-demo-state-v1';

interface MockAccount {
  id: number;
  username: string;
  email: string;
  verifier: string;
}

interface MockState {
  currentUserId: number | null;
  nextUserId: number;
  users: MockAccount[];
  libraries: Record<number, Library>;
  reviews: Record<string, Review[]>;
}

function defaultMockState(): MockState {
  return {
    currentUserId: null,
    nextUserId: 10,
    users: [
      { id: 1, username: 'demo', email: 'demo@example.com', verifier: '' },
    ],
    libraries: {
      1: structuredClone(mockLibrary),
    },
    reviews: structuredClone(mockReviews),
  };
}

let cachedMockState: MockState | null = null;

function readMockState(): MockState {
  if (cachedMockState) return cachedMockState;
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MockState>;
        if (parsed && typeof parsed === 'object' && parsed.libraries && parsed.reviews && parsed.users) {
          cachedMockState = {
            currentUserId: parsed.currentUserId ?? null,
            nextUserId: parsed.nextUserId ?? 10,
            users: parsed.users,
            libraries: parsed.libraries,
            reviews: parsed.reviews,
          };
          return cachedMockState;
        }
      }
    } catch {
      // Ignore corrupt storage and re-seed from defaults.
    }
  }
  cachedMockState = defaultMockState();
  return cachedMockState;
}

function writeMockState(state: MockState): void {
  cachedMockState = state;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors in private browsing.
    }
  }
}

function activeMockUser(state: MockState): MockAccount {
  const id = state.currentUserId ?? 1;
  return state.users.find((u) => u.id === id) ?? state.users[0];
}

function activeMockLibrary(state: MockState): Library {
  const id = state.currentUserId ?? 1;
  if (!state.libraries[id]) state.libraries[id] = {};
  return state.libraries[id];
}

function mockGetGames(query: GameQuery = {}): Game[] {
  const state = readMockState();
  let list = [...mockGames];

  if (query.search) {
    const q = query.search.toLowerCase();
    list = list.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.developer.toLowerCase().includes(q) ||
        g.publisher.toLowerCase().includes(q)
    );
  }
  if (query.genre) {
    const target = query.genre.toLowerCase();
    list = list.filter((g) => g.genres.some((ge) => ge.toLowerCase() === target));
  }
  if (query.format) list = list.filter((g) => g.format === query.format);
  if (query.releaseYear !== undefined) list = list.filter((g) => g.releaseYear === query.releaseYear);
  if (query.developer) list = list.filter((g) => g.developer === query.developer);
  if (query.publisher) list = list.filter((g) => g.publisher === query.publisher);
  if (query.minScore !== undefined) list = list.filter((g) => g.averageScore >= query.minScore!);
  if (query.maxScore !== undefined) list = list.filter((g) => g.averageScore <= query.maxScore!);

  // Re-compute user ratings into mockGames view if current user changed scores
  const lib = activeMockLibrary(state);
  list = list.map((g) => {
    const ug = lib[g.id];
    if (ug && ug.score !== null && g.id in mockLibrary === false) {
      return { ...g, averageScore: ug.score };
    }
    return g;
  });

  const sort = query.sort ?? 'title';
  const order = query.order ?? (sort === 'title' ? 'asc' : 'desc');
  const sign = order === 'asc' ? 1 : -1;
  list.sort((a, b) => {
    if (sort === 'title') return sign * a.title.localeCompare(b.title);
    return sign * (a[sort] - b[sort]);
  });

  if (query.page !== undefined || query.limit !== undefined) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const offset = (page - 1) * limit;
    return list.slice(offset, offset + limit);
  }
  return list;
}

function mockGetLibrary(): Library {
  const state = readMockState();
  return structuredClone(activeMockLibrary(state));
}

function mockSaveUserGame(gameId: string, changes: Partial<UserGame>): UserGame {
  if (!mockGames.some((g) => g.id === gameId)) {
    throw new Error(`Game not found: ${gameId}`);
  }
  if (changes.score !== undefined && changes.score !== null) {
    if (!Number.isInteger(changes.score) || changes.score < 0 || changes.score > 100) {
      throw new Error('score must be an integer between 0 and 100, or null');
    }
  }
  if (changes.hoursPlayed !== undefined && (!Number.isFinite(changes.hoursPlayed) || changes.hoursPlayed < 0)) {
    throw new Error('hoursPlayed must be a non-negative number');
  }
  if (
    changes.achievementsUnlocked !== undefined &&
    (!Number.isInteger(changes.achievementsUnlocked) || changes.achievementsUnlocked < 0)
  ) {
    throw new Error('achievementsUnlocked must be a non-negative integer');
  }

  const state = readMockState();
  const lib = activeMockLibrary(state);
  const current = lib[gameId] ?? newUserGame(gameId);
  const updated: UserGame = {
    ...current,
    ...changes,
    gameId,
    updatedAt: new Date().toISOString(),
  };
  lib[gameId] = updated;
  writeMockState(state);
  return structuredClone(updated);
}

function mockGetGameReviews(gameId: string): Review[] {
  if (!mockGames.some((g) => g.id === gameId)) {
    throw new Error(`Game not found: ${gameId}`);
  }
  const state = readMockState();
  const list = state.reviews[gameId] ?? [];
  const activeId = state.currentUserId ?? 1;
  const activeLib = activeMockLibrary(state);

  return [...list]
    .map((r) => (r.userId === activeId ? { ...r, score: activeLib[gameId]?.score ?? null } : r))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.userId - b.userId);
}

function mockSaveMyReview(gameId: string, body: string): Review {
  if (!mockGames.some((g) => g.id === gameId)) {
    throw new Error(`Game not found: ${gameId}`);
  }
  const text = body.trim();
  const len = [...text].length;
  if (len < 1 || len > 5000) {
    throw new Error('body must be between 1 and 5000 characters');
  }

  const state = readMockState();
  const lib = activeMockLibrary(state);
  if (!lib[gameId]) {
    throw new Error(`Game is not in your library: ${gameId}`);
  }

  const user = activeMockUser(state);
  const now = new Date().toISOString();
  const existingList = state.reviews[gameId] ?? [];
  const idx = existingList.findIndex((r) => r.userId === user.id);
  const createdAt = idx >= 0 ? existingList[idx].createdAt : now;
  const saved: Review = {
    gameId,
    userId: user.id,
    username: user.username,
    score: lib[gameId].score ?? null,
    body: text,
    createdAt,
    updatedAt: now,
  };

  if (idx >= 0) {
    existingList[idx] = saved;
  } else {
    existingList.unshift(saved);
  }
  state.reviews[gameId] = existingList;
  writeMockState(state);
  return structuredClone(saved);
}

function mockDeleteMyReview(gameId: string): void {
  const state = readMockState();
  const user = activeMockUser(state);
  const existingList = state.reviews[gameId] ?? [];
  const next = existingList.filter((r) => r.userId !== user.id);
  if (next.length === existingList.length) {
    throw new Error(`Review not found: ${gameId}`);
  }
  state.reviews[gameId] = next;
  writeMockState(state);
}

function mockSignUp(input: SignUpInput): AuthUser {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  if (username.length < 3 || username.length > 50) {
    throw new Error('username must be between 3 and 50 characters');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(username)) {
    throw new Error('username may only contain letters, numbers, underscores and hyphens');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('email must look like name@example.com');
  }
  if (input.password.length < 8 || input.password.length > 72) {
    throw new Error('password must be between 8 and 72 bytes');
  }

  const state = readMockState();
  if (state.users.some((u) => u.email === email || u.username.toLowerCase() === username.toLowerCase())) {
    throw new Error('username or email is already registered');
  }

  const id = state.nextUserId++;
  const account: MockAccount = { id, username, email, verifier: input.password };
  state.users.push(account);
  state.libraries[id] = {};
  state.currentUserId = id;
  writeMockState(state);
  return { id, username, email };
}

function mockLogIn(input: LoginInput): AuthUser {
  const email = input.email.trim().toLowerCase();
  const state = readMockState();
  const account = state.users.find((u) => u.email === email);
  if (!account) {
    throw new Error('Invalid email or password');
  }
  if (account.id === 1) {
    if (input.password.length < 8) {
      throw new Error('Invalid email or password');
    }
  } else if (account.verifier !== input.password) {
    throw new Error('Invalid email or password');
  }
  state.currentUserId = account.id;
  writeMockState(state);
  return { id: account.id, username: account.username, email: account.email };
}

function mockLogOut(): void {
  const state = readMockState();
  state.currentUserId = null;
  writeMockState(state);
}

function mockGetCurrentUser(): AuthUser | null {
  const state = readMockState();
  if (state.currentUserId === null) return null;
  const user = state.users.find((u) => u.id === state.currentUserId);
  return user ? { id: user.id, username: user.username, email: user.email } : null;
}

/** Turns a non-2xx response into an Error carrying the API message. */
async function errorFrom(response: Response): Promise<Error> {
  const payload: unknown = await response.json().catch(() => null);
  const message =
    typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `HTTP error ${response.status}`;
  return new Error(message);
}

function looksLikeMissingBackend(response: Response): boolean {
  if (!IS_BROWSER) return false;
  const ct = response.headers.get('content-type') ?? '';
  if (response.status === 502 || response.status === 503 || response.status === 504) return true;
  if (response.status === 204) return false;
  // Static hosts serve HTML 200/404 and Vite proxy returns empty 500 when Express isn't running;
  // real Express responses are always application/json.
  return !ct.includes('application/json');
}

/** Fetches JSON and turns a non-2xx response into an Error carrying the API message. */
async function request<T>(path: string, init?: RequestInit, fallback?: () => T): Promise<T> {
  if (mockFallbackActive && fallback) return fallback();

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { credentials: 'same-origin', ...init });
  } catch (err) {
    if (IS_BROWSER && fallback) {
      mockFallbackActive = true;
      return fallback();
    }
    throw err;
  }

  if (looksLikeMissingBackend(response) && fallback) {
    mockFallbackActive = true;
    return fallback();
  }

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
  return request<Game[]>(gamesPath(query), undefined, () => mockGetGames(query));
}

/** GET /api/me/games: the current user's user_games rows. */
export async function getLibrary(): Promise<Library> {
  return request<Library>('/me/games', undefined, () => mockGetLibrary());
}

/**
 * PATCH /api/me/games/:gameId: merge `changes` onto the stored row (or the column defaults), return it as stored.
 * Merging on the server, not in the UI, means concurrent edits to different fields can't overwrite each other.
 */
export async function saveUserGame(gameId: string, changes: Partial<UserGame>): Promise<UserGame> {
  return request<UserGame>(
    `/me/games/${encodeURIComponent(gameId)}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(changes),
    },
    () => mockSaveUserGame(gameId, changes)
  );
}

/** GET /api/games/:gameId/reviews: everyone's public reviews of one game, newest first. */
export async function getGameReviews(gameId: string): Promise<Review[]> {
  return request<Review[]>(
    `/games/${encodeURIComponent(gameId)}/reviews`,
    undefined,
    () => mockGetGameReviews(gameId)
  );
}

/** PUT /api/me/reviews/:gameId: create or replace the current user's review of a game. */
export async function saveMyReview(gameId: string, body: string): Promise<Review> {
  return request<Review>(
    `/me/reviews/${encodeURIComponent(gameId)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    },
    () => mockSaveMyReview(gameId, body)
  );
}

/** DELETE /api/me/reviews/:gameId: remove the current user's review of a game. */
export async function deleteMyReview(gameId: string): Promise<void> {
  await request<void>(
    `/me/reviews/${encodeURIComponent(gameId)}`,
    { method: 'DELETE' },
    () => mockDeleteMyReview(gameId)
  );
}

/** POST /api/auth/signup: create an account and start a session. */
export async function signUp(input: SignUpInput): Promise<AuthUser> {
  return request<AuthUser>(
    '/auth/signup',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    () => mockSignUp(input)
  );
}

/** POST /api/auth/login: start a session for an existing account. */
export async function logIn(input: LoginInput): Promise<AuthUser> {
  return request<AuthUser>(
    '/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    () => mockLogIn(input)
  );
}

/** POST /api/auth/logout: end the current session. */
export async function logOut(): Promise<void> {
  await request<void>('/auth/logout', { method: 'POST' }, () => mockLogOut());
}

/** GET /api/auth/me: the signed-in account, or null when there is no session. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (mockFallbackActive) return mockGetCurrentUser();

  let response: Response;
  try {
    response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  } catch (err) {
    if (IS_BROWSER) {
      mockFallbackActive = true;
      return mockGetCurrentUser();
    }
    throw err;
  }

  if (looksLikeMissingBackend(response)) {
    mockFallbackActive = true;
    return mockGetCurrentUser();
  }

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
