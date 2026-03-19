const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getSessionLeaderboard, getGlobalLeaderboard, getUserLeaderboard } = require('../controllers/leaderboardController');

const router = express.Router();

router.get("/session/:id", authMiddleware, getSessionLeaderboard);
router.get("/global", authMiddleware, getGlobalLeaderboard);
router.get("/user/:id", authMiddleware, getUserLeaderboard);

module.exports = router;