// src/app.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { FRONTEND_URL } = require('./config');

const authRoutes = require('./routes/auth');
const playlistRoutes = require('./routes/playlist');
const userRoutes = require('./routes/user');
const gameRoutes = require('./routes/game');
const sessionRoutes = require('./routes/session');
const leaderboardRoutes = require('./routes/leaderboard');
const spotifyRoutes = require('./routes/spotify');
const dailyRoutes = require('./routes/daily');
const packsRoutes = require('./routes/packs');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));

// ── Rate limiting ────────────────────────────────────────────────────────────

// Límite global: protege todos los endpoints de abuso genérico
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 300,
  standardHeaders: true,  // devuelve RateLimit-* headers (RFC 6585)
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Límite estricto para auth: previene fuerza bruta y abuso del flujo OAuth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

// Límite para escrituras de juego: previene spam de resultados
const gameWriteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
});

app.use(globalLimiter);

// ── Rutas ────────────────────────────────────────────────────────────────────
app.use('/auth', authLimiter, authRoutes);
app.use('/api/spotify', spotifyRoutes);
app.use('/api/daily', dailyRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/packs', packsRoutes);
app.use('/api/game', gameWriteLimiter, gameRoutes);
app.use('/api/me', userRoutes);
app.use('/api', playlistRoutes);

// ── Manejo global de errores ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;