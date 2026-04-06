const axios = require('axios');
const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = require('../config');
const prisma = require('../prisma/client');
const { encrypt } = require('../utils/tokenCrypto');

async function refreshAccessToken(user) {
  if (!user?.refreshToken) return null;

  try {
    const plainRefreshToken = user.refreshToken;

    const resp = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: plainRefreshToken,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = resp.data;

    await prisma.user.update({
      where: { id: user.id },
      data: { accessToken: encrypt(access_token) },
    });

    return access_token;
  } catch (err) {
    const status = err.response?.status;
    const reason = err.response?.data?.error;

    // Token revocado o expirado permanentemente — limpiar credenciales
    // para forzar re-autenticación en el siguiente request
    if (status === 400 && (reason === 'invalid_grant' || reason === 'invalid_token')) {
      console.warn(`[spotify] Refresh token revoked for user ${user.id}. Clearing credentials.`);
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: { accessToken: null, refreshToken: null },
        });
      } catch (dbErr) {
        console.error('[spotify] Failed to clear revoked tokens from DB:', dbErr.message);
      }
      return null;
    }

    // Cualquier otro error (red, 5xx de Spotify) — no limpiar, puede ser transitorio
    console.error('Token refresh failed:', err.response?.data || err.message);
    return null;
  }
}

async function fetchPlaylistTracksOrdered({ accessToken, playlistId, limit = 100 }) {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}`;
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const items = resp.data.items || [];
  return items
    .map((i) => i.track)
    .filter(Boolean)
    .map((t) => ({
      id: t.id,
      name: t.name,
      artists: t.artists.map((a) => a.name).join(', '),
      uri: t.uri,
      album: t.album,
      duration_ms: t.duration_ms,
    }));
}

module.exports = { refreshAccessToken, fetchPlaylistTracksOrdered };