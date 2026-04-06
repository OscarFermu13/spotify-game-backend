const { parsePlaylistId, fisherYatesShuffle } = require('../../utils/helpers');

describe('parsePlaylistId', () => {
  it('parsea una URL estándar de Spotify', () => {
    const url = 'https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF';
    expect(parsePlaylistId(url)).toBe('37i9dQZEVXbMDoHDwVN2tF');
  });

  it('parsea una URL con query params', () => {
    const url = 'https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF?si=abc123';
    expect(parsePlaylistId(url)).toBe('37i9dQZEVXbMDoHDwVN2tF');
  });

  it('parsea un URI de Spotify', () => {
    expect(parsePlaylistId('spotify:playlist:37i9dQZEVXbMDoHDwVN2tF')).toBe('37i9dQZEVXbMDoHDwVN2tF');
  });

  it('parsea una URL con espacios al inicio y al final', () => {
    const url = '  https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF  ';
    expect(parsePlaylistId(url)).toBe('37i9dQZEVXbMDoHDwVN2tF');
  });

  it('devuelve null para una URL sin playlist/', () => {
    expect(parsePlaylistId('https://open.spotify.com/track/abc')).toBeNull();
  });

  it('devuelve null para una string vacía', () => {
    expect(parsePlaylistId('')).toBeNull();
  });

  it('devuelve null para una URL malformada', () => {
    expect(parsePlaylistId('not-a-url')).toBeNull();
  });

  it('devuelve null para null', () => {
    expect(parsePlaylistId(null)).toBeNull();
  });
});

describe('fisherYatesShuffle', () => {
  it('devuelve un array de la misma longitud', () => {
    const arr    = [1, 2, 3, 4, 5];
    const result = fisherYatesShuffle([...arr]);
    expect(result).toHaveLength(arr.length);
  });

  it('contiene los mismos elementos', () => {
    const arr    = [1, 2, 3, 4, 5];
    const result = fisherYatesShuffle([...arr]);
    expect(result.sort((a, b) => a - b)).toEqual(arr);
  });

  it('maneja arrays vacíos', () => {
    expect(fisherYatesShuffle([])).toEqual([]);
  });

  it('maneja arrays de un elemento', () => {
    expect(fisherYatesShuffle([42])).toEqual([42]);
  });
});