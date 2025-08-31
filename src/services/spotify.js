const axios = require('axios');
const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = require('../config');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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

module.exports = { refreshAccessToken };
