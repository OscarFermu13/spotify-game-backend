const axios = require('axios');
const { refreshAccessToken } = require('../services/spotify');
const { parsePlaylistId, fisherYatesShuffle } = require('../utils/helpers');
const { sendError, ERROR_CODES } = require('../utils/errors');

// ---------- GET /api/playlist ----------
async function getPlaylistTracks(req, res) {
  const { url, count = 5 } = req.query;
  if (!url) return sendError(res, 400, ERROR_CODES.INVALID_QUERY, 'Missing playlist url');

  const playlistId = parsePlaylistId(url);
  if (!playlistId) return sendError(res, 400, ERROR_CODES.INVALID_QUERY, 'Invalid playlist url');

  let accessToken = req.user.accessToken;
  if (!accessToken) {
    accessToken = await refreshAccessToken(req.user);
    if (!accessToken) return sendError(res, 401, ERROR_CODES.UNAUTHORIZED, 'Could not refresh Spotify token');
  }

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
        duration_ms: t.duration_ms,
      }));

     const shuffled = fisherYatesShuffle(tracks).slice(0, Number(count));

    res.json({ tracks: shuffled });
  } catch (e) {
    console.error('playlist fetch error', e.response?.data || e.message);
    sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Failed to fetch playlist tracks');
  }
}

module.exports = { getPlaylistTracks };
