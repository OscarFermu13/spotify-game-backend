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
const { listPacks, getPack, playPack, unlockPack } = require('../../controllers/packsController');
const prismaMock = require('../mocks/prisma');
const { fetchPlaylistTracksOrdered } = require('../../services/spotify');
const { makeUser, makeGame, makeAuthCookie } = require('../mocks/factories');

prismaMock.pack = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
};
prismaMock.userPack = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
};

// Incluir los nuevos modelos en el reset automático de beforeEach
// que ya hace mocks/prisma.js para los modelos base
beforeEach(() => {
    Object.values(prismaMock.pack).forEach((fn) => fn.mockReset());
    Object.values(prismaMock.userPack).forEach((fn) => fn.mockReset());
});

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.get('/api/packs', authMiddleware, listPacks);
    app.get('/api/packs/:slug', authMiddleware, getPack);
    app.post('/api/packs/:slug/play', authMiddleware, playPack);
    app.post('/api/packs/:slug/unlock', authMiddleware, unlockPack);
    return app;
}

// ── Factories locales ────────────────────────────────────────────────────────

function makePack(overrides = {}) {
    return {
        id: 'clpack1234567890abcdefg',
        slug: 'test-pack',
        name: 'Test Pack',
        description: 'A test pack',
        imageUrl: null,
        playlistUrl: 'https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF',
        trackCount: 5,
        tier: 'free',
        price: null,
        currency: 'EUR',
        isActive: true,
        order: 0,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

function makeUserPack(overrides = {}) {
    return {
        id: 'cluserpack12345678abcde',
        userId: 'cluser123456789abcdefgh',
        packId: 'clpack1234567890abcdefg',
        unlockedAt: new Date(),
        expiresAt: null,
        source: 'purchase',
        priceCharged: null,
        ...overrides,
    };
}

const fakeTracks = Array.from({ length: 5 }, (_, i) => ({
    id: `track-${i + 1}`,
    name: `Song ${i + 1}`,
    artists: `Artist ${i + 1}`,
    uri: `spotify:track:${'a'.repeat(22 - String(i).length)}${i}`,
    album: { images: [] },
    duration_ms: 200000,
}));

// ── GET /api/packs ───────────────────────────────────────────────────────────

describe('GET /api/packs', () => {
    const app = makeApp();
    const user = makeUser();
    const cookie = makeAuthCookie(user);

    beforeEach(() => {
        prismaMock.user.findUnique.mockResolvedValue(user);
    });

    it('devuelve solo packs activos', async () => {
        prismaMock.pack.findMany.mockResolvedValue([makePack()]);
        prismaMock.userPack.findMany.mockResolvedValue([]);

        const res = await request(app)
            .get('/api/packs')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(prismaMock.pack.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { isActive: true } })
        );
    });

    it('marca unlocked: true para packs de tier free', async () => {
        prismaMock.pack.findMany.mockResolvedValue([makePack({ tier: 'free' })]);
        prismaMock.userPack.findMany.mockResolvedValue([]);

        const res = await request(app)
            .get('/api/packs')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body[0].unlocked).toBe(true);
    });

    it('marca unlocked: true para packs premium que el usuario tiene en UserPack', async () => {
        const premiumPack = makePack({ tier: 'premium', price: 4.99 });
        prismaMock.pack.findMany.mockResolvedValue([premiumPack]);
        prismaMock.userPack.findMany.mockResolvedValue([
            makeUserPack({ packId: premiumPack.id, userId: user.id }),
        ]);

        const res = await request(app)
            .get('/api/packs')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body[0].unlocked).toBe(true);
    });

    it('marca unlocked: false para packs premium sin UserPack del usuario', async () => {
        prismaMock.pack.findMany.mockResolvedValue([makePack({ tier: 'premium', price: 4.99 })]);
        prismaMock.userPack.findMany.mockResolvedValue([]);

        const res = await request(app)
            .get('/api/packs')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body[0].unlocked).toBe(false);
    });

    it('excluye UserPack con expiresAt en el pasado', async () => {
        const premiumPack = makePack({ tier: 'premium', price: 4.99 });
        prismaMock.pack.findMany.mockResolvedValue([premiumPack]);
        prismaMock.userPack.findMany.mockResolvedValue([]);

        const res = await request(app)
            .get('/api/packs')
            .set('Cookie', cookie);

        expect(res.status).toBe(200);
        expect(res.body[0].unlocked).toBe(false);
        // Verificamos que la query incluye el filtro de expiresAt
        expect(prismaMock.userPack.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    userId: user.id,
                }),
            })
        );
    });

    it('devuelve 401 sin cookie', async () => {
        const res = await request(app).get('/api/packs');
        expect(res.status).toBe(401);
    });
});

