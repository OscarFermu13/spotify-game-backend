const axios = require('axios');
const { refreshAccessToken } = require('../services/spotify');
const { sendError, ERROR_CODES } = require('../utils/errors');

// ── GET /api/me ──────────────────────────────────────────────────────────────
async function getMe(req, res) {
  res.json({
    id: req.user.id,
    displayName: req.user.displayName || null,
    spotifyId: req.user.spotifyId,
  });
}

// ---------- GET /api/me/playlists ----------
async function getUserPlaylists(req, res) {
  let accessToken = req.user.accessToken;
  if (!accessToken) accessToken = await refreshAccessToken(req.user);

  try {
    const resp = await axios.get(
      `https://api.spotify.com/v1/me/playlists?limit=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    res.json({ playlists: resp.data.items || [] });
  } catch (e) {
    console.error('playlists fetch error', e.response?.data || e.message);
    sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Failed to fetch user playlists');
  }
}

// ---------- GET /api/me/token ----------
async function getAccessToken(req, res) {
  try {
    let accessToken = req.user.accessToken;
    if (!accessToken) {
      accessToken = await refreshAccessToken(req.user);
    }
    if (!accessToken) {
      sendError(res, 500, ERROR_CODES.CONFIG_ERROR, 'Could not obtain access token');
    }
    res.json({ accessToken });
  } catch (e) {
    console.error('token fetch error', e.response?.data || e.message);
    sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Failed to fetch access token');
  }
}

module.exports = {
  getMe,
  getUserPlaylists,
  getAccessToken
};
