const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { createSession, getSession, joinSession } = require('../controllers/sessionController');

const router = express.Router();

router.post('/create', authMiddleware, createSession);
router.get('/:id', authMiddleware, getSession);
router.post('/:id/join', authMiddleware, joinSession);

module.exports = router;