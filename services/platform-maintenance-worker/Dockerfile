FROM node:22-bookworm-slim

WORKDIR /app

COPY services/platform-maintenance-worker/package.json services/platform-maintenance-worker/
COPY src/shared/lib/tracks/storagePathReference.ts /app/src/shared/lib/tracks/storagePathReference.ts

WORKDIR /app/services/platform-maintenance-worker
RUN npm install

COPY services/platform-maintenance-worker/src ./src
RUN npm run build

ENV NODE_ENV=production
EXPOSE 8081

CMD ["node", "dist/index.js"]
