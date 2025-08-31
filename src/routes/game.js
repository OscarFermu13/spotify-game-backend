const express = require('express');
const prisma = require('../prisma/client');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// 🎯 Save game result
router.post('/game/save', authMiddleware, async (req, res) => {
  const { totalTime, tracks } = req.body;
  try {
    const game = await prisma.game.create({
      data: { userId: req.user.id, totalTime: Math.round(totalTime) }
    });

    if (Array.isArray(tracks)) {
      for (const t of tracks) {
        await prisma.gameTrack.create({
          data: {
            gameId: game.id,
            trackId: t.trackId,
            name: t.name,
            artist: t.artist,
            timeTaken: t.timeTaken ?? null,
            skipped: !!t.skipped,
            guessed: !!t.guessed
          }
        });
      }
    }

    res.json({ ok: true, gameId: game.id });
  } catch (e) {
    console.error('Error saving game:', e);
    res.status(500).json({ error: 'Could not save game' });
  }
});

module.exports = router;