// ── POST /api/packs/:slug/play ───────────────────────────────────────────────

describe('POST /api/packs/:slug/play', () => {
    const app = makeApp();
    const user = makeUser();
    const cookie = makeAuthCookie(user);
    const freePack = makePack({ tier: 'free' });
    const premiumPack = makePack({
        id: 'clpack9999999990abcdefg',
        slug: 'premium-pack',
        tier: 'premium',
        price: 4.99,
    });

    beforeEach(() => {
        prismaMock.user.findUnique.mockResolvedValue(user);
        fetchPlaylistTracksOrdered.mockResolvedValue(fakeTracks);
        prismaMock.gameSession.create.mockResolvedValue({
            id: 'clsession12345678abcdef',
            tracks: fakeTracks.map((t, i) => ({ ...t, order: i })),
        });
        prismaMock.game.create.mockResolvedValue(
            makeGame({ userId: user.id, sessionId: 'clsession12345678abcdef' })
        );
    });

    describe('validación del slug', () => {
        it('devuelve 400 si el slug es inválido', async () => {
            const res = await request(app)
                .post('/api/packs/INVALID_SLUG!!/play')
                .set('Cookie', cookie);
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_SLUG');
        });
    });

    describe('pack no encontrado', () => {
        it('devuelve 404 si el pack no existe', async () => {
            prismaMock.pack.findUnique.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/packs/test-pack/play')
                .set('Cookie', cookie);
            expect(res.status).toBe(404);
            expect(res.body.code).toBe('NOT_FOUND');
        });

        it('devuelve 404 si el pack existe pero no está activo', async () => {
            prismaMock.pack.findUnique.mockResolvedValue({ ...freePack, isActive: false });

            const res = await request(app)
                .post('/api/packs/test-pack/play')
                .set('Cookie', cookie);
            expect(res.status).toBe(404);
            expect(res.body.code).toBe('NOT_FOUND');
        });
    });

    describe('control de acceso premium', () => {
        it('devuelve 403 si el pack es premium y el usuario no lo tiene desbloqueado', async () => {
            prismaMock.pack.findUnique.mockResolvedValue(premiumPack);
            prismaMock.userPack.findFirst.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/packs/premium-pack/play')
                .set('Cookie', cookie);
            expect(res.status).toBe(403);
            expect(res.body.code).toBe('ACCESS_DENIED');
        });

        it('devuelve 200 si el pack es premium y el usuario sí lo tiene desbloqueado', async () => {
            prismaMock.pack.findUnique.mockResolvedValue(premiumPack);
            prismaMock.userPack.findFirst.mockResolvedValue(
                makeUserPack({ packId: premiumPack.id, userId: user.id })
            );

            const res = await request(app)
                .post('/api/packs/premium-pack/play')
                .set('Cookie', cookie);
            expect(res.status).toBe(200);
            expect(res.body.sessionId).toBeDefined();
            expect(res.body.gameId).toBeDefined();
        });
    });

    describe('caso correcto', () => {
        it('devuelve 200 con sessionId, gameId y tracks para pack free', async () => {
            prismaMock.pack.findUnique.mockResolvedValue(freePack);

            const res = await request(app)
                .post('/api/packs/test-pack/play')
                .set('Cookie', cookie);

            expect(res.status).toBe(200);
            expect(res.body.sessionId).toBeDefined();
            expect(res.body.gameId).toBeDefined();
            expect(res.body.tracks).toBeDefined();
            expect(res.body.packSlug).toBe(freePack.slug);
        });

        it('crea la sesión y el game en la base de datos', async () => {
            prismaMock.pack.findUnique.mockResolvedValue(freePack);

            await request(app)
                .post('/api/packs/test-pack/play')
                .set('Cookie', cookie);

            expect(prismaMock.gameSession.create).toHaveBeenCalledTimes(1);
            expect(prismaMock.game.create).toHaveBeenCalledTimes(1);
        });
    });

    describe('sin autenticación', () => {
        it('devuelve 401 sin cookie', async () => {
            const res = await request(app).post('/api/packs/test-pack/play');
            expect(res.status).toBe(401);
        });
    });
});

