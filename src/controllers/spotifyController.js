const { refreshAccessToken } = require('../services/spotify');
const axios = require('axios');

async function getValidToken(user) {
  const token = user.accessToken || await refreshAccessToken(user);
  if (!token) throw Object.assign(new Error('No valid Spotify token'), { status: 401 });
  return token;
}

// Helper: proxy genérico que reenvía errores de Spotify con su status original
function handleSpotifyError(err, res) {
  const status = err.status || err.response?.status || 500;
  const message = err.response?.data?.error?.message || err.message || 'Spotify API error';
  return res.status(status).json({ error: message });
}

// ── GET /api/spotify/search?q=&type=track&limit=5 ────────────────────────────
async function searchSong(req, res) {
  const { q, type = 'track', limit = 5 } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query param: q' });

  try {
    const accessToken = await getValidToken(req.user);
    const response = await axios.get('https://api.spotify.com/v1/search', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { q, type, limit },
    });
    res.json(response.data);
  } catch (err) {
    handleSpotifyError(err, res);
  }
}

// ── PUT /api/spotify/play ────────────────────────────────────────────────────
async function playSong(req, res) {
  const { device_id, uris } = req.body;
  if (!device_id) return res.status(400).json({ error: 'Missing body param: device_id' });
  if (!Array.isArray(uris) || !uris.length) return res.status(400).json({ error: 'Missing body param: uris' });

  try {
    const accessToken = await getValidToken(req.user);
    await axios.put(
      `https://api.spotify.com/v1/me/player/play?device_id=${device_id}`,
      { uris },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    res.sendStatus(204);
  } catch (err) {
    handleSpotifyError(err, res);
  }
}

// ── PUT /api/spotify/pause ───────────────────────────────────────────────────
async function pauseSong(req, res) {
  try {
    const accessToken = await getValidToken(req.user);
    await axios.put(
      'https://api.spotify.com/v1/me/player/pause',
      {},
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    res.sendStatus(204);
  } catch (err) {
    handleSpotifyError(err, res);
  }
}

module.exports = { searchSong, playSong, pauseSong };