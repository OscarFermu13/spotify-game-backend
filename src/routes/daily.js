const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { getDaily, generateDaily } = require('../controllers/dailyController');

const router = express.Router();

router.get('/', authMiddleware, getDaily);
router.post('/generate', generateDaily);

module.exports = router;