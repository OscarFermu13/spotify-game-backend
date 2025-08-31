const express = require('express');
const axios = require('axios');
const prisma = require('../prisma/client');
const authMiddleware = require('../middleware/authMiddleware');
const refreshAccessTokenIfNeeded = require('../services/spotify');
const parsePlaylistId = require('../utils/helpers').parsePlaylistId;

const router = express.Router();

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET
} = process.env;

// 🎵 Get playlist tracks (sampled)
router.get('/playlist', authMiddleware, async (req, res) => {
  const { url, count = 5 } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing playlist url' });

  const playlistId = parsePlaylistId(url);
  if (!playlistId) return res.status(400).json({ error: 'Invalid playlist url' });

  let accessToken = req.user.accessToken;
  if (!accessToken) accessToken = await refreshAccessTokenIfNeeded(req.user);

  try {
    const resp = await axios.get(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const items = resp.data.items || [];
    const tracks = items
      .map(i => i.track)
      .filter(Boolean)
      .map(t => ({
        id: t.id,
        name: t.name,
        artists: t.artists.map(a => a.name).join(', '),
        uri: t.uri,
        album: t.album,
        duration_ms: t.duration_ms
      }));

    // shuffle + pick count
    const shuffled = tracks.sort(() => Math.random() - 0.5).slice(0, Number(count));
    res.json({ tracks: shuffled });
  } catch (e) {
    console.error('playlist fetch error', e.response?.data || e.message);
    res.status(500).json({ error: 'Failed to fetch playlist tracks' });
  }
});

// 🎶 Get user's playlists
router.get('/me/playlists', authMiddleware, async (req, res) => {
  let accessToken = req.user.accessToken;
  if (!accessToken) accessToken = await refreshAccessTokenIfNeeded(req.user);

  try {
    const resp = await axios.get(
      `https://api.spotify.com/v1/me/playlists?limit=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    res.json({ playlists: resp.data.items || [] });
  } catch (e) {
    console.error('playlists fetch error', e.response?.data || e.message);
    res.status(500).json({ error: 'Failed to fetch user playlists' });
  }
});

// Refresh token
router.get('/me/token', authMiddleware, async (req, res) => {
  try {
    let accessToken = req.user.accessToken;
    if (!accessToken) {
      accessToken = await refreshAccessTokenIfNeeded(req.user);
    }
    res.json({ accessToken });
  } catch (e) {
    console.error('token fetch error', e.response?.data || e.message);
    res.status(500).json({ error: 'Cannot get access token' });
  }
});

module.exports = router;
