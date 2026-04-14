process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);

jest.mock('../../config', () => ({
  JWT_SECRET: 'test-secret-for-jest',
  TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
}));

const { makeJwt, verifyJwt } = require('../../utils/jwt');

describe('makeJwt', () => {
  it('devuelve una string con formato JWT (tres partes separadas por puntos)', () => {
    const token = makeJwt({ userId: 'user-123', spotifyId: 'spotify-abc' });
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('incluye el payload en el token', () => {
    const payload = { userId: 'user-123', spotifyId: 'spotify-abc' };
    const token = makeJwt(payload);
    const decoded = verifyJwt(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.spotifyId).toBe(payload.spotifyId);
  });
});

describe('verifyJwt', () => {
  it('verifica un token válido y devuelve el payload', () => {
    const payload = { userId: 'abc', spotifyId: 'xyz' };
    const token = makeJwt(payload);
    const decoded = verifyJwt(token);
    expect(decoded.userId).toBe('abc');
    expect(decoded.spotifyId).toBe('xyz');
  });

  it('lanza error con un token manipulado', () => {
    const token = makeJwt({ userId: 'abc' });
    const parts = token.split('.');
    parts[1] = Buffer.from(JSON.stringify({ userId: 'hacker' })).toString('base64');
    const tampered = parts.join('.');
    expect(() => verifyJwt(tampered)).toThrow();
  });

  it('lanza error con un token firmado con secret distinto', () => {
    const jwt = require('jsonwebtoken');
    const wrongToken = jwt.sign({ userId: 'abc' }, 'wrong-secret');
    expect(() => verifyJwt(wrongToken)).toThrow();
  });

  it('lanza error con un token expirado', () => {
    const jwt = require('jsonwebtoken');
    const expiredToken = jwt.sign({ userId: 'abc' }, 'test-secret-for-jest', { expiresIn: '-1s' });
    expect(() => verifyJwt(expiredToken)).toThrow();
  });

  it('lanza error con una string aleatoria', () => {
    expect(() => verifyJwt('not-a-jwt')).toThrow();
  });

  it('lanza error con string vacía', () => {
    expect(() => verifyJwt('')).toThrow();
  });
});

describe('makeJwt → verifyJwt (round-trip)', () => {
  it('round-trip con userId estándar', () => {
    const payload = { userId: 'cluser123', spotifyId: 'spotify456' };
    expect(verifyJwt(makeJwt(payload)).userId).toBe(payload.userId);
  });
});