// ── POST /api/packs/:slug/unlock ─────────────────────────────────────────────

describe('POST /api/packs/:slug/unlock', () => {
    const app = makeApp();
    const user = makeUser();
    const cookie = makeAuthCookie(user);
    const freePack = makePack({ tier: 'free' });
    const premiumPack = makePack({
        id: 'clpack9999999990abcdefg',
        slug: 'premium-pack',
        tier: 'premium',
        price: 4.99,
    });

    beforeEach(() => {
        prismaMock.user.findUnique.mockResolvedValue(user);
    });

    describe('packs gratuitos', () => {
        it('devuelve unlocked: true y source: free sin crear UserPack', async () => {
            prismaMock.pack.findUnique.mockResolvedValue(freePack);

            const res = await request(app)
                .post('/api/packs/test-pack/unlock')
                .set('Cookie', cookie);

            expect(res.status).toBe(200);
            expect(res.body.unlocked).toBe(true);
            expect(res.body.source).toBe('free');
            expect(prismaMock.userPack.upsert).not.toHaveBeenCalled();
        });
    });

    describe('packs premium', () => {
        it('devuelve 402 si el pack es premium y no hay paymentToken', async () => {
            prismaMock.pack.findUnique.mockResolvedValue(premiumPack);

            const res = await request(app)
                .post('/api/packs/premium-pack/unlock')
                .set('Cookie', cookie)
                .send({});

            expect(res.status).toBe(402);
            expect(res.body.code).toBe('PAYMENT_REQUIRED');
        });

        it('desbloquea el pack premium si se proporciona paymentToken', async () => {
            prismaMock.pack.findUnique.mockResolvedValue(premiumPack);
            prismaMock.userPack.upsert.mockResolvedValue(
                makeUserPack({ packId: premiumPack.id, userId: user.id, source: 'purchase' })
            );

            const res = await request(app)
                .post('/api/packs/premium-pack/unlock')
                .set('Cookie', cookie)
                .send({ paymentToken: 'pi_test_token_123' });

            expect(res.status).toBe(200);
            expect(res.body.unlocked).toBe(true);
            expect(res.body.source).toBe('purchase');
            expect(prismaMock.userPack.upsert).toHaveBeenCalledTimes(1);
        });
    });

    describe('pack no encontrado', () => {
        it('devuelve 404 si el pack no existe', async () => {
            prismaMock.pack.findUnique.mockResolvedValue(null);

            const res = await request(app)
                .post('/api/packs/nonexistent-pack/unlock')
                .set('Cookie', cookie);

            expect(res.status).toBe(404);
            expect(res.body.code).toBe('NOT_FOUND');
        });

        it('devuelve 404 si el pack existe pero no está activo', async () => {
            prismaMock.pack.findUnique.mockResolvedValue({ ...freePack, isActive: false });

            const res = await request(app)
                .post('/api/packs/test-pack/unlock')
                .set('Cookie', cookie);

            expect(res.status).toBe(404);
            expect(res.body.code).toBe('NOT_FOUND');
        });
    });

    describe('sin autenticación', () => {
        it('devuelve 401 sin cookie', async () => {
            const res = await request(app).post('/api/packs/test-pack/unlock');
            expect(res.status).toBe(401);
        });
    });
});