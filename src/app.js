const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { PORT, FRONTEND_URL } = require('./config');

const authRoutes = require('./routes/auth');
const playlistRoutes = require('./routes/playlist');
const userRoutes = require('./routes/user');
const gameRoutes = require('./routes/game');
const sessionRoutes = require('./routes/session');
const leaderboardRoutes = require('./routes/leaderboard');
const spotifyRoutes = require('./routes/spotify');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ 
    origin: FRONTEND_URL, 
    credentials: true 
}));

app.use('/auth', authRoutes);
app.use('/api/spotify', spotifyRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/me', userRoutes);
app.use('/api', playlistRoutes); 

// Manejo global de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
