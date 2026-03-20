// src/controllers/leaderboardController.js
const prisma = require('../prisma/client');

// ── GET /api/leaderboard/global ──────────────────────────────────────────────
async function getGlobalLeaderboard(req, res) {
  try {
    const games = await prisma.game.findMany({
      where: {
        completed: true,
        totalTime: { not: null },
        tracks: { some: {} }, // al menos 1 GameTrack
      },
      include: {
        user: { select: { id: true, displayName: true, spotifyId: true } },
        session: { select: { tracks: { select: { id: true } } } },
      },
    });

    // Filtrar partidas con menos de 3 canciones y agrupar por usuario
    const byUser = {};
    for (const game of games) {
      const trackCount = game.session.tracks.length;
      if (trackCount < 3) continue;

      const uid = game.userId;
      if (!byUser[uid]) {
        byUser[uid] = {
          userId: uid,
          displayName: game.user.displayName || game.user.spotifyId,
          games: [],
        };
      }
      byUser[uid].games.push(game.totalTime);
    }

    const leaderboard = Object.values(byUser)
      .map((u) => ({
        userId: u.userId,
        displayName: u.displayName,
        gamesPlayed: u.games.length,
        bestTime: Math.min(...u.games),
        avgTime: u.games.reduce((a, b) => a + b, 0) / u.games.length,
      }))
      .sort((a, b) => a.avgTime - b.avgTime)
      .slice(0, 20);

    res.json(leaderboard);
  } catch (e) {
    console.error('getGlobalLeaderboard error:', e.message);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
}

// ── GET /api/leaderboard/session/:id ────────────────────────────────────────
async function getSessionLeaderboard(req, res) {
  try {
    const { id } = req.params;

    const session = await prisma.gameSession.findUnique({
      where: { id },
      include: { tracks: { select: { id: true } } },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const games = await prisma.game.findMany({
      where: { sessionId: id, completed: true, totalTime: { not: null } },
      include: {
        user: { select: { id: true, displayName: true, spotifyId: true } },
        tracks: true,
      },
      orderBy: { totalTime: 'asc' },
    });

    const leaderboard = games.map((g, idx) => {
      const guessed = g.tracks.filter((t) => t.guessed).length;
      return {
        rank: idx + 1,
        userId: g.userId,
        displayName: g.user.displayName || g.user.spotifyId,
        totalTime: g.totalTime,
        guessed,
        total: session.tracks.length,
        isCurrentUser: g.userId === req.user.id,
      };
    });

    res.json({
      sessionId: id,
      trackCount: session.tracks.length,
      leaderboard,
    });
  } catch (e) {
    console.error('getSessionLeaderboard error:', e.message);
    res.status(500).json({ error: 'Failed to fetch session leaderboard' });
  }
}

// ── GET /api/leaderboard/me ──────────────────────────────────────────────────
async function getPersonalLeaderboard(req, res) {
  try {
    const games = await prisma.game.findMany({
      where: { userId: req.user.id, completed: true, totalTime: { not: null } },
      include: {
        tracks: true,
        session: {
          select: {
            id: true,
            playlistUrl: true,
            tracks: { select: { id: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const history = games.map((g) => {
      const guessed = g.tracks.filter((t) => t.guessed).length;
      const total = g.session.tracks.length;
      return {
        gameId: g.id,
        sessionId: g.session.id,
        playlistUrl: g.session.playlistUrl,
        totalTime: g.totalTime,
        guessed,
        total,
        accuracy: total > 0 ? Math.round((guessed / total) * 100) : 0,
        playedAt: g.createdAt,
      };
    });

    // Stats agregadas
    const stats =
      history.length > 0
        ? {
            gamesPlayed: history.length,
            bestTime: Math.min(...history.map((g) => g.totalTime)),
            avgTime:
              history.reduce((a, g) => a + g.totalTime, 0) / history.length,
            avgAccuracy:
              Math.round(
                history.reduce((a, g) => a + g.accuracy, 0) / history.length
              ),
          }
        : null;

    res.json({ stats, history });
  } catch (e) {
    console.error('getPersonalLeaderboard error:', e.message);
    res.status(500).json({ error: 'Failed to fetch personal leaderboard' });
  }
}

module.exports = {
  getGlobalLeaderboard,
  getSessionLeaderboard,
  getPersonalLeaderboard,
};