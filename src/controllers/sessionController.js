const { refreshAccessToken, fetchPlaylistTracksOrdered } = require('../services/spotify');
const { parsePlaylistId } = require('../utils/helpers');
const prisma = require('../prisma/client');

// ---------- POST /api/session/create ----------
async function createSession(req, res) {
    try {
        const { playlistUrl, isPublic = true, count = 5 } = req.body;
        if (!playlistUrl) return res.status(400).json({ error: 'Missing playlistUrl' });

        // Access token válido del usuario creador
        let accessToken = req.user.accessToken || await refreshAccessToken(req.user);
        if (!accessToken) return res.status(401).json({ error: 'No valid Spotify token' });

        const playlistId = parsePlaylistId(playlistUrl);
        if (!playlistId) return res.status(400).json({ error: 'Invalid playlist url' });

        const tracks = await fetchPlaylistTracksOrdered({ accessToken, playlistId, limit: 100 });
        if (!tracks.length) return res.status(400).json({ error: 'Playlist without tracks' });

        // Elegimos y “congelamos” X canciones (shuffle simple)
        const selected = tracks.sort(() => Math.random() - 0.5).slice(0, Number(count));

        const session = await prisma.gameSession.create({
            data: {
                playlistUrl,
                isPublic,
                ownerId: req.user.id,
                tracks: {
                    create: selected.map((t, idx) => ({
                        order: idx,
                        trackId: t.id,
                        name: t.name,
                        artists: t.artists,
                        uri: t.uri,
                        albumJson: t.album,
                        durationMs: t.duration_ms,
                    }))
                }
            },
            include: { tracks: { orderBy: { order: 'asc' } } }
        });

        const shareUrl = `${FRONT_URL}/session/${session.id}`;
        return res.json({ sessionId: session.id, shareUrl, tracks: session.tracks });
    } catch (e) {
        console.error('createSession error:', e.response?.data || e.message);
        res.status(500).json({ error: 'Failed to create session' });
    }
};

// ---------- POST /api/session/:id ----------
async function getSession(req, res) {
    try {
        const { id } = req.params;
        const session = await prisma.gameSession.findUnique({
            where: { id },
            include: { tracks: { orderBy: { order: 'asc' } }, owner: true }
        });
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json({
            id: session.id,
            playlistUrl: session.playlistUrl,
            isPublic: session.isPublic,
            owner: { id: session.ownerId, displayName: session.owner?.displayName || null },
            tracks: session.tracks
        });
    } catch (e) {
        console.error('getSession error:', e.message);
        res.status(500).json({ error: 'Failed to get session' });
    }
};

// ---------- POST /api/session/:id/join ----------
async function joinSession(req, res) {
    try {
        const { id } = req.params;
        const session = await prisma.gameSession.findUnique({ where: { id } });
        if (!session) return res.status(404).json({ error: 'Session not found' });

        // Crea o reutiliza un Game no completado del mismo user en esta sesión
        let game = await prisma.game.findFirst({
            where: { sessionId: id, userId: req.user.id, completed: false }
        });
        if (!game) {
            game = await prisma.game.create({
                data: {
                    sessionId: id,
                    userId: req.user.id
                }
            });
        }

        res.json({ gameId: game.id, sessionId: session.id });
    } catch (e) {
        console.error('joinSession error:', e.message);
        res.status(500).json({ error: 'Failed to join session' });
    }
};

module.exports = { createSession, getSession, joinSession };