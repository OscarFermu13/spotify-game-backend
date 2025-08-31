const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { PORT } = require('./config');

const authRoutes = require('./routes/auth');
const playlistRoutes = require('./routes/playlist');
const gameRoutes = require('./routes/game');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));

app.use('/auth', authRoutes);
app.use('/api', playlistRoutes);
app.use('/api/game', gameRoutes);

module.exports = app;
