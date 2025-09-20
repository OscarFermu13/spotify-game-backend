const axios = require('axios');
const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = require('../config');
const prisma = require('../prisma/client');

async function refreshAccessToken(user) {
  if (!user?.refreshToken) return null;
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
  } catch (err) {
    console.error('refresh failed', err.response?.data || err.message);
    return null;
  }
}

async function fetchPlaylistTracksOrdered({ accessToken, playlistId, limit = 100 }) {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}`;
  const resp = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` } });
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
  return tracks;
}

module.exports = { refreshAccessToken, fetchPlaylistTracksOrdered };
