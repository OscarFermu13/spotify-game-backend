jest.mock('../../prisma/client', () => require('../mocks/prisma'));

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const authMiddleware = require('../../middleware/authMiddleware');
const { saveGame } = require('../../controllers/gameController');
const prismaMock = require('../mocks/prisma');
const { makeUser, makeGame, makeAuthCookie } = require('../mocks/factories');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.post('/api/game/save', authMiddleware, saveGame);
    return app;
}

// ── POST /api/game/save ────────────────────────────────────────

describe('POST /api/game/save', () => {
    const user = makeUser();
    const game = makeGame({ userId: user.id });
    const app = makeApp();
    const cookie = makeAuthCookie(user);

    const validPayload = {
        gameId: game.id,
        totalTime: 42.5,
        tracks: [
            { trackId: 'track-1', guessed: true, skipped: false, timeTaken: 10.5, baseTime: 10.5, hintCost: 0 },
            { trackId: 'track-2', guessed: false, skipped: true, timeTaken: 15.0, baseTime: 10.0, hintCost: 0 },
        ],
    };

    beforeEach(() => {
        prismaMock.user.findUnique.mockResolvedValue(user);
    });

    describe('payload inválido', () => {
        it('devuelve 400 si falta gameId', async () => {
            const res = await request(app)
                .post('/api/game/save')
                .set('Cookie', cookie)
                .send({ totalTime: 10, tracks: [] });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_PAYLOAD');
        });

        it('devuelve 400 si totalTime no es número', async () => {
            const res = await request(app)
                .post('/api/game/save')
                .set('Cookie', cookie)
                .send({ gameId: game.id, totalTime: 'fast', tracks: [] });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_PAYLOAD');
        });

        it('devuelve 400 si tracks no es array', async () => {
            const res = await request(app)
                .post('/api/game/save')
                .set('Cookie', cookie)
                .send({ gameId: game.id, totalTime: 10, tracks: 'not-array' });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_PAYLOAD');
        });

        it('devuelve 400 si el gameId no tiene formato cuid', async () => {
            const res = await request(app)
                .post('/api/game/save')
                .set('Cookie', cookie)
                .send({ ...validPayload, gameId: 'invalid-id' });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_ID');
        });
    });

    describe('partida no encontrada o no autorizada', () => {
        it('devuelve 404 si la partida no existe', async () => {
            prismaMock.game.findUnique.mockResolvedValue(null);
            const res = await request(app)
                .post('/api/game/save')
                .set('Cookie', cookie)
                .send(validPayload);
            expect(res.status).toBe(404);
            expect(res.body.code).toBe('NOT_FOUND');
        });

        it('devuelve 404 si la partida pertenece a otro usuario', async () => {
            prismaMock.game.findUnique.mockResolvedValue({
                ...game,
                userId: 'clother-user-id-123456789',
            });
            const res = await request(app)
                .post('/api/game/save')
                .set('Cookie', cookie)
                .send(validPayload);
            expect(res.status).toBe(404);
            expect(res.body.code).toBe('NOT_FOUND');
        });
    });

    describe('partida ya completada', () => {
        it('devuelve 409 con code ALREADY_COMPLETED', async () => {
            prismaMock.game.findUnique.mockResolvedValue({ ...game, completed: true });
            const res = await request(app)
                .post('/api/game/save')
                .set('Cookie', cookie)
                .send(validPayload);
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('ALREADY_COMPLETED');
        });
    });

    describe('guardado correcto', () => {
        beforeEach(() => {
            prismaMock.game.findUnique.mockResolvedValue(game);
            prismaMock.$transaction.mockReset();
            prismaMock.$transaction.mockResolvedValue([{}, {}, { id: game.id, completed: true }]);
        });

        it('devuelve 200 con ok: true en el primer guardado', async () => {
            prismaMock.game.findUnique.mockResolvedValue(game);
            prismaMock.$transaction.mockResolvedValue([{}, {}, { id: game.id, completed: true }]);

            const res = await request(app)
                .post('/api/game/save')
                .set('Cookie', cookie)
                .send(validPayload);

            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.gameId).toBe(game.id);
        });

        it('llama a $transaction con deleteMany, createMany y update', async () => {
            prismaMock.game.findUnique.mockResolvedValue(game);
            prismaMock.$transaction.mockResolvedValue([{}, {}, {}]);

            await request(app)
                .post('/api/game/save')
                .set('Cookie', cookie)
                .send(validPayload);

            expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
        });
    });

    describe('sin autenticación', () => {
        it('devuelve 401 sin cookie', async () => {
            const res = await request(app)
                .post('/api/game/save')
                .send(validPayload);
            expect(res.status).toBe(401);
        });
    });
});