const { encrypt } = require('../../utils/tokenCrypto');
const { makeJwt } = require('../../utils/jwt');

function makeUser(overrides = {}) {
    return {
        id: 'cluser123456789abcdefgh',
        spotifyId: 'spotify-user-123',
        displayName: 'Test User',
        accessToken: encrypt('fake-access-token'),
        refreshToken: encrypt('fake-refresh-token'),
        createdAt: new Date(),
        ...overrides,
    };
}

function makeSession(overrides = {}) {
    return {
        id: 'clsession12345678abcdef',
        playlistUrl: 'https://open.spotify.com/playlist/test',
        isPublic: true,
        penalty: 5,
        source: 'custom',
        ownerId: 'cluser123456789abcdefgh',
        dailyDate: null,
        packId: null,
        createdAt: new Date(),
        tracks: [],
        owner: makeUser(),
        ...overrides,
    };
}

function makeGame(overrides = {}) {
    return {
        id: 'clgame1234567890abcdefg',
        userId: 'cluser123456789abcdefgh',
        sessionId: 'clsession12345678abcdef',
        totalTime: null,
        completed: false,
        createdAt: new Date(),
        tracks: [],
        ...overrides,
    };
}

function makeTrack(overrides = {}) {
    return {
        id: 'cltrack123456789abcdefg',
        sessionId: 'clsession12345678abcdef',
        order: 0,
        trackId: 'spotify-track-id-123456',
        name: 'Test Song',
        artists: 'Test Artist',
        uri: 'spotify:track:testtrackid1234567890ab',
        albumJson: { images: [{ url: 'https://example.com/cover.jpg' }] },
        durationMs: 200000,
        ...overrides,
    };
}

function makeAuthCookie(user) {
    const token = makeJwt({ userId: user.id, spotifyId: user.spotifyId });
    return `jwt=${token}`;
}

module.exports = { makeUser, makeSession, makeGame, makeTrack, makeAuthCookie };