const prisma = require('../prisma/client');

// ---------- POST /api/game/save ----------
async function saveGame(req, res) {
  try {
    const { gameId, totalTime, tracks } = req.body;
    if (!gameId || typeof totalTime !== 'number' || !Array.isArray(tracks)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game || game.userId !== req.user.id) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Guardar detalle de tracks
    const toCreate = tracks.map(t => ({
      gameId,
      trackId: t.trackId,
      guessed: !!t.guessed,
      timeTaken: Number(t.timeTaken || 0)
    }));

    await prisma.$transaction([
      prisma.gameTrack.deleteMany({ where: { gameId } }),
      prisma.gameTrack.createMany({ data: toCreate }),
      prisma.game.update({
        where: { id: gameId },
        data: { totalTime: Number(totalTime), completed: true }
      })
    ]);

    res.json({ ok: true, gameId });
  } catch (e) {
    console.error('saveGame error:', e.message);
    res.status(500).json({ error: 'Could not save game' });
  }
};

module.exports = { saveGame };