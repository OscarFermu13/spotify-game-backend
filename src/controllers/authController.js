const axios = require('axios');
const { makeJwt } = require('../utils/jwt');
const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI, FRONTEND_URL } = require('../config');
const prisma = require('../prisma/client');

// ---------- GET /auth/login ----------
async function login(req, res) {
  const scopes = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-modify-playback-state',
    'user-read-playback-state'
  ].join(' ');
  const state = Math.random().toString(36).substring(2, 15);
  const url =
    'https://accounts.spotify.com/authorize' +
    '?response_type=code' +
    `&client_id=${encodeURIComponent(SPOTIFY_CLIENT_ID)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}` +
    `&state=${encodeURIComponent(state)}`;
  res.redirect(url);
};

// ---------- GET /auth/callback ----------
async function callback(req, res) {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code');

  try {
    const tokenResp = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        client_id: SPOTIFY_CLIENT_ID,
        client_secret: SPOTIFY_CLIENT_SECRET
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, refresh_token } = tokenResp.data;

    const me = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    const spotifyId = me.data.id;
    const displayName = me.data.display_name || null;

    const user = await prisma.user.upsert({
      where: { spotifyId },
      update: { accessToken: access_token, refreshToken: refresh_token, displayName },
      create: { spotifyId, accessToken: access_token, refreshToken: refresh_token, displayName }
    });

    const token = makeJwt({ userId: user.id, spotifyId });
    res.redirect(`${FRONTEND_URL}/?token=${token}`);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Auth error');
  }
};

module.exports = { login, callback };