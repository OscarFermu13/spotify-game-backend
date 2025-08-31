// prisma/client.js
const { PrismaClient } = require('@prisma/client');

// Crear una sola instancia de Prisma
const prisma = new PrismaClient();

module.exports = prisma;
