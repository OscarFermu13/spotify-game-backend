const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getGlobalLeaderboard, getSessionLeaderboard, getPersonalLeaderboard } = require('../controllers/leaderboardController');
 
const router = express.Router();
 
router.get('/global', authMiddleware, getGlobalLeaderboard);
router.get('/session/:id', authMiddleware, getSessionLeaderboard);
router.get('/me', authMiddleware, getPersonalLeaderboard);

module.exports = router;