FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev

RUN npx prisma generate

COPY src ./src

EXPOSE 4000

CMD ["node", "src/server.js"]