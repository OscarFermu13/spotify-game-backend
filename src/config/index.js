require('dotenv').config();

const required = [
  'SPOTIFY_CLIENT_ID',
  'SPOTIFY_CLIENT_SECRET',
  'SPOTIFY_REDIRECT_URI',
  'JWT_SECRET',
  'DATABASE_URL',
  'TOKEN_ENCRYPTION_KEY',
  'CRON_SECRET',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables:\n  ${missing.join('\n  ')}\n` +
    'Check your .env file.'
  );
}

if (process.env.TOKEN_ENCRYPTION_KEY.length !== 64) {
  throw new Error(
    'TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). ' +
    'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
}

module.exports = {
  PORT: process.env.PORT || 4000,
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI: process.env.SPOTIFY_REDIRECT_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
  DAILY_PLAYLIST_URL: process.env.DAILY_PLAYLIST_URL,
  DAILY_TRACK_COUNT: parseInt(process.env.DAILY_TRACK_COUNT, 10) || 5,
  CRON_SECRET: process.env.CRON_SECRET,
};