const { refreshAccessToken, fetchPlaylistTracksOrdered } = require('../services/spotify');
const { parsePlaylistId, fisherYatesShuffle } = require('../utils/helpers');
const { isValidId } = require('../utils/validate');
const { sendError, ERROR_CODES } = require('../utils/errors');
const { FRONTEND_URL } = require('../config');
const prisma = require('../prisma/client');

// ── POST /api/session/create ─────────────────────────────────────────────────
async function createSession(req, res) {
  try {
    const { playlistUrl, isPublic = true, count = 5, penalty } = req.body;
    if (!playlistUrl) return sendError(res, 400, ERROR_CODES.INVALID_PAYLOAD, 'Missing playlistUrl');


    const parsedCount = parseInt(count, 10);
    if (isNaN(parsedCount) || parsedCount < 1 || parsedCount > 50) {
      return sendError(res, 400, ERROR_CODES.INVALID_PAYLOAD, 'count must be an integer between 1 and 50');
    }

    const parsedPenalty = penalty !== undefined ? Number(penalty) : 5;
    if (isNaN(parsedPenalty) || parsedPenalty < 0 || parsedPenalty > 60) {
      return sendError(res, 400, ERROR_CODES.INVALID_PAYLOAD, 'penalty must be a number between 0 and 60');
    }

    if (typeof isPublic !== 'boolean') {
      return sendError(res, 400, ERROR_CODES.INVALID_PAYLOAD, 'isPublic must be a boolean');
    }

    let accessToken = req.user.accessToken;
    if (!accessToken) {
      accessToken = await refreshAccessToken(req.user);
      if (!accessToken) return sendError(res, 401, ERROR_CODES.NO_SPOTIFY_TOKEN, 'No valid Spotify token');
    }

    const playlistId = parsePlaylistId(playlistUrl);
    if (!playlistId) return sendError(res, 400, ERROR_CODES.INVALID_PAYLOAD, 'Invalid playlist url');

    const tracks = await fetchPlaylistTracksOrdered({ accessToken, playlistId, limit: 100 });
    if (!tracks.length) return sendError(res, 400, ERROR_CODES.INVALID_PAYLOAD, 'Playlist without tracks');

    const selected = fisherYatesShuffle([...tracks]).slice(0, parsedCount);

    const session = await prisma.gameSession.create({
      data: {
        playlistUrl,
        isPublic,
        ownerId: req.user.id,
        penalty: parsedPenalty,
        tracks: {
          create: selected.map((t, idx) => ({
            order: idx,
            trackId: t.id,
            name: t.name,
            artists: t.artists,
            uri: t.uri,
            albumJson: t.album,
            durationMs: t.duration_ms,
          })),
        },
      },
      include: { tracks: { orderBy: { order: 'asc' } } },
    });

    const shareUrl = `${FRONTEND_URL}/session/${session.id}`;
    return res.json({ sessionId: session.id, shareUrl, tracks: session.tracks });
  } catch (e) {
    console.error('createSession error:', e.response?.data || e.message);
    sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Failed to create session');
  }
}

// ── GET /api/session/:id ─────────────────────────────────────────────────────
async function getSession(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, ERROR_CODES.INVALID_ID, 'Invalid session ID');

    const session = await prisma.gameSession.findUnique({
      where: { id },
      include: { tracks: { orderBy: { order: 'asc' } }, owner: true },
    });
    if (!session) return sendError(res, 404, ERROR_CODES.NOT_FOUND, 'Session not found');

    if (!session.isPublic && session.ownerId !== req.user.id) {
      return sendError(res, 403, ERROR_CODES.ACCESS_DENIED, 'Access denied');
    }

    res.json({
      id: session.id,
      playlistUrl: session.playlistUrl,
      isPublic: session.isPublic,
      penalty: session.penalty,
      owner: { id: session.ownerId, displayName: session.owner?.displayName || null },
      tracks: session.tracks,
      source: session.source,
    });
  } catch (e) {
    console.error('getSession error:', e.message);
    sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Failed to get session');
  }
}

// ── POST /api/session/:id/join ───────────────────────────────────────────────
async function joinSession(req, res) {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return sendError(res, 400, ERROR_CODES.INVALID_ID, 'Invalid session ID');

    const session = await prisma.gameSession.findUnique({ where: { id } });
    if (!session) return sendError(res, 404, ERROR_CODES.NOT_FOUND, 'Session not found');

    let game = await prisma.game.findFirst({
      where: { sessionId: id, userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!game) {
      game = await prisma.game.create({
        data: { sessionId: id, userId: req.user.id },
      });
    }

    res.json({
      gameId: game.id,
      sessionId: session.id,
      alreadyCompleted: game.completed,
    });
  } catch (e) {
    console.error('joinSession error:', e.message);
    sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Failed to join session');
  }
}

module.exports = { createSession, getSession, joinSession };