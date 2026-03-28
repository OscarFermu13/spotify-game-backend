const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getGlobalLeaderboard, getSessionLeaderboard, getPersonalLeaderboard, getGameDetail } = require('../controllers/leaderboardController');
 
const router = express.Router();
 
router.get('/global', authMiddleware, getGlobalLeaderboard);
router.get('/session/:id', authMiddleware, getSessionLeaderboard);
router.get('/me', authMiddleware, getPersonalLeaderboard);
router.get('/game/:gameId', authMiddleware, getGameDetail);

module.exports = router;