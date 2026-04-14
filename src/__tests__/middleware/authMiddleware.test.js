jest.mock('../../prisma/client', () => require('../mocks/prisma'));

const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const authMiddleware = require('../../middleware/authMiddleware');
const prismaMock = require('../mocks/prisma');
const { makeUser, makeAuthCookie } = require('../mocks/factories');
const { makeJwt } = require('../../utils/jwt');

// App mínima para testear el middleware
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.get('/protected', authMiddleware, (req, res) => {
    res.json({ userId: req.user.id });
  });
  return app;
}

describe('authMiddleware', () => {
  const user = makeUser();
  const app = makeApp();

  describe('sin token', () => {
    it('devuelve 401 con code NO_TOKEN', async () => {
      const res = await request(app).get('/protected');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_TOKEN');
    });
  });

  describe('con token inválido', () => {
    it('devuelve 401 con code INVALID_TOKEN para token aleatorio', async () => {
      const res = await request(app)
        .get('/protected')
        .set('Cookie', 'jwt=not-a-valid-token');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    it('devuelve 401 con code INVALID_TOKEN para token con firma incorrecta', async () => {
      const jwt = require('jsonwebtoken');
      const wrongToken = jwt.sign({ userId: user.id }, 'wrong-secret');
      const res = await request(app)
        .get('/protected')
        .set('Cookie', `jwt=${wrongToken}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });

    it('devuelve 401 con code INVALID_TOKEN para token expirado', async () => {
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign({ userId: user.id }, 'test-secret-for-jest', { expiresIn: '-1s' });
      const res = await request(app)
        .get('/protected')
        .set('Cookie', `jwt=${expiredToken}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_TOKEN');
    });
  });

  describe('con token válido', () => {
    it('devuelve 401 con code INVALID_USER si el usuario no existe en DB', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      const res = await request(app)
        .get('/protected')
        .set('Cookie', makeAuthCookie(user));
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_USER');
    });

    it('llama a next() y adjunta req.user si todo es correcto', async () => {
      prismaMock.user.findUnique.mockResolvedValue(user);
      const res = await request(app)
        .get('/protected')
        .set('Cookie', makeAuthCookie(user));
      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(user.id);
    });

    it('acepta el token por header Authorization', async () => {
      prismaMock.user.findUnique.mockResolvedValue(user);
      const token = makeJwt({ userId: user.id, spotifyId: user.spotifyId });
      const res = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });

    it('NO acepta el token por query string', async () => {
      const token = makeJwt({ userId: user.id, spotifyId: user.spotifyId });
      const res = await request(app)
        .get(`/protected?token=${token}`);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('NO_TOKEN');
    });
  });
});