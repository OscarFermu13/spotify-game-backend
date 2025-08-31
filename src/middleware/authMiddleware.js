const { verifyJwt } = require('../utils/jwt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = verifyJwt(token);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(401).json({ error: 'Invalid user' });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = authMiddleware;
