const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config');

function makeJwt(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyJwt(token) {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
}

module.exports = { makeJwt, verifyJwt };