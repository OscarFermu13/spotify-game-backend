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
jest.mock('../../services/spotify');

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const authMiddleware = require('../../middleware/authMiddleware');
const { createSession, getSession, joinSession } = require('../../controllers/sessionController');
const prismaMock = require('../mocks/prisma');
const { fetchPlaylistTracksOrdered } = require('../../services/spotify');
const { makeUser, makeSession, makeGame, makeAuthCookie } = require('../mocks/factories');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.post('/api/session/create', authMiddleware, createSession);
    app.get('/api/session/:id', authMiddleware, getSession);
    app.post('/api/session/:id/join', authMiddleware, joinSession);
    return app;
}

// Tracks de ejemplo que devuelve el mock de Spotify
const fakeTracks = [
    { id: 'track-1', name: 'Song One', artists: 'Artist One', uri: 'spotify:track:aaaaaaaaaaaaaaaaaaaaaa', album: {}, duration_ms: 200000 },
    { id: 'track-2', name: 'Song Two', artists: 'Artist Two', uri: 'spotify:track:bbbbbbbbbbbbbbbbbbbbbb', album: {}, duration_ms: 180000 },
    { id: 'track-3', name: 'Song Three', artists: 'Artist Three', uri: 'spotify:track:cccccccccccccccccccccc', album: {}, duration_ms: 210000 },
    { id: 'track-4', name: 'Song Four', artists: 'Artist Four', uri: 'spotify:track:dddddddddddddddddddddd', album: {}, duration_ms: 195000 },
    { id: 'track-5', name: 'Song Five', artists: 'Artist Five', uri: 'spotify:track:eeeeeeeeeeeeeeeeeeeeee', album: {}, duration_ms: 220000 },
];

const fakeSessionWithTracks = (overrides = {}) => ({
    id: 'clsession12345678abcdef',
    playlistUrl: 'https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF',
    isPublic: true,
    penalty: 5,
    ownerId: 'cluser123456789abcdefgh',
    source: 'custom',
    dailyDate: null,
    packId: null,
    createdAt: new Date(),
    tracks: fakeTracks.slice(0, 5).map((t, idx) => ({ ...t, order: idx, sessionId: 'clsession12345678abcdef' })),
    ...overrides,
});

describe('POST /api/session/create', () => {
    const app = makeApp();
    const user = makeUser();
    const cookie = makeAuthCookie(user);

    const validPayload = {
        playlistUrl: 'https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF',
        isPublic: true,
        count: 5,
        penalty: 5,
    };

    beforeEach(() => {
        prismaMock.user.findUnique.mockResolvedValue(user);
        fetchPlaylistTracksOrdered.mockResolvedValue(fakeTracks);
        prismaMock.gameSession.create.mockResolvedValue(fakeSessionWithTracks());
    });

    describe('payload inválido', () => {
        it('devuelve 400 si falta playlistUrl', async () => {
            const res = await request(app)
                .post('/api/session/create')
                .set('Cookie', cookie)
                .send({ isPublic: true, count: 5, penalty: 5 });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_PAYLOAD');
        });

        it('devuelve 400 si count es 0', async () => {
            const res = await request(app)
                .post('/api/session/create')
                .set('Cookie', cookie)
                .send({ ...validPayload, count: 0 });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_PAYLOAD');
        });

        it('devuelve 400 si count es 51', async () => {
            const res = await request(app)
                .post('/api/session/create')
                .set('Cookie', cookie)
                .send({ ...validPayload, count: 51 });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_PAYLOAD');
        });

        it('devuelve 400 si count no es un número', async () => {
            const res = await request(app)
                .post('/api/session/create')
                .set('Cookie', cookie)
                .send({ ...validPayload, count: 'abc' });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_PAYLOAD');
        });

        it('devuelve 400 si penalty es negativo', async () => {
            const res = await request(app)
                .post('/api/session/create')
                .set('Cookie', cookie)
                .send({ ...validPayload, penalty: -1 });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_PAYLOAD');
        });

        it('devuelve 400 si penalty supera 60', async () => {
            const res = await request(app)
                .post('/api/session/create')
                .set('Cookie', cookie)
                .send({ ...validPayload, penalty: 61 });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_PAYLOAD');
        });

        it('devuelve 400 si isPublic no es booleano', async () => {
            const res = await request(app)
                .post('/api/session/create')
                .set('Cookie', cookie)
                .send({ ...validPayload, isPublic: 'true' });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_PAYLOAD');
        });

        it('devuelve 400 si la URL de playlist no es válida', async () => {
            const res = await request(app)
                .post('/api/session/create')
                .set('Cookie', cookie)
                .send({ ...validPayload, playlistUrl: 'https://open.spotify.com/track/abc' });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_PAYLOAD');
        });
    });

    describe('caso correcto', () => {
        it('devuelve 200 con sessionId y shareUrl', async () => {
            const res = await request(app)
                .post('/api/session/create')
                .set('Cookie', cookie)
                .send(validPayload);
            expect(res.status).toBe(200);
            expect(res.body.sessionId).toBeDefined();
            expect(res.body.shareUrl).toContain(res.body.sessionId);
            expect(res.body.tracks).toBeDefined();
        });

        it('el shareUrl apunta al frontend', async () => {
            const res = await request(app)
                .post('/api/session/create')
                .set('Cookie', cookie)
                .send(validPayload);
            expect(res.body.shareUrl).toContain('http://localhost:5173');
        });
    });

    describe('sin autenticación', () => {
        it('devuelve 401 sin cookie', async () => {
            const res = await request(app)
                .post('/api/session/create')
                .send(validPayload);
            expect(res.status).toBe(401);
        });
    });
});

