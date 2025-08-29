require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: 'http://localhost:5173', 
  credentials: true
}));

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  JWT_SECRET,
  PORT = 4000
} = process.env;

// ---------- Helpers ----------
function makeJwt(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function parsePlaylistId(url) {
  try {
    // examples:
    // https://open.spotify.com/playlist/{id}
    // spotify:playlist:{id}
    const u = url.trim();
    if (u.includes('playlist/')) {
      const parts = u.split('playlist/')[1].split('?')[0];
      return parts;
    } else if (u.startsWith('spotify:playlist:')) {
      return u.split('spotify:playlist:')[1];
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ---------- Auth routes (Spotify OAuth Authorization Code) ----------
app.get('/auth/login', (req, res) => {
  const scopes = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-modify-playback-state',
    'user-read-playback-state'
  ].join(' ');
  const state = Math.random().toString(36).substring(2, 15);
  const url =
    'https://accounts.spotify.com/authorize' +
    '?response_type=code' +
    `&client_id=${encodeURIComponent(SPOTIFY_CLIENT_ID)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}` +
    `&state=${encodeURIComponent(state)}`;
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const code = req.query.code || null;
  if (!code) return res.status(400).send('No code');

  try {
    const tokenResp = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token } = tokenResp.data;

    // get user profile
    const me = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const spotifyId = me.data.id;
    const displayName = me.data.display_name || null;

    // upsert user in db
    let user = await prisma.user.upsert({
      where: { spotifyId },
      update: {
        accessToken: access_token,
        refreshToken: refresh_token,
        displayName
      },
      create: {
        spotifyId,
        accessToken: access_token,
        refreshToken: refresh_token,
        displayName
      }
    });

    const token = makeJwt({ userId: user.id, spotifyId });

    // redirect to frontend with jwt (POC). In production usa cookie HttpOnly
    const frontUrl = `http://localhost:5173/?token=${token}`;
    res.redirect(frontUrl);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Auth error');
  }
});

// ---------- Refresh token helper ----------
async function refreshAccessTokenIfNeeded(user) {
  // Simplified: just use stored refresh token to get a new access token.
  if (!user) return null;
  try {
    const resp = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: user.refreshToken,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const { access_token } = resp.data;
    await prisma.user.update({
      where: { id: user.id },
      data: { accessToken: access_token }
    });
    return access_token;
  } catch (e) {
    console.error('refresh failed', e.response?.data || e.message);
    return null;
  }
}

// ---------- Middleware ----------
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(401).json({ error: 'Invalid user' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ---------- API: get tracks from playlist and pick random X ----------
app.get('/api/playlist', authMiddleware, async (req, res) => {
  const { url, count = 5 } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing playlist url' });
  const playlistId = parsePlaylistId(url);
  if (!playlistId) return res.status(400).json({ error: 'Invalid playlist url' });

  // ensure access token valid
  let accessToken = req.user.accessToken;
  if (!accessToken) accessToken = await refreshAccessTokenIfNeeded(req.user);

  try {
    // fetch playlist tracks (paginated) - for POC fetch first 100
    const resp = await axios.get(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const items = resp.data.items || [];
    const tracks = items
      .map(i => i.track)
      .filter(t => !!t)
      .map(t => ({
        id: t.id,
        name: t.name,
        artists: t.artists.map(a => a.name).join(', '),
        uri: t.uri,
        preview_url: t.preview_url,
        duration_ms: t.duration_ms
      }));

    // shuffle and pick X
    const shuffled = tracks.sort(() => Math.random() - 0.5).slice(0, Number(count));

    res.json({ tracks: shuffled });
  } catch (e) {
    console.error('playlist fetch error', e.response?.data || e.message);
    res.status(500).json({ error: 'Failed to fetch playlist tracks' });
  }
});

// ---------- API: refresh token if needed ----------
app.get('/api/me/token', authMiddleware, async (req, res) => {
  try {
    // refrescar si hiciera falta
    let accessToken = req.user.accessToken;
    if (!accessToken) {
      accessToken = await refreshAccessTokenIfNeeded(req.user);
    }
    res.json({ accessToken });
  } catch (e) {
    res.status(500).json({ error: 'Cannot get access token' });
  }
});

// ---------- Save game result (simple) ----------
app.post('/api/game/save', authMiddleware, async (req, res) => {
  // body: { totalTime, tracks: [{trackId,name,artist,timeTaken,skipped,guessed}] }
  const { totalTime, tracks } = req.body;
  try {
    const game = await prisma.game.create({
      data: { userId: req.user.id, totalTime: Math.round(totalTime) }
    });
    if (Array.isArray(tracks)) {
      for (const t of tracks) {
        await prisma.gameTrack.create({
          data: {
            gameId: game.id,
            trackId: t.trackId,
            name: t.name,
            artist: t.artist,
            timeTaken: t.timeTaken ? Math.round(t.timeTaken) : null,
            skipped: t.skipped ? true : false,
            guessed: t.guessed ? true : false
          }
        });
      }
    }
    res.json({ ok: true, gameId: game.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not save game' });
  }
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
