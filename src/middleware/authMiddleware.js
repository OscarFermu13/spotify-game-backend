const { verifyJwt } = require('../utils/jwt');
const prisma = require('../prisma/client');
const { decrypt } = require('../utils/tokenCrypto');

async function authMiddleware(req, res, next) {
  const token =
    req.cookies?.jwt ||
    req.headers.authorization?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = verifyJwt(token);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(401).json({ error: 'Invalid user' });

    req.user = {
      ...user,
      accessToken: user.accessToken ? decrypt(user.accessToken) : null,
      refreshToken: user.refreshToken ? decrypt(user.refreshToken) : null,
    };

    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = authMiddleware;