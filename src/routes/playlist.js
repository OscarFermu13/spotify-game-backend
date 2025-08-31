const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getPlaylistTracks } = require('../controllers/playlistController');

const router = express.Router();

router.get('/playlist', authMiddleware, getPlaylistTracks);

module.exports = router;
