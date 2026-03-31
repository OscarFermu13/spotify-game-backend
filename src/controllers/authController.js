const axios = require('axios');
const { makeJwt } = require('../utils/jwt');
const { encrypt } = require('../utils/tokenCrypto');
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
    'user-read-playback-state',
    'user-read-currently-playing'
  ].join(' ');

  const state = require('crypto').randomBytes(16).toString('hex');

  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 10 * 60 * 1000,
  });

  const showDialog = req.query.switch_account === 'true';

  const url =
    'https://accounts.spotify.com/authorize' +
    '?response_type=code' +
    `&client_id=${encodeURIComponent(SPOTIFY_CLIENT_ID)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(SPOTIFY_REDIRECT_URI)}` +
    `&state=${encodeURIComponent(state)}` +
    (showDialog ? '&show_dialog=true' : '');
 
  res.redirect(url);
}

// ---------- GET /auth/callback ----------
async function callback(req, res) {
  const { code, state: returnedState } = req.query;

  const storedState = req.cookies?.oauth_state;
  if (!returnedState || !storedState || returnedState !== storedState) {
    return res.status(403).send('OAuth state mismatch. Possible CSRF attack.');
  }
 
  res.clearCookie('oauth_state');
 
  if (!code) return res.status(400).send('No authorization code received');

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

    const encryptedAccessToken = encrypt(access_token);
    const encryptedRefreshToken = encrypt(refresh_token);

    const user = await prisma.user.upsert({
      where: { spotifyId },
      update: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        displayName,
      },
      create: {
        spotifyId,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        displayName,
      },
    });

    const token = makeJwt({ userId: user.id, spotifyId });

    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('jwt', token, {
      httpOnly: true,
      secure:isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    });

    res.redirect(FRONTEND_URL);
  } catch (err) {
    console.error('Auth callback error:', err.response?.data || err.message);
    res.status(500).send('Authentication error');
  }
};

module.exports = { login, callback };