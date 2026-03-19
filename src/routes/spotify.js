const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { searchSong, playSong, pauseSong } = require('../controllers/spotifyController');

const router = express.Router();

router.get('/search', authMiddleware, searchSong);
router.put('/play', authMiddleware, playSong);
router.put('/pause', authMiddleware, pauseSong);

module.exports = router;