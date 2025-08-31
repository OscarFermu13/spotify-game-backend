const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { saveGame } = require('../controllers/gameController');

const router = express.Router();

router.post('/save', authMiddleware, saveGame);

module.exports = router;