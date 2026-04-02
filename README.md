# SpotifyQuiz - Backend Server 🎵

> This repository contains the **backend** for SpotifyQuiz, a daily music guessing game inspired by Wordle. It handles Spotify OAuth, session management, game logic, leaderboards, and the daily challenge system. The React frontend lives in a separate repository.

## 🎮 Project Overview

Players hear clips from songs and race to identify them as fast as possible. Every wrong guess or skipped track adds a time penalty. The server acts as a secure proxy between the browser and the Spotify Web API — no Spotify credentials ever reach the client.

Three play modes are supported:
- **Daily challenge** — the same 5 songs for every player worldwide, reshuffled each midnight UTC using a seeded PRNG. Results are shareable (Wordle-style emoji grid).
- **Packs** — curated thematic collections (90s Rock, Reggaeton, etc.) with a fresh random shuffle on each play.
- **Free mode** — any Spotify playlist, with a shareable session link for multiplayer.

## ⚡ Key Engineering Features

### 1. OAuth 2.0 Authorization Code Flow

Implemented strictly backend-side to protect user credentials.

- **Security:** The `CLIENT_SECRET` is never exposed to the browser. All token exchange and refresh logic happens server-side.
- **CSRF protection:** A `state` parameter is generated per login attempt and validated via a short-lived `oauth_state` HttpOnly cookie before the callback is accepted.
- **Token storage:** Access and refresh tokens are encrypted at rest using AES-256-GCM before being written to the database. The middleware decrypts them once per request into `req.user` — downstream services receive plaintext and never call `decrypt()` themselves.
- **Session via JWT:** After authentication, a signed JWT is issued as an HttpOnly cookie for stateless session management. A `POST /auth/logout` endpoint clears it server-side.

### 2. Shared Game Sessions

- **Session creation:** A user selects a playlist and track count. The server fetches, shuffles, and **freezes** the selection into a `GameSession`, so every player who joins plays the exact same songs.
- **Idempotent join:** `POST /api/session/:id/join` reuses an existing `Game` record if the user has already joined — it never creates duplicates regardless of how many times it is called.
- **Per-user tracking:** Each participant gets their own `Game` record linked to the session, storing per-track results (`guessed`, `timeTaken`).
- **Shareable link:** Each session generates a unique URL (`/session/:id`) that can be shared with other users.

### 3. Daily Challenge System

- **Deterministic shuffle:** Each day's track selection uses a seeded Fisher-Yates shuffle (Mulberry32 PRNG seeded from the date string). Every player in the world gets the same tracks in the same order.
- **On-the-fly generation:** If no session exists for today (e.g. during development), `GET /api/daily` generates one automatically. In production, a cron job calls `POST /api/daily/generate` at 23:55 UTC to pre-generate the next day's session.
- **One play per day:** The endpoint returns `alreadyCompleted: true` if the user has already finished today's session, so the frontend can block replays without a separate check.

### 4. Pack System

- **Catalogue management:** Packs are defined in the `Pack` table with fields for `tier` (`free` / `premium`), `price`, `currency`, and `isActive`. Access is tracked per user in `UserPack` with an optional `expiresAt` for time-limited access.
- **Monetisation-ready:** `POST /api/packs/:slug/unlock` accepts a `paymentToken` body parameter. The Stripe verification step is stubbed with a clear `TODO` — plugging in the real check requires one function call.
- **Fresh shuffle per play:** Unlike daily sessions, each pack play generates a new `GameSession` with a random seed so the track order is never the same twice.

### 5. Spotify API Integration

- **Proxy architecture:** The browser never calls Spotify directly. All playback commands, track searches, and playlist fetches go through `/api/spotify/*` endpoints, which add the user's token and forward the request.
- **Automatic token refresh:** If a stored access token is expired, the server transparently refreshes it using the stored refresh token, re-encrypts the new access token, and persists it before retrying.

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Database | PostgreSQL (Supabase) |
| ORM | Prisma 5 |
| Auth | OAuth 2.0 Authorization Code + JWT (HttpOnly cookie) |
| Crypto | Node `crypto` — AES-256-GCM |
| Integration | Spotify Web API + Web Playback SDK (via proxy) |

