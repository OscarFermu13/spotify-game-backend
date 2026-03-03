# Spotify Guessing Game - Backend Server 🎵

> **Note:** This repository houses the **backend logic** for the music trivia web app. It handles OAuth 2.0 authentication with Spotify, session management, and game logic. The React frontend is in a separate private repository.

## 🎮 Project Overview

A web game that challenges users to guess songs from their own Spotify playlists as quickly as possible. Players can create shareable game sessions from any playlist, and results are persisted per user. This server acts as a secure proxy between the client and the Spotify Web API.

## ⚡ Key Engineering Features

### 1. OAuth 2.0 Authorization Code Flow

Implemented strictly backend-side to protect user credentials.

- **Security:** The `CLIENT_SECRET` is never exposed to the browser. All token exchange happens server-side.
- **Token Management:** The server exchanges authorization codes for Access and Refresh Tokens, persists them in the database, and automatically refreshes expired tokens before each Spotify API call.
- **Session via JWT:** After authentication, a signed JWT is issued to the client for stateless session management across requests.

### 2. Shared Game Sessions

- **Session creation:** A user selects a playlist and a track count. The server fetches, shuffles, and **freezes** the track selection into a `GameSession`, so every player who joins plays the exact same songs.
- **Shareable link:** Each session generates a unique URL (`/session/:id`) that can be shared with other users.
- **Per-user game tracking:** Each participant gets their own `Game` record linked to the session, storing per-track results (guessed, time taken).

### 3. Spotify API Integration

- **Dynamic data fetching:** Retrieves user playlists and full track metadata (artists, album, URI, duration) in real-time.
- **Automatic token refresh:** If a stored access token is expired, the server transparently refreshes it using the stored refresh token before retrying the Spotify request.

## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| Runtime | Node.js |
| Framework | Express.js |
| Database | PostgreSQL (Supabase) |
| ORM | Prisma |
| Auth | OAuth 2.0 + JWT |
| Integration | Spotify Web API |

## 📡 API Endpoints

### Auth
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/auth/login` | Redirects user to Spotify's authorization page |
| `GET` | `/auth/callback` | Handles OAuth callback, exchanges code for tokens, issues JWT |

### User
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/me/playlists` | ✅ | Returns the authenticated user's Spotify playlists |
| `GET` | `/api/me/token` | ✅ | Returns a valid Spotify access token (refreshes if needed) |

### Playlist
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/playlist?url=&count=` | ✅ | Fetches and shuffles N tracks from a given playlist URL |

### Sessions
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/session/create` | ✅ | Creates a new shareable game session from a playlist |
| `GET` | `/api/session/:id` | ✅ | Retrieves session data and frozen track list |
| `POST` | `/api/session/:id/join` | ✅ | Joins a session and creates a personal game record |

### Game
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/game/save` | ✅ | Saves final game results (track outcomes, total time) |

## 🗄️ Data Model
```
User ──< Game >── GameSession ──< SessionTrack
              └──────────────< GameTrack
```

- **User** — Spotify identity + stored tokens
- **GameSession** — A frozen, shareable set of tracks from a playlist
- **SessionTrack** — The tracks locked into a session (order, metadata)
- **Game** — One user's run of a session
- **GameTrack** — Per-track result (guessed: bool, timeTaken: float)

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
FRONTEND_URL=http://localhost:5173
PORT=4000
```

### Database setup
```bash
npx prisma migrate deploy
```

### Start the server
```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

The server will be available at `http://localhost:4000`.

## 🔮 Future Improvements

- WebSocket support (Socket.io) for real-time multiplayer — live score updates as other players finish.
- Redis caching for frequently accessed session and playlist metadata.
- Rate limiting middleware to protect endpoints from abuse.
- Encrypted storage of Spotify tokens in the database.
