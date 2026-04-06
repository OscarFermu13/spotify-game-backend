const prisma = require('../prisma/client');
const { seededFisherYates } = require('../utils/prng');
const { fetchPlaylistTracksOrdered, refreshAccessToken } = require('../services/spotify');
const { isValidSlug } = require('../utils/validate');
const { sendError, ERROR_CODES } = require('../utils/errors');

// ── GET /api/packs ────────────────────────────────────────────────────────────
// Returns all active packs with the current user's access status.
async function listPacks(req, res) {
  try {
    const packs = await prisma.pack.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
    });

    // Check which packs the user has unlocked
    const userPacks = await prisma.userPack.findMany({
      where: {
        userId: req.user.id,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      select: { packId: true, source: true, expiresAt: true },
    });

    const unlockedMap = Object.fromEntries(
      userPacks.map((up) => [up.packId, { source: up.source, expiresAt: up.expiresAt }])
    );

    const result = packs.map((pack) => {
      const unlocked = pack.tier === 'free' || !!unlockedMap[pack.id];
      return {
        id: pack.id,
        slug: pack.slug,
        name: pack.name,
        description: pack.description,
        imageUrl: pack.imageUrl,
        trackCount: pack.trackCount,
        tier: pack.tier,
        price: pack.price ? Number(pack.price) : null,
        currency: pack.currency,
        tags: pack.tags,
        unlocked,
        unlockedSource: unlockedMap[pack.id]?.source ?? (pack.tier === 'free' ? 'free' : null),
        expiresAt: unlockedMap[pack.id]?.expiresAt ?? null,
      };
    });

    res.json(result);
  } catch (e) {
    console.error('listPacks error:', e.message);
    sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Failed to list packs');
  }
}

// ── GET /api/packs/:slug ──────────────────────────────────────────────────────
async function getPack(req, res) {
  try {
    if (!isValidSlug(req.params.slug)) return sendError(res, 400, ERROR_CODES.INVALID_SLUG, 'Invalid pack slug');
    const pack = await prisma.pack.findUnique({ where: { slug: req.params.slug } });
    if (!pack || !pack.isActive) return sendError(res, 404, ERROR_CODES.NOT_FOUND, 'Pack not found');

    const unlocked = pack.tier === 'free' || await prisma.userPack.findFirst({
      where: {
        userId: req.user.id, packId: pack.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    }).then(Boolean);

    res.json({ ...pack, price: pack.price ? Number(pack.price) : null, unlocked });
  } catch (e) {
    console.error('getPack error:', e.message);
    sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Failed to get pack');
  }
}

// ── POST /api/packs/:slug/play ────────────────────────────────────────────────
// Creates a new GameSession from a pack and returns a gameId.
// Each call generates a freshly-shuffled session (random seed = Date.now()).
async function playPack(req, res) {
  try {
    if (!isValidSlug(req.params.slug)) return sendError(res, 400, ERROR_CODES.INVALID_SLUG, 'Invalid pack slug');

    const pack = await prisma.pack.findUnique({ where: { slug: req.params.slug } });
    if (!pack || !pack.isActive) return sendError(res, 404, ERROR_CODES.NOT_FOUND, 'Pack not found');

    // Access check
    if (pack.tier !== 'free') {
      const access = await prisma.userPack.findFirst({
        where: {
          userId: req.user.id, packId: pack.id,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (!access) return sendError(res, 403, ERROR_CODES.ACCESS_DENIED, 'Pack not unlocked');
    }

    if (!Number.isInteger(pack.trackCount) || pack.trackCount < 1) {
      console.error(`Pack ${pack.slug} has invalid trackCount: ${pack.trackCount}`);
      return sendError(res, 500, ERROR_CODES.CONFIG_ERROR, 'Pack configuration error');
    }

    // Fetch tracks from Spotify
    const playlistId = pack.playlistUrl.split('playlist/')[1]?.split('?')[0];
    if (!playlistId) return sendError(res, 500, ERROR_CODES.CONFIG_ERROR, 'Invalid playlist URL in pack');

    let accessToken = req.user.accessToken;
    if (!accessToken) {
      accessToken = await refreshAccessToken(req.user);
      if (!accessToken) return sendError(res, 500, ERROR_CODES.NO_SPOTIFY_TOKEN, 'No valid Spotify token');
    }

    const allTracks = await fetchPlaylistTracksOrdered({ accessToken, playlistId, limit: 100 });
    if (!allTracks.length) {
      return sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Pack playlist has no tracks');
    }

    if (allTracks.length < pack.trackCount) {
      console.warn(`Pack ${pack.slug}: playlist has ${allTracks.length} tracks but trackCount is ${pack.trackCount}. Using all available.`);
    }

    // Random seed per play so each session is different
    const seed = `${pack.slug}-${Date.now()}`;
    const shuffled = seededFisherYates([...allTracks], seed);
    const selected = shuffled.slice(0, pack.trackCount);

    // Create session + game atomically
    const session = await prisma.gameSession.create({
      data: {
        playlistUrl: pack.playlistUrl,
        isPublic: false,
        source: 'pack',
        packId: pack.id,
        ownerId: req.user.id,
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
      include: { tracks: { orderBy: { order: 'asc' } } },
    });

    const game = await prisma.game.create({
      data: { sessionId: session.id, userId: req.user.id },
    });

    res.json({
      sessionId: session.id,
      gameId: game.id,
      tracks: session.tracks,
      packSlug: pack.slug,
      packName: pack.name,
    });
  } catch (e) {
    console.error('playPack error:', e.message);
    sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Failed to start pack session');
  }
}

// ── POST /api/packs/:slug/unlock ──────────────────────────────────────────────
// Unlocks a pack for the current user (free packs auto-unlock; premium needs
// payment verification — placeholder for future Stripe integration).
async function unlockPack(req, res) {
  try {
    if (!isValidSlug(req.params.slug)) return sendError(res, 400, ERROR_CODES.INVALID_SLUG, 'Invalid pack slug');

    const pack = await prisma.pack.findUnique({ where: { slug: req.params.slug } });
    if (!pack || !pack.isActive) return sendError(res, 404, ERROR_CODES.NOT_FOUND, 'Pack not found');

    if (pack.tier === 'free') {
      // Free packs don't need a UserPack row — they're always accessible.
      return res.json({ unlocked: true, source: 'free' });
    }

    // Premium: verify payment token from body (Stripe payment_intent, etc.)
    const { paymentToken } = req.body;
    if (!paymentToken) {
      return sendError(res, 402, ERROR_CODES.PAYMENT_REQUIRED, 'Payment required');
    }

    // TODO: verify paymentToken with Stripe before creating UserPack

    const userPack = await prisma.userPack.upsert({
      where: { userId_packId: { userId: req.user.id, packId: pack.id } },
      update: { unlockedAt: new Date(), source: 'purchase', priceCharged: pack.price },
      create: {
        userId: req.user.id,
        packId: pack.id,
        source: 'purchase',
        priceCharged: pack.price,
      },
    });

    res.json({ unlocked: true, source: userPack.source });
  } catch (e) {
    console.error('unlockPack error:', e.message);
    sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, 'Failed to unlock pack');
  }
}

module.exports = { listPacks, getPack, playPack, unlockPack };