## 📡 API Endpoints

### Auth
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/auth/login` | Redirects to Spotify authorisation. `?switch_account=true` forces account picker |
| `GET` | `/auth/callback` | Exchanges code for tokens, issues JWT cookie |
| `POST` | `/auth/logout` | Clears the JWT cookie server-side |

### User
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/me` | ✅ | Authenticated user profile |
| `GET` | `/api/me/playlists` | ✅ | User's Spotify playlists |
| `GET` | `/api/me/token` | ✅ | Fresh Spotify access token for the Web Playback SDK |

### Sessions
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/session/create` | ✅ | Create a shareable custom session from a playlist |
| `GET` | `/api/session/:id` | ✅ | Session metadata and frozen track list |
| `POST` | `/api/session/:id/join` | ✅ | Join a session (idempotent) |

### Game
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/game/save` | ✅ | Persist final results. Returns 409 if already saved |

### Daily
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/daily` | ✅ | Today's session + user's game record |
| `POST` | `/api/daily/generate` | `x-cron-secret` | Pre-generate tomorrow's session (cron job) |

### Packs
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/packs` | ✅ | Pack catalogue with per-user `unlocked` status |
| `GET` | `/api/packs/:slug` | ✅ | Single pack detail |
| `POST` | `/api/packs/:slug/play` | ✅ | Start a new shuffled session from a pack |
| `POST` | `/api/packs/:slug/unlock` | ✅ | Unlock a pack (Stripe stub for premium) |

### Leaderboards
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/leaderboard/global` | ✅ | Top 20 by average time (min 3 tracks) |
| `GET` | `/api/leaderboard/session/:id` | ✅ | Full ranking for a session |
| `GET` | `/api/leaderboard/game/:gameId` | ✅ | Track-by-track breakdown for a single completed game |
| `GET` | `/api/leaderboard/me` | ✅ | Personal history and stats, segmented by source (daily / pack / custom) |

### Spotify proxy
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/spotify/search` | ✅ | Track search |
| `PUT` | `/api/spotify/play` | ✅ | Trigger playback on the SDK device |
| `PUT` | `/api/spotify/pause` | ✅ | Pause playback |

## 🗄️ Data Model

```
User ──< Game >── GameSession ──< SessionTrack
              └──────────────< GameTrack
Pack ──< GameSession
User ──< UserPack >── Pack
```

- **User** — Spotify identity + AES-256-GCM encrypted tokens
- **GameSession** — A frozen, shareable set of tracks (`source`: `daily` | `pack` | `custom`)
- **SessionTrack** — Tracks locked into a session with full metadata
- **Game** — One user's run of a session
- **GameTrack** — Per-track result (`guessed`, `skipped`, `timeTaken`)
- **Pack** — Curated collection with `tier` (`free` / `premium`), `price`, and `isActive`
- **UserPack** — Per-user access record with optional `expiresAt` for subscriptions

## 🚀 How to Run

### Prerequisites
- Node.js v18+
- A [Spotify Developer App](https://developer.spotify.com/dashboard) (Client ID + Secret)
- A PostgreSQL database

### Installation
```bash
git clone https://github.com/OscarFermu13/spotify-game-backend.git
cd spotify-game-backend
npm install
```

### Configuration

Create a `.env` file in the root:
```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:4000/auth/callback

JWT_SECRET=a_long_random_secret_string
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
TOKEN_ENCRYPTION_KEY=64_hex_characters

FRONTEND_URL=http://localhost:5173
PORT=4000

# Daily challenge
DAILY_PLAYLIST_URL=https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF
DAILY_TRACK_COUNT=5
CRON_SECRET=a_random_secret_for_the_cron_endpoint
```

### Database setup
```bash
npx prisma migrate deploy
npx prisma generate
```

### Start the server
```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

The server will be available at `http://localhost:4000`.

### Daily challenge cron

Set up a cron job to pre-generate each day's session the night before:
```bash
# 23:55 UTC daily
curl -X POST https://your-api/api/daily/generate \
  -H "x-cron-secret: $CRON_SECRET"
```