process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);

const { encrypt, decrypt } = require('../../utils/tokenCrypto');

describe('encrypt', () => {
  it('devuelve una string no vacía', () => {
    const result = encrypt('my-secret-token');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('tiene el formato iv:authTag:encrypted', () => {
    const result = encrypt('my-secret-token');
    const parts = result.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0].length).toBe(24);  // 12 bytes en hex
    expect(parts[1].length).toBe(32);  // 16 bytes en hex
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('produce resultados distintos cada vez (IV aleatorio)', () => {
    const r1 = encrypt('same-token');
    const r2 = encrypt('same-token');
    expect(r1).not.toBe(r2);
  });

  it('devuelve null para null', () => {
    expect(encrypt(null)).toBeNull();
  });

  it('devuelve null para undefined', () => {
    expect(encrypt(undefined)).toBeNull();
  });
});

describe('decrypt', () => {
  it('recupera el valor original', () => {
    const original = 'my-secret-spotify-token';
    const encrypted = encrypt(original);
    expect(decrypt(encrypted)).toBe(original);
  });

  it('funciona con tokens largos', () => {
    const longToken = 'BQD' + 'x'.repeat(200);
    expect(decrypt(encrypt(longToken))).toBe(longToken);
  });

  it('funciona con caracteres especiales', () => {
    const token = 'token-with-special_chars.and/slashes=equals';
    expect(decrypt(encrypt(token))).toBe(token);
  });

  it('lanza error con formato inválido', () => {
    expect(() => decrypt('invalid-format')).toThrow('Invalid encrypted token format');
  });

  it('lanza error si el ciphertext ha sido manipulado', () => {
    const encrypted = encrypt('original');
    const parts = encrypted.split(':');
    // Manipular el contenido cifrado
    parts[2] = 'ff'.repeat(parts[2].length / 2);
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  it('devuelve null para null', () => {
    expect(decrypt(null)).toBeNull();
  });

  it('devuelve null para undefined', () => {
    expect(decrypt(undefined)).toBeNull();
  });
});

describe('encrypt → decrypt (round-trip)', () => {
  const cases = [
    'short',
    'BQD' + 'a'.repeat(150),  // access token típico de Spotify
    'AQD' + 'b'.repeat(130),  // refresh token típico de Spotify
    'token with spaces',
    '1234567890',
  ];

  cases.forEach((token) => {
    it(`round-trip: "${token.slice(0, 20)}…"`, () => {
      expect(decrypt(encrypt(token))).toBe(token);
    });
  });
});