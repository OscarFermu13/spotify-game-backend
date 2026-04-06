const { isValidId, isValidSlug, isValidSearchQuery } = require('../../utils/validate');

describe('isValidId', () => {
  it('acepta un cuid válido', () => {
    expect(isValidId('clh1234567890abcdefghij')).toBe(true);
  });

  it('rechaza una string vacía', () => {
    expect(isValidId('')).toBe(false);
  });

  it('rechaza un UUID (formato distinto a cuid)', () => {
    expect(isValidId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('rechaza null', () => {
    expect(isValidId(null)).toBe(false);
  });

  it('rechaza un número', () => {
    expect(isValidId(123)).toBe(false);
  });

  it('rechaza strings con caracteres especiales', () => {
    expect(isValidId('clh123<script>alert(1)</script>')).toBe(false);
  });
});

describe('isValidSlug', () => {
  it('acepta un slug válido', () => {
    expect(isValidSlug('90s-rock')).toBe(true);
    expect(isValidSlug('reggaeton')).toBe(true);
    expect(isValidSlug('pack-2024')).toBe(true);
  });

  it('rechaza mayúsculas', () => {
    expect(isValidSlug('Rock-Pack')).toBe(false);
  });

  it('rechaza strings demasiado cortas', () => {
    expect(isValidSlug('a')).toBe(false);
  });

  it('rechaza strings demasiado largas', () => {
    expect(isValidSlug('a'.repeat(61))).toBe(false);
  });

  it('rechaza caracteres especiales', () => {
    expect(isValidSlug('pack<script>')).toBe(false);
    expect(isValidSlug('pack/name')).toBe(false);
  });

  it('rechaza null', () => {
    expect(isValidSlug(null)).toBe(false);
  });
});

describe('isValidSearchQuery', () => {
  it('acepta una búsqueda normal', () => {
    expect(isValidSearchQuery('Bohemian Rhapsody')).toBe(true);
  });

  it('acepta una búsqueda de un carácter', () => {
    expect(isValidSearchQuery('a')).toBe(true);
  });

  it('acepta hasta 200 caracteres', () => {
    expect(isValidSearchQuery('a'.repeat(200))).toBe(true);
  });

  it('rechaza más de 200 caracteres', () => {
    expect(isValidSearchQuery('a'.repeat(201))).toBe(false);
  });

  it('rechaza una string vacía', () => {
    expect(isValidSearchQuery('')).toBe(false);
  });

  it('rechaza una string de solo espacios', () => {
    expect(isValidSearchQuery('   ')).toBe(false);
  });

  it('rechaza null', () => {
    expect(isValidSearchQuery(null)).toBe(false);
  });
});