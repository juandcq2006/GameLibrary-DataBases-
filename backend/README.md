# backend/

The Geekbond HTTP API: Node + Express + `mysql2`, hand-written SQL (see [ADR-0001](../docs/adr/0001-database-and-data-access-layer.md)).

## Layout

```
backend/
├── index.ts        ← Express app: JSON, routes, error handler, listen()
├── db.ts           ← mysql2 pool from env vars (decimalNumbers: true, dateStrings: true)
├── auth.ts         ← bcrypt hashes + signed httpOnly session cookies
├── map.ts          ← row → wire mapping: snake_case → camelCase, 0/1 → boolean, DATETIME → ISO UTC
├── types.ts        ← the HTTP contract (mirrors frontend/src/shared/domain/game.ts)
├── http-error.ts   ← errors that carry an HTTP status
└── routes/
    ├── games.ts    ← GET /api/games (pagination, filtering, sorting)
    ├── me-games.ts ← GET /api/me/games, PATCH /api/me/games/:gameId
    ├── reviews.ts  ← GET /api/games/:gameId/reviews, PUT/DELETE /api/me/reviews/:gameId
    └── auth.ts     ← sign-up, log-in, log-out, current account
```

## Endpoints

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/games` | — | `Game[]` (genres + `game_stats` columns) |
| `GET` | `/api/me/games` | — | `{ [gameId]: UserGame }` |
| `PATCH` | `/api/me/games/:gameId` | `Partial<UserGame>` | `UserGame` as stored |
| `GET` | `/api/games/:gameId/reviews` | — | `Review[]`, newest first |
| `PUT` | `/api/me/reviews/:gameId` | `{ "body": string }` | `Review` (201 new, 200 updated) |
| `DELETE` | `/api/me/reviews/:gameId` | — | `204` |
| `POST` | `/api/auth/signup` | `{ username, email, password }` | `AuthUser`, sets session cookie |
| `POST` | `/api/auth/login` | `{ email, password }` | `AuthUser`, sets session cookie |
| `POST` | `/api/auth/logout` | — | `204`, clears the cookie |
| `GET` | `/api/auth/me` | — | `AuthUser`, or `401` |

`PATCH` merges only the fields present in the body. `gameId` and `updatedAt` are server-owned and ignored.

### Catalog query parameters

`GET /api/games` accepts `page` (1-based), `limit` (1–100, default 50), `search`, `genre`,
`format`, `releaseYear`, `developer`, `publisher`, `minScore`, `maxScore`,
`sort` (`title`, `averageScore`, `popularity`, `releaseYear`) and `order` (`asc`, `desc`).
It always returns an array and reports `X-Total-Count`, `X-Page`, `X-Page-Size` and
`X-Total-Pages`. Unknown or invalid values answer `400`.

### Reviews

A review stores only its text; its rating is the reviewer's `user_games.score`. Writing a
review for a game that is not in the user's library answers `409`; a body outside 1–5000
characters answers `400`; an unknown game answers `404`.

### Accounts

Passwords are hashed with bcrypt (bcryptjs) and never stored or returned in plain text.
A session is a signed token in an httpOnly cookie; set `AUTH_SECRET` in production so it
survives a restart. Until the frontend has a login screen, anonymous requests keep acting
as the demo user (`user_id = 1`). Set `AUTH_REQUIRE_LOGIN=true` to answer `401` instead.

Errors use one shape: `{ "error": "message" }` — `400` for values the schema rejects,
`401` when a session is required, `404` for an unknown game or review, `409` for a
duplicate account or a game outside the user's library, and `500` otherwise.

## Run

```bash
cp backend/.env.example backend/.env   # fill in the real values; backend/.env is git-ignored
npm run api                            # http://localhost:3000
npm run typecheck:backend
node --test "tests/backend/**/*.test.ts"
```

## Rules

- **One endpoint per function in `frontend/src/shared/api/api.ts`.** That file and `tests/frontend/api/` define the contract.
- **SQL only through `pool.execute()` / `pool.query()` with `?` placeholders.** Never build SQL by concatenating request values.
- **Credentials only from environment variables** (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`), loaded from a git-ignored `.env`. Commit only `.env.example` with empty secret values. `tests/security/` enforces this.
- **Never import from `frontend/`.** The two sides share only the HTTP contract. `tests/architecture/` enforces this.
- **The schema is owned by `database/migrations/`**, not by this code.
- Tests go in `tests/backend/`.
