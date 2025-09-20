const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { PORT } = require('./config');

const authRoutes = require('./routes/auth');
const playlistRoutes = require('./routes/playlist');
const userRoutes = require('./routes/user');
const gameRoutes = require('./routes/game');
const sessionRoutes = require('./routes/session');


const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors({ 
    origin: 'http://localhost:5173', 
    credentials: true 
}));

app.use('/auth', authRoutes);
app.use('/api', playlistRoutes);
app.use('/api/me', userRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/session', sessionRoutes);

module.exports = app;
