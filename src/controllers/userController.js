const axios = require('axios');
const refreshAccessTokenIfNeeded = require('../services/spotify');

// ---------- GET /api/me/playlists ----------
async function getUserPlaylists(req, res) {
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
}

// ---------- GET /api/me/token ----------
async function getAccessToken(req, res) {
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
}

module.exports = {
  getUserPlaylists,
  getAccessToken
};
