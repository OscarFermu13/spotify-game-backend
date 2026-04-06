const prisma = require('../prisma/client');
const { isValidId } = require('../utils/validate');
const { sendError, ERROR_CODES } = require('../utils/errors');

// ---------- POST /api/game/save ----------
async function saveGame(req, res) {
  try {
    const { gameId, totalTime, tracks } = req.body;
    if (!gameId || typeof totalTime !== 'number' || !Array.isArray(tracks)) {
      return sendError(res, 400, ERROR_CODES.INVALID_PAYLOAD, 'Invalid payload');
    }

    if (!isValidId(gameId)) {
      return sendError(res, 400, ERROR_CODES.INVALID_ID, 'Invalid game ID');
    }

    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game || game.userId !== req.user.id) {
      return sendError(res, 404, ERROR_CODES.NOT_FOUND, 'Game not found');
    }

    if (game.completed) {
      return sendError(res, 409, ERROR_CODES.ALREADY_COMPLETED, 'Game already completed');
    }

    // Guardar detalle de tracks
    const toCreate = tracks.map(t => ({
      gameId,
      trackId: t.trackId,
      guessed: !!t.guessed,
      skipped: !!t.skipped,
      timeTaken: Number(t.timeTaken || 0),
      baseTime: Number(t.baseTime || 0),
      hintCost: Number(t.hintCost || 0),
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
    sendError(res, 500, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Could not save game');
  }
};

module.exports = { saveGame };