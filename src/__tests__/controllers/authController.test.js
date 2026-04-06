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
jest.mock('axios');

const request = require('supertest');
const axios = require('axios');
const express = require('express');
const cookieParser = require('cookie-parser');
const { login, callback, logout } = require('../../controllers/authController');
const prismaMock = require('../mocks/prisma');
const { makeUser } = require('../mocks/factories');

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.get('/auth/login', login);
    app.get('/auth/callback', callback);
    app.post('/auth/logout', logout);
    return app;
}

describe('GET /auth/login', () => {
    const app = makeApp();

    it('redirige a accounts.spotify.com', async () => {
        const res = await request(app).get('/auth/login');
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('accounts.spotify.com/authorize');
    });

    it('incluye client_id en la URL de redirección', async () => {
        const res = await request(app).get('/auth/login');
        expect(res.headers.location).toContain('client_id=test-client-id');
    });

    it('establece la cookie oauth_state', async () => {
        const res = await request(app).get('/auth/login');
        expect(res.headers['set-cookie']).toBeDefined();
        expect(res.headers['set-cookie'].some((c) => c.startsWith('oauth_state='))).toBe(true);
    });

    it('incluye show_dialog=true si switch_account=true', async () => {
        const res = await request(app).get('/auth/login?switch_account=true');
        expect(res.headers.location).toContain('show_dialog=true');
    });

    it('NO incluye show_dialog sin switch_account', async () => {
        const res = await request(app).get('/auth/login');
        expect(res.headers.location).not.toContain('show_dialog');
    });
});

describe('GET /auth/callback', () => {
    const app = makeApp();
    const user = makeUser();

    it('devuelve 403 si el state no coincide', async () => {
        const res = await request(app)
            .get('/auth/callback?code=abc&state=wrong-state')
            .set('Cookie', 'oauth_state=correct-state');
        expect(res.status).toBe(403);
        expect(res.text).toContain('state mismatch');
    });

    it('devuelve 403 si no hay cookie oauth_state', async () => {
        const res = await request(app)
            .get('/auth/callback?code=abc&state=some-state');
        expect(res.status).toBe(403);
    });

    it('devuelve 400 si no hay code', async () => {
        const res = await request(app)
            .get('/auth/callback?state=test-state')
            .set('Cookie', 'oauth_state=test-state');
        expect(res.status).toBe(400);
    });

    it('redirige al frontend tras autenticación correcta', async () => {
        // Mock de Spotify token endpoint
        axios.post.mockResolvedValueOnce({
            data: { access_token: 'fake-access', refresh_token: 'fake-refresh' },
        });
        // Mock de Spotify /me
        axios.get.mockResolvedValueOnce({
            data: { id: 'spotify-123', display_name: 'Test User' },
        });
        // Mock de Prisma upsert
        prismaMock.user.upsert.mockResolvedValue(user);

        const res = await request(app)
            .get('/auth/callback?code=valid-code&state=test-state')
            .set('Cookie', 'oauth_state=test-state');

        expect(res.status).toBe(302);
        expect(res.headers.location).toBe('http://localhost:5173');
    });

    it('establece la cookie jwt tras autenticación correcta', async () => {
        axios.post.mockResolvedValueOnce({
            data: { access_token: 'fake-access', refresh_token: 'fake-refresh' },
        });
        axios.get.mockResolvedValueOnce({
            data: { id: 'spotify-123', display_name: 'Test User' },
        });
        prismaMock.user.upsert.mockResolvedValue(user);

        const res = await request(app)
            .get('/auth/callback?code=valid-code&state=test-state')
            .set('Cookie', 'oauth_state=test-state');

        const cookies = res.headers['set-cookie'] || [];
        expect(cookies.some((c) => c.startsWith('jwt='))).toBe(true);
    });

    it('devuelve 500 si Spotify falla', async () => {
        axios.post.mockRejectedValueOnce(new Error('Spotify down'));

        const res = await request(app)
            .get('/auth/callback?code=valid-code&state=test-state')
            .set('Cookie', 'oauth_state=test-state');

        expect(res.status).toBe(500);
    });
});

describe('POST /auth/logout', () => {
    const app = makeApp();

    it('devuelve 200 con ok: true', async () => {
        const res = await request(app).post('/auth/logout');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('limpia la cookie jwt', async () => {
        const res = await request(app).post('/auth/logout');
        const cookies = res.headers['set-cookie'] || [];
        const jwtCookie = cookies.find((c) => c.startsWith('jwt='));
        expect(jwtCookie).toBeDefined();
        // Una cookie limpiada tiene Max-Age=0 o Expires en el pasado
        expect(jwtCookie).toMatch(/Max-Age=0|Expires=.*1970/);
    });
});