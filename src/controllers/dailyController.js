// src/controllers/dailyController.js
const prisma = require('../prisma/client');
const { fetchPlaylistTracksOrdered, refreshAccessToken } = require('../services/spotify');
const { fisherYatesShuffle } = require('../utils/helpers');
const { DAILY_PLAYLIST_URL, DAILY_TRACK_COUNT, CRON_SECRET } = require('../config');

function todayUTC() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

// ── GET /api/daily ───────────────────────────────────────────────────────────
async function getDaily(req, res) {
  try {
    const today = todayUTC();
 
    let session = await prisma.gameSession.findUnique({
      where: { dailyDate: today },
      include: { tracks: { orderBy: { order: 'asc' } }, owner: true },
    });
 
    if (!session) {

      session = await generateDailySession(req.user, today);
    }
 
    // Find any existing game for this user (completed or not)
    let game = await prisma.game.findFirst({
      where: { sessionId: session.id, userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
 
    const alreadyCompleted = game?.completed ?? false;
 
    // Only create a new game if the user has never joined this session
    if (!game) {
      game = await prisma.game.create({
        data: { sessionId: session.id, userId: req.user.id },
      });
    }
 
    // Count unique players (one per user, regardless of how many Game rows they have)
    const playerCount = await prisma.game.groupBy({
      by: ['userId'],
      where: { sessionId: session.id },
    }).then((rows) => rows.length);
 
    res.json({
      sessionId: session.id,
      gameId: game.id,
      dailyDate: session.dailyDate,
      alreadyCompleted,
      playerCount,
      tracks: session.tracks,
    });
  } catch (e) {
    console.error('getDaily error:', e.message, e.stack);
    res.status(500).json({ error: e.message || 'Failed to get daily challenge' });
  }
}

// ── POST /api/daily/generate ─────────────────────────────────────────────────
async function generateDaily(req, res) {
  const secret = req.headers['x-cron-secret'];
  if (!secret || secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const tomorrow = todayUTC();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const existing = await prisma.gameSession.findUnique({
      where: { dailyDate: tomorrow },
    });
    if (existing) {
      return res.json({ message: 'Already generated', sessionId: existing.id });
    }

    // Use the first admin user in the DB as the session owner
    const owner = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!owner) return res.status(500).json({ error: 'No users in DB' });

    const session = await generateDailySession(owner, tomorrow);
    res.json({ sessionId: session.id, dailyDate: tomorrow });
  } catch (e) {
    console.error('generateDaily error:', e.message);
    res.status(500).json({ error: 'Failed to generate daily challenge' });
  }
}

// ── Shared helper ─────────────────────────────────────────────────────────────
async function generateDailySession(user, date) {
  // Refresh token if needed
  let accessToken = user.accessToken;
  if (!accessToken) {
    accessToken = await refreshAccessToken(user);
    if (!accessToken) throw new Error('No valid Spotify token for daily generation');
  }

  const playlistId = DAILY_PLAYLIST_URL.split('playlist/')[1]?.split('?')[0];
  if (!playlistId) throw new Error('Invalid DAILY_PLAYLIST_URL');

  const allTracks = await fetchPlaylistTracksOrdered({
    accessToken,
    playlistId,
    limit: 100,
  });

  // Use the date as a seed to get a deterministic shuffle for the day.
  // Simple seeded shuffle: sort by hash of (trackId + dateStr).
  const dateStr = date.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const seededTracks = seededFisherYates([...allTracks], dateStr);
  const selected = seededTracks.slice(0, DAILY_TRACK_COUNT);

  return prisma.gameSession.create({
    data: {
      playlistUrl: DAILY_PLAYLIST_URL,
      isPublic: true,
      source: 'daily',
      dailyDate: date,
      ownerId: user.id,
      tracks: {
        create: selected.map((t, idx) => ({
          order: idx,
          trackId: t.id,
          name: t.name,
          artists: t.artists,
          uri: t.uri,
          albumJson: t.album,
          durationMs: t.duration_ms,
        })),
      },
    },
    include: { tracks: { orderBy: { order: 'asc' } }, owner: true },
  });
}

// Mulberry32 — fast, high-quality 32-bit PRNG seeded with a single uint32.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
 
// Convert a string to a uint32 seed.
function strToSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
 
// Fisher-Yates shuffle seeded deterministically from dateStr.
// Produces a completely different permutation for each unique date.
function seededFisherYates(arr, dateStr) {
  const rand = mulberry32(strToSeed(dateStr));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { getDaily, generateDaily };