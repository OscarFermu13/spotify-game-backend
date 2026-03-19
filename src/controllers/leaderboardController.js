const prisma = require('../prisma/client');

// ---------- GET /api/leaderboard/session/:id ----------
async function getSessionLeaderboard(req, res) {
    try {
        const { id } = req.params;
        const games = await prisma.game.findMany({
            where: { sessionId: id, completed: true },
            orderBy: { totalTime: "asc" },
            include: {
                user: {
                    select: {
                        id: true,
                        spotifyId: true,
                        displayName: true,
                    },
                },
            },
            take: 10,
        });

        res.json(games.map(g => ({
            userId: g.userId,
            displayName: g.user.displayName,
            spotifyId: g.user.spotifyId,
            totalTime: g.totalTime,
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al obtener leaderboard de sesión" });
    }
};

// ---------- GET /api/leaderboard/global ----------
async function getGlobalLeaderboard(req, res) {
    try {
        const games = await prisma.game.findMany({
            where: { completed: true },
            orderBy: { totalTime: "asc" },
            include: {
                user: {
                    select: {
                        id: true,
                        spotifyId: true,
                        displayName: true,
                    },
                },
            },
            take: 20,
        });

        res.json(games.map(g => ({
            userId: g.userId,
            displayName: g.user.displayName,
            spotifyId: g.user.spotifyId,
            totalTime: g.totalTime,
        })));
    } catch (err) {
        res.status(500).json({ error: "Error al obtener leaderboard global" });
    }
};

// ---------- GET /api/leaderboard/user/:id ----------
async function getUserLeaderboard(req, res) {
    try {
        const { id } = req.params;
        const games = await prisma.game.findMany({
            where: { userId: id, completed: true },
            orderBy: { createdAt: "desc" },
            take: 20,
        });

        res.json(games.map(g => ({
            sessionId: g.sessionId,
            totalTime: g.totalTime,
            completed: g.completed,
            createdAt: g.createdAt,
        })));
    } catch (err) {
        res.status(500).json({ error: "Error al obtener leaderboard de usuario" });
    }
};

module.exports = { getSessionLeaderboard, getGlobalLeaderboard, getUserLeaderboard };