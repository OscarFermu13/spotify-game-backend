const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getUserPlaylists, getAccessToken } = require('../controllers/userController');

const router = express.Router();

router.get('/playlists', authMiddleware, getUserPlaylists);
router.get('/token', authMiddleware, getAccessToken);

module.exports = router;