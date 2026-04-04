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

    if (!session.isPublic) {
      const isOwner = session.ownerId === req.user.id;
      const isParticipant = await prisma.game.findFirst({
        where: { sessionId: id, userId: req.user.id },
      });
      if (!isOwner && !isParticipant) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

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
        gameId: g.id,
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
      playlistUrl: session.playlistUrl,
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
            source: true,
            dailyDate: true,
            tracks: { select: { id: true } },
            pack: { select: { name: true, slug: true } },
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
        source: g.session.source,
        dailyDate: g.session.dailyDate,
        packName: g.session.pack?.name ?? null,
        packSlug: g.session.pack?.slug ?? null, 
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

// ── GET /api/leaderboard/game/:gameId ────────────────────────────────────────
async function getGameDetail(req, res) {
  try {
    const { gameId } = req.params;
 
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        user: { select: { id: true, displayName: true, spotifyId: true } },
        session: {
          include: {
            tracks: { orderBy: { order: 'asc' } },
          },
        },
        tracks: true,
      },
    });
 
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (!game.completed) return res.status(404).json({ error: 'Game not completed yet' });
    if (!game.session.isPublic && game.userId !== req.user.id) return res.status(403).json({ error: 'Access denied' });
 
    const penalty = game.session?.penalty ?? 5;
 
    const gameTrackMap = Object.fromEntries(
      game.tracks.map((gt) => [gt.trackId, gt])
    );
 
    const tracks = game.session.tracks.map((st) => {
      const gt = gameTrackMap[st.trackId] ?? {};
      return {
        trackId:     st.trackId,
        name:        st.name,
        artists:     st.artists    ?? [],
        albumJson:   st.albumJson  ?? null,
        durationMs:  st.durationMs ?? null,
        guessed:     gt.guessed    ?? false,
        skipped:     gt.skipped    ?? false,
        timeTaken:   gt.timeTaken  ?? 0,
        // TODO: Decompose timeTaken into base + penalty + hints for display
        // timeTaken = baseTime + (penalty if wrong/skipped) + hintCost
        penaltyCost: (!gt.guessed ? penalty : 0),
      };
    });
 
    res.json({
      gameId: game.id,
      userId: game.userId,
      displayName: game.user.displayName || game.user.spotifyId,
      isCurrentUser: game.userId === req.user.id,
      totalTime: game.totalTime,
      guessed: tracks.filter((t) => t.guessed).length,
      total: tracks.length,
      accuracy: tracks.length > 0
        ? Math.round((tracks.filter((t) => t.guessed).length / tracks.length) * 100)
        : 0,
      penalty,
      tracks,
    });
  } catch (e) {
    console.error('getGameDetail error:', e.message);
    res.status(500).json({ error: 'Failed to fetch game detail' });
  }
}
 
module.exports = {
  getGlobalLeaderboard,
  getSessionLeaderboard,
  getPersonalLeaderboard,
  getGameDetail,
};