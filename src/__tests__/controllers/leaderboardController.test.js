jest.mock('../../config', () => ({
    SPOTIFY_CLIENT_ID: 'test-client-id',
    SPOTIFY_CLIENT_SECRET: 'test-client-secret',
    SPOTIFY_REDIRECT_URI: 'http://localhost:4000/auth/callback',
    FRONTEND_URL: 'http://localhost:5173',
    JWT_SECRET: 'test-secret-for-jest',
    TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
    CRON_SECRET: 'test-cron-secret',
}));

jest.mock('../../prisma/client', () => require('../mocks/prisma'));

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const authMiddleware = require('../../middleware/authMiddleware');
const {
    getGlobalLeaderboard,
    getSessionLeaderboard,
    getPersonalLeaderboard,
    getGameDetail,
} = require('../../controllers/leaderboardController');
const prismaMock = require('../mocks/prisma');
const { makeUser, makeSession, makeGame, makeAuthCookie } = require('../mocks/factories');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.get('/api/leaderboard/global', authMiddleware, getGlobalLeaderboard);
    app.get('/api/leaderboard/session/:id', authMiddleware, getSessionLeaderboard);
    app.get('/api/leaderboard/me', authMiddleware, getPersonalLeaderboard);
    app.get('/api/leaderboard/game/:gameId', authMiddleware, getGameDetail);
    return app;
}

// Construye un game con la estructura anidada que devuelve getGlobalLeaderboard
// (include: user + session.tracks)
function makeGlobalGame({ userId, trackCount = 5, totalTime = 30 } = {}) {
    const user = makeUser({ id: userId });
    return {
        ...makeGame({ userId: user.id, totalTime, completed: true }),
        totalTime,
        user: { id: user.id, displayName: user.displayName, spotifyId: user.spotifyId },
        session: {
            tracks: Array.from({ length: trackCount }, (_, i) => ({ id: `cltrack${i}1234567890abcde` })),
        },
    };
}

// Construye un game con la estructura que devuelve getSessionLeaderboard
// (include: user + tracks GameTrack[])
function makeSessionGame({ userId, totalTime = 30, guessed = 3 } = {}) {
    const user = makeUser({ id: userId });
    const game = makeGame({ userId: user.id, sessionId: 'clsession12345678abcdef', totalTime, completed: true });
    return {
        ...game,
        totalTime,
        user: { id: user.id, displayName: user.displayName, spotifyId: user.spotifyId },
        tracks: Array.from({ length: guessed }, (_, i) => ({
            id: `clgametrack${i}234567890ab`,
            gameId: game.id,
            trackId: `track-${i}`,
            guessed: true,
            skipped: false,
            timeTaken: 5,
            baseTime: 5,
            hintCost: 0,
        })),
    };
}

// Construye la estructura anidada que devuelve getGameDetail
function makeDetailedGame({ userId, isPublic = true, completed = true } = {}) {
    const user = makeUser({ id: userId });
    const session = makeSession({ ownerId: user.id, isPublic });
    const game = makeGame({ userId: user.id, sessionId: session.id, completed });

    const sessionTracks = Array.from({ length: 3 }, (_, i) => ({
        id: `cltrack${i}1234567890abcde`,
        sessionId: session.id,
        order: i,
        trackId: `track-${i}`,
        name: `Song ${i}`,
        artists: `Artist ${i}`,
        uri: `spotify:track:${'a'.repeat(22)}`,
        albumJson: { images: [{ url: 'https://example.com/cover.jpg' }] },
        durationMs: 200000,
    }));

    const gameTracks = sessionTracks.map((st) => ({
        id: `clgametrack${st.order}234567890ab`,
        gameId: game.id,
        trackId: st.trackId,
        guessed: true,
        skipped: false,
        timeTaken: 8,
        baseTime: 8,
        hintCost: 0,
    }));

    return {
        ...game,
        totalTime: 24,
        user: { id: user.id, displayName: user.displayName, spotifyId: user.spotifyId },
        session: { ...session, tracks: sessionTracks },
        tracks: gameTracks,
    };
}

// ── GET /api/leaderboard/global ──────────────────────────────────────────────

describe('GET /api/leaderboard/global', () => {
    const app = makeApp();
    const user = makeUser();
    const cookie = makeAuthCookie(user);

    beforeEach(() => {
        prismaMock.user.findUnique.mockResolvedValue(user);
    });

    it('devuelve array vacío si no hay partidas completadas', async () => {
        prismaMock.game.findMany.mockResolvedValue([]);

        const res = await request(app)
            .get('/api/leaderboard/global')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it('excluye partidas de sesiones con menos de 3 canciones', async () => {
        prismaMock.game.findMany.mockResolvedValue([
            makeGlobalGame({ userId: user.id, trackCount: 2, totalTime: 10 }),
        ]);

        const res = await request(app)
            .get('/api/leaderboard/global')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it('incluye partidas de sesiones con 3 o más canciones', async () => {
        prismaMock.game.findMany.mockResolvedValue([
            makeGlobalGame({ userId: user.id, trackCount: 3, totalTime: 25 }),
        ]);

        const res = await request(app)
            .get('/api/leaderboard/global')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });

    it('devuelve máximo 20 entradas aunque haya más usuarios', async () => {
        // 25 usuarios distintos, cada uno con una partida válida
        const games = Array.from({ length: 25 }, (_, i) =>
            makeGlobalGame({
                userId: `cluser${String(i).padStart(19, '0')}`,
                trackCount: 5,
                totalTime: 20 + i,
            })
        );
        prismaMock.game.findMany.mockResolvedValue(games);

        const res = await request(app)
            .get('/api/leaderboard/global')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body.length).toBeLessThanOrEqual(20);
    });

    it('devuelve 401 sin cookie', async () => {
        const res = await request(app).get('/api/leaderboard/global');
        expect(res.status).toBe(401);
    });
});

// ── GET /api/leaderboard/session/:id ────────────────────────────────────────

describe('GET /api/leaderboard/session/:id', () => {
    const app = makeApp();
    const user = makeUser();
    const cookie = makeAuthCookie(user);
    const session = makeSession({ ownerId: user.id, isPublic: true });

    beforeEach(() => {
        prismaMock.user.findUnique.mockResolvedValue(user);
    });

    it('devuelve 400 si el ID no es válido', async () => {
        const res = await request(app)
            .get('/api/leaderboard/session/not-a-valid-id')
            .set('Cookie', cookie);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_ID');
    });

    it('devuelve 404 si la sesión no existe', async () => {
        prismaMock.gameSession.findUnique.mockResolvedValue(null);

        const res = await request(app)
            .get(`/api/leaderboard/session/${session.id}`)
            .set('Cookie', cookie);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
    });

    it('devuelve 403 si la sesión es privada y el usuario no es owner ni participante', async () => {
        prismaMock.gameSession.findUnique.mockResolvedValue({
            ...session,
            isPublic: false,
            ownerId: 'clotheruser1234567890ab',
            tracks: [],
        });
        // No es participante
        prismaMock.game.findFirst.mockResolvedValue(null);

        const res = await request(app)
            .get(`/api/leaderboard/session/${session.id}`)
            .set('Cookie', cookie);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('ACCESS_DENIED');
    });

    it('devuelve 200 con el leaderboard ordenado por tiempo si la sesión es pública', async () => {
        const slowGame = makeSessionGame({ userId: 'cluser000000000000000001', totalTime: 60 });
        const fastGame = makeSessionGame({ userId: 'cluser000000000000000002', totalTime: 20 });

        prismaMock.gameSession.findUnique.mockResolvedValue({
            ...session,
            tracks: [{ id: 'cltrack01234567890abcde' }],
        });
        // findMany ya devuelve ordenado por totalTime asc (lo hace Prisma en prod)
        // en el mock devolvemos en orden correcto para verificar el mapeo de rank
        prismaMock.game.findMany.mockResolvedValue([fastGame, slowGame]);

        const res = await request(app)
            .get(`/api/leaderboard/session/${session.id}`)
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body.leaderboard).toHaveLength(2);
        expect(res.body.leaderboard[0].rank).toBe(1);
        expect(res.body.leaderboard[0].totalTime).toBe(20);
        expect(res.body.leaderboard[1].rank).toBe(2);
        expect(res.body.leaderboard[1].totalTime).toBe(60);
    });

    it('devuelve 401 sin cookie', async () => {
        const res = await request(app).get(`/api/leaderboard/session/${session.id}`);
        expect(res.status).toBe(401);
    });
});

// ── GET /api/leaderboard/me ──────────────────────────────────────────────────

describe('GET /api/leaderboard/me', () => {
    const app = makeApp();
    const user = makeUser();
    const cookie = makeAuthCookie(user);

    beforeEach(() => {
        prismaMock.user.findUnique.mockResolvedValue(user);
    });

    it('devuelve stats: null e history: [] si no hay partidas', async () => {
        prismaMock.game.findMany.mockResolvedValue([]);

        const res = await request(app)
            .get('/api/leaderboard/me')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body.stats).toBeNull();
        expect(res.body.history).toEqual([]);
    });

    it('devuelve historial con source correctamente segmentado', async () => {
        const baseSession = makeSession({ ownerId: user.id });
        const makePersonalGame = (source, dailyDate = null, packName = null) => ({
            ...makeGame({ userId: user.id, completed: true }),
            totalTime: 30,
            tracks: [{ guessed: true }, { guessed: false }],
            session: {
                id: baseSession.id,
                playlistUrl: baseSession.playlistUrl,
                source,
                dailyDate,
                tracks: [{ id: 'cltrack01234567890abcde' }, { id: 'cltrack11234567890abcde' }],
                pack: packName ? { name: packName, slug: 'test-pack' } : null,
            },
        });

        prismaMock.game.findMany.mockResolvedValue([
            makePersonalGame('daily', new Date()),
            makePersonalGame('pack', null, '90s Rock'),
            makePersonalGame('custom'),
        ]);

        const res = await request(app)
            .get('/api/leaderboard/me')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body.history).toHaveLength(3);

        const sources = res.body.history.map((g) => g.source);
        expect(sources).toContain('daily');
        expect(sources).toContain('pack');
        expect(sources).toContain('custom');

        const packEntry = res.body.history.find((g) => g.source === 'pack');
        expect(packEntry.packName).toBe('90s Rock');

        const dailyEntry = res.body.history.find((g) => g.source === 'daily');
        expect(dailyEntry.dailyDate).toBeDefined();
    });

    it('devuelve stats agregadas correctamente', async () => {
        const baseSession = makeSession({ ownerId: user.id });
        const games = [
            {
                ...makeGame({ userId: user.id, completed: true }),
                totalTime: 20,
                tracks: [{ guessed: true }, { guessed: true }],
                session: {
                    id: baseSession.id,
                    playlistUrl: baseSession.playlistUrl,
                    source: 'custom',
                    dailyDate: null,
                    tracks: [{ id: 'cltrack01234567890abcde' }, { id: 'cltrack11234567890abcde' }],
                    pack: null,
                },
            },
            {
                ...makeGame({ userId: user.id, completed: true }),
                totalTime: 40,
                tracks: [{ guessed: true }, { guessed: false }],
                session: {
                    id: baseSession.id,
                    playlistUrl: baseSession.playlistUrl,
                    source: 'custom',
                    dailyDate: null,
                    tracks: [{ id: 'cltrack01234567890abcde' }, { id: 'cltrack11234567890abcde' }],
                    pack: null,
                },
            },
        ];
        prismaMock.game.findMany.mockResolvedValue(games);

        const res = await request(app)
            .get('/api/leaderboard/me')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body.stats.gamesPlayed).toBe(2);
        expect(res.body.stats.bestTime).toBe(20);
        expect(res.body.stats.avgTime).toBe(30);
    });

    it('devuelve 401 sin cookie', async () => {
        const res = await request(app).get('/api/leaderboard/me');
        expect(res.status).toBe(401);
    });
});

// ── GET /api/leaderboard/game/:gameId ────────────────────────────────────────

describe('GET /api/leaderboard/game/:gameId', () => {
    const app = makeApp();
    const user = makeUser();
    const cookie = makeAuthCookie(user);

    beforeEach(() => {
        prismaMock.user.findUnique.mockResolvedValue(user);
    });

    it('devuelve 400 si el ID no es válido', async () => {
        const res = await request(app)
            .get('/api/leaderboard/game/not-a-valid-id')
            .set('Cookie', cookie);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_ID');
    });

    it('devuelve 404 si la partida no existe', async () => {
        prismaMock.game.findUnique.mockResolvedValue(null);

        const res = await request(app)
            .get('/api/leaderboard/game/clgame1234567890abcdefg')
            .set('Cookie', cookie);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
    });

    it('devuelve 404 si la partida existe pero no está completada', async () => {
        prismaMock.game.findUnique.mockResolvedValue(
            makeDetailedGame({ userId: user.id, completed: false })
        );

        const res = await request(app)
            .get('/api/leaderboard/game/clgame1234567890abcdefg')
            .set('Cookie', cookie);
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('NOT_FOUND');
    });

    it('devuelve 403 si la sesión es privada y el usuario no es el owner', async () => {
        prismaMock.game.findUnique.mockResolvedValue(
            makeDetailedGame({ userId: 'clotheruser1234567890ab', isPublic: false, completed: true })
        );

        const res = await request(app)
            .get('/api/leaderboard/game/clgame1234567890abcdefg')
            .set('Cookie', cookie);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('ACCESS_DENIED');
    });

    it('devuelve 200 con el detalle completo de la partida', async () => {
        prismaMock.game.findUnique.mockResolvedValue(
            makeDetailedGame({ userId: user.id, isPublic: true, completed: true })
        );

        const res = await request(app)
            .get('/api/leaderboard/game/clgame1234567890abcdefg')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body.gameId).toBeDefined();
        expect(res.body.tracks).toHaveLength(3);
        expect(res.body.totalTime).toBeDefined();
        expect(res.body.accuracy).toBeDefined();
    });

    it('devuelve isCurrentUser: true si la partida pertenece al usuario autenticado', async () => {
        prismaMock.game.findUnique.mockResolvedValue(
            makeDetailedGame({ userId: user.id, isPublic: true, completed: true })
        );

        const res = await request(app)
            .get('/api/leaderboard/game/clgame1234567890abcdefg')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body.isCurrentUser).toBe(true);
    });

    it('devuelve 401 sin cookie', async () => {
        const res = await request(app)
            .get('/api/leaderboard/game/clgame1234567890abcdefg');
        expect(res.status).toBe(401);
    });
});