const { verifyJwt } = require('../utils/jwt');
const prisma = require('../prisma/client');
const { decrypt } = require('../utils/tokenCrypto');
const { sendError, ERROR_CODES } = require('../utils/errors');

async function authMiddleware(req, res, next) {
  const token =
    req.cookies?.jwt ||
    req.headers.authorization?.split(' ')[1];

  if (!token) return sendError(res, 401, ERROR_CODES.NO_TOKEN, 'No token provided');

  try {
    const decoded = verifyJwt(token);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return sendError(res, 401, ERROR_CODES.INVALID_USER, 'Invalid user');

    req.user = {
      ...user,
      accessToken: user.accessToken ? decrypt(user.accessToken) : null,
      refreshToken: user.refreshToken ? decrypt(user.refreshToken) : null,
    };

    next();
  } catch {
    return sendError(res, 401, ERROR_CODES.INVALID_TOKEN, 'Invalid token');
  }
}

module.exports = authMiddleware;