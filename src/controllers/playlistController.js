const axios = require('axios');
const { refreshAccessToken } = require('../services/spotify');
const { parsePlaylistId } = require('../utils/helpers');

// ---------- GET /api/playlist ----------
async function getPlaylistTracks(req, res) {
  const { url, count = 5 } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing playlist url' });

  const playlistId = parsePlaylistId(url);
  if (!playlistId) return res.status(400).json({ error: 'Invalid playlist url' });

  let accessToken = req.user.accessToken;
  if (!accessToken) accessToken = await refreshAccessToken(req.user);

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

    const shuffled = tracks.sort(() => Math.random() - 0.5).slice(0, Number(count));

    res.json({ tracks: shuffled });
  } catch (e) {
    console.error('playlist fetch error', e.response?.data || e.message);
    res.status(500).json({ error: 'Failed to fetch playlist tracks' });
  }
}

module.exports = { getPlaylistTracks };