describe('GET /api/session/:id', () => {
    const app = makeApp();
    const user = makeUser();
    const cookie = makeAuthCookie(user);
    const session = makeSession({ ownerId: user.id });

    beforeEach(() => {
        prismaMock.user.findUnique.mockResolvedValue(user);
    });

    describe('ID inválido', () => {
        it('devuelve 400 si el ID no tiene formato cuid', async () => {
            const res = await request(app)
                .get('/api/session/not-a-valid-id')
                .set('Cookie', cookie);
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_ID');
        });
    });

    describe('sesión no encontrada', () => {
        it('devuelve 404 si la sesión no existe', async () => {
            prismaMock.gameSession.findUnique.mockResolvedValue(null);
            const res = await request(app)
                .get(`/api/session/${session.id}`)
                .set('Cookie', cookie);
            expect(res.status).toBe(404);
            expect(res.body.code).toBe('NOT_FOUND');
        });
    });

    describe('control de acceso', () => {
        it('devuelve 403 si la sesión es privada y el usuario no es el owner', async () => {
            prismaMock.gameSession.findUnique.mockResolvedValue({
                ...session,
                isPublic: false,
                ownerId: 'clotheruser1234567890ab',
                owner: makeUser({ id: 'clotheruser1234567890ab' }),
            });
            const res = await request(app)
                .get(`/api/session/${session.id}`)
                .set('Cookie', cookie);
            expect(res.status).toBe(403);
            expect(res.body.code).toBe('ACCESS_DENIED');
        });

        it('devuelve 200 si la sesión es privada pero el usuario es el owner', async () => {
            prismaMock.gameSession.findUnique.mockResolvedValue({
                ...session,
                isPublic: false,
                ownerId: user.id,
                owner: user,
            });
            const res = await request(app)
                .get(`/api/session/${session.id}`)
                .set('Cookie', cookie);
            expect(res.status).toBe(200);
        });
    });

    describe('caso correcto', () => {
        it('devuelve 200 con los datos de la sesión', async () => {
            prismaMock.gameSession.findUnique.mockResolvedValue({
                ...session,
                owner: user,
            });
            const res = await request(app)
                .get(`/api/session/${session.id}`)
                .set('Cookie', cookie);
            expect(res.status).toBe(200);
            expect(res.body.id).toBe(session.id);
            expect(res.body.playlistUrl).toBeDefined();
            expect(res.body.tracks).toBeDefined();
        });
    });
});

describe('POST /api/session/:id/join', () => {
    const app = makeApp();
    const user = makeUser();
    const cookie = makeAuthCookie(user);
    const session = makeSession({ ownerId: user.id });
    const game = makeGame({ userId: user.id, sessionId: session.id });

    beforeEach(() => {
        prismaMock.user.findUnique.mockResolvedValue(user);
    });

    describe('ID inválido', () => {
        it('devuelve 400 si el ID no es válido', async () => {
            const res = await request(app)
                .post('/api/session/not-a-valid-id/join')
                .set('Cookie', cookie);
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_ID');
        });
    });

    describe('sesión no encontrada', () => {
        it('devuelve 404 si la sesión no existe', async () => {
            prismaMock.gameSession.findUnique.mockResolvedValue(null);
            const res = await request(app)
                .post(`/api/session/${session.id}/join`)
                .set('Cookie', cookie);
            expect(res.status).toBe(404);
            expect(res.body.code).toBe('NOT_FOUND');
        });
    });

    describe('idempotencia', () => {
        it('devuelve el gameId existente si el usuario ya había hecho join', async () => {
            prismaMock.gameSession.findUnique.mockResolvedValue(session);
            prismaMock.game.findFirst.mockResolvedValue(game);

            const res = await request(app)
                .post(`/api/session/${session.id}/join`)
                .set('Cookie', cookie);

            expect(res.status).toBe(200);
            expect(res.body.gameId).toBe(game.id);
            expect(prismaMock.game.create).not.toHaveBeenCalled();
        });

        it('crea un nuevo Game si es la primera vez que el usuario se une', async () => {
            prismaMock.gameSession.findUnique.mockResolvedValue(session);
            prismaMock.game.findFirst.mockResolvedValue(null);
            prismaMock.game.create.mockResolvedValue(game);

            const res = await request(app)
                .post(`/api/session/${session.id}/join`)
                .set('Cookie', cookie);

            expect(res.status).toBe(200);
            expect(res.body.gameId).toBe(game.id);
            expect(prismaMock.game.create).toHaveBeenCalledTimes(1);
        });
    });

    describe('sin autenticación', () => {
        it('devuelve 401 sin cookie', async () => {
            const res = await request(app)
                .post(`/api/session/${session.id}/join`);
            expect(res.status).toBe(401);
        });
    });
});