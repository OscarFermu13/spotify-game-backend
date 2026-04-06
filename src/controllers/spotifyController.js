const axios = require('axios');
const { refreshAccessToken } = require('../services/spotify');
const { isValidSearchQuery } = require('../utils/validate');
const { sendError, ERROR_CODES } = require('../utils/errors');

async function getValidToken(user) {
  const token = user.accessToken || await refreshAccessToken(user);
  if (!token) {
    const err = new Error('No valid Spotify token');
    err.status = 401;
    throw err;
  }
  return token;
}

// Helper: proxy genérico que reenvía errores de Spotify con su status original
function handleSpotifyError(err, res) {
  const status = err.status || err.response?.status || 500;
  const message = err.response?.data?.error?.message || err.message || 'Spotify API error';
  return sendError(res, status, ERROR_CODES.SPOTIFY_ERROR, message);
}

// ── GET /api/spotify/search?q=&type=track&limit=5 ────────────────────────────
async function searchSong(req, res) {
  const { q, type = 'track', limit = 5 } = req.query;
  if (!q) return sendError(res, 400, ERROR_CODES.INVALID_QUERY, 'Missing query param: q');

  if (!isValidSearchQuery(q)) {
    return sendError(res, 400, ERROR_CODES.INVALID_QUERY, 'Invalid search query: must be between 1 and 200 characters');
  }

  const ALLOWED_TYPES = ['track', 'artist', 'album', 'playlist'];
  if (!ALLOWED_TYPES.includes(type)) {
    return sendError(res, 400, ERROR_CODES.INVALID_QUERY, `Invalid type. Allowed values: ${ALLOWED_TYPES.join(', ')}`);
  }

  const parsedLimit = parseInt(limit, 10);
  if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
    return sendError(res, 400, ERROR_CODES.INVALID_QUERY, 'limit must be an integer between 1 and 50');
  }

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
  const { device_id, uris, position_ms } = req.body;
  
  if (!device_id) return sendError(res, 400, ERROR_CODES.INVALID_PAYLOAD, 'Missing body param: device_id');
  if (!Array.isArray(uris) || !uris.length) return sendError(res, 400, ERROR_CODES.INVALID_PAYLOAD, 'Missing body param: uris');

  const URI_REGEX  = /^spotify:track:[a-zA-Z0-9]{22}$/;
  const invalidUri = uris.find((u) => !URI_REGEX.test(u));
  if (invalidUri) {
    return sendError(res, 400, ERROR_CODES.INVALID_PAYLOAD, `Invalid Spotify URI: ${invalidUri}`);
  }

  try {
    const accessToken = await getValidToken(req.user);
    const body = { uris };
    if (typeof position_ms === 'number' && position_ms >= 0) {
      body.position_ms = position_ms;
    }
    await axios.put(
      `https://api.spotify.com/v1/me/player/play?device_id=${device_id}`,
      body,
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