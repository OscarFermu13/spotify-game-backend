const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { listPacks, getPack, playPack, unlockPack } = require('../controllers/packsController');

const router = express.Router();

router.get('/', authMiddleware, listPacks);
router.get('/:slug', authMiddleware, getPack);
router.post('/:slug/play', authMiddleware, playPack);
router.post('/:slug/unlock', authMiddleware, unlockPack);

module.exports = router;