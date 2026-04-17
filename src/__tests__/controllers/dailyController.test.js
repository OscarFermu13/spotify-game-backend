jest.mock('../../config', () => ({
    SPOTIFY_CLIENT_ID: 'test-client-id',
    SPOTIFY_CLIENT_SECRET: 'test-client-secret',
    SPOTIFY_REDIRECT_URI: 'http://localhost:4000/auth/callback',
    FRONTEND_URL: 'http://localhost:5173',
    JWT_SECRET: 'test-secret-for-jest',
    TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
    CRON_SECRET: 'test-cron-secret',
    DAILY_PLAYLIST_URL: 'https://open.spotify.com/playlist/testplaylistid',
    DAILY_TRACK_COUNT: 5,
}));

jest.mock('../../prisma/client', () => require('../mocks/prisma'));
jest.mock('../../services/spotify');

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const authMiddleware = require('../../middleware/authMiddleware');
const { getDaily, generateDaily } = require('../../controllers/dailyController');
const prismaMock = require('../mocks/prisma');
const { fetchPlaylistTracksOrdered } = require('../../services/spotify');
const { makeUser, makeSession, makeGame, makeAuthCookie } = require('../mocks/factories');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.get('/api/daily', authMiddleware, getDaily);
    app.post('/api/daily/generate', generateDaily);
    return app;
}

const fakeTracks = Array.from({ length: 5 }, (_, i) => ({
    id: `track-${i + 1}`,
    name: `Song ${i + 1}`,
    artists: `Artist ${i + 1}`,
    uri: `spotify:track:${'a'.repeat(22 - String(i).length)}${i}`,
    album: { images: [] },
    duration_ms: 200000,
}));

const fakeSessionTracks = fakeTracks.map((t, idx) => ({
    id: `cltrack${idx}1234567890abcde`,
    sessionId: 'clsession12345678abcdef',
    order: idx,
    trackId: t.id,
    name: t.name,
    artists: t.artists,
    uri: t.uri,
    albumJson: t.album,
    durationMs: t.duration_ms,
}));

// Estructura completa que devuelve gameSession.findUnique con include
function makeDailySession(overrides = {}) {
    const base = makeSession({
        source: 'daily',
        dailyDate: new Date(),
        ...overrides,
    });
    return {
        ...base,
        tracks: fakeSessionTracks,
        owner: makeUser(),
    };
}

describe('GET /api/daily', () => {
    const app = makeApp();
    const user = makeUser();
    const cookie = makeAuthCookie(user);
    const dailySession = makeDailySession({ ownerId: user.id });
    const game = makeGame({ userId: user.id, sessionId: dailySession.id });

    beforeEach(() => {
        prismaMock.user.findUnique.mockResolvedValue(user);
        prismaMock.game.groupBy.mockResolvedValue([{ userId: user.id }]);
    });

    describe('sesión existente', () => {
        it('devuelve la sesión existente si ya hay una para hoy sin crear una nueva', async () => {
            prismaMock.gameSession.findUnique.mockResolvedValue(dailySession);
            prismaMock.game.findFirst.mockResolvedValue(game);

            const res = await request(app)
                .get('/api/daily')
                .set('Cookie', cookie);

            expect(res.status).toBe(200);
            expect(res.body.sessionId).toBe(dailySession.id);
            expect(prismaMock.gameSession.create).not.toHaveBeenCalled();
        });

        it('devuelve alreadyCompleted: true si el usuario ya completó la sesión', async () => {
            prismaMock.gameSession.findUnique.mockResolvedValue(dailySession);
            prismaMock.game.findFirst.mockResolvedValue({ ...game, completed: true });

            const res = await request(app)
                .get('/api/daily')
                .set('Cookie', cookie);

            expect(res.status).toBe(200);
            expect(res.body.alreadyCompleted).toBe(true);
        });

        it('devuelve alreadyCompleted: false si el usuario no ha completado la sesión', async () => {
            prismaMock.gameSession.findUnique.mockResolvedValue(dailySession);
            prismaMock.game.findFirst.mockResolvedValue({ ...game, completed: false });

            const res = await request(app)
                .get('/api/daily')
                .set('Cookie', cookie);

            expect(res.status).toBe(200);
            expect(res.body.alreadyCompleted).toBe(false);
        });
    });

    describe('gestión del Game del usuario', () => {
        it('reutiliza el Game existente si el usuario ya había unido', async () => {
            prismaMock.gameSession.findUnique.mockResolvedValue(dailySession);
            prismaMock.game.findFirst.mockResolvedValue(game);

            const res = await request(app)
                .get('/api/daily')
                .set('Cookie', cookie);

            expect(res.status).toBe(200);
            expect(res.body.gameId).toBe(game.id);
            expect(prismaMock.game.create).not.toHaveBeenCalled();
        });

        it('crea un nuevo Game si el usuario no había unido', async () => {
            prismaMock.gameSession.findUnique.mockResolvedValue(dailySession);
            prismaMock.game.findFirst.mockResolvedValue(null);
            prismaMock.game.create.mockResolvedValue(game);

            const res = await request(app)
                .get('/api/daily')
                .set('Cookie', cookie);

            expect(res.status).toBe(200);
            expect(res.body.gameId).toBe(game.id);
            expect(prismaMock.game.create).toHaveBeenCalledTimes(1);
        });
    });

    describe('sin autenticación', () => {
        it('devuelve 401 sin cookie', async () => {
            const res = await request(app).get('/api/daily');
            expect(res.status).toBe(401);
        });
    });
});

describe('POST /api/daily/generate', () => {
    const app = makeApp();
    const user = makeUser();
    const tomorrowSession = makeDailySession();

    beforeEach(() => {
        fetchPlaylistTracksOrdered.mockResolvedValue(fakeTracks);
    });

    describe('autenticación del cron', () => {
        it('devuelve 401 si falta el header x-cron-secret', async () => {
            const res = await request(app).post('/api/daily/generate');
            expect(res.status).toBe(401);
            expect(res.body.code).toBe('UNAUTHORIZED');
        });

        it('devuelve 401 si el secret es incorrecto', async () => {
            const res = await request(app)
                .post('/api/daily/generate')
                .set('x-cron-secret', 'wrong-secret');
            expect(res.status).toBe(401);
            expect(res.body.code).toBe('UNAUTHORIZED');
        });
    });

    describe('idempotencia', () => {
        it('devuelve el sessionId existente si ya se generó la sesión de mañana', async () => {
            prismaMock.gameSession.findUnique.mockResolvedValue(tomorrowSession);

            const res = await request(app)
                .post('/api/daily/generate')
                .set('x-cron-secret', 'test-cron-secret');

            expect(res.status).toBe(200);
            expect(res.body.sessionId).toBe(tomorrowSession.id);
            expect(res.body.message).toBe('Already generated');
            expect(prismaMock.gameSession.create).not.toHaveBeenCalled();
        });
    });

    describe('generación correcta', () => {
        it('genera una sesión nueva si no existe la de mañana', async () => {
            prismaMock.gameSession.findUnique.mockResolvedValue(null);
            prismaMock.user.findFirst.mockResolvedValue(user);
            prismaMock.gameSession.create.mockResolvedValue({
                ...tomorrowSession,
                tracks: fakeSessionTracks,
                owner: user,
            });

            const res = await request(app)
                .post('/api/daily/generate')
                .set('x-cron-secret', 'test-cron-secret');

            expect(res.status).toBe(200);
            expect(res.body.sessionId).toBeDefined();
            expect(prismaMock.gameSession.create).toHaveBeenCalledTimes(1);
        });
    });
});