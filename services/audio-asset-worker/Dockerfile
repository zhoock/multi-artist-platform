FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Worker package + shared pipeline config from monorepo root
COPY services/audio-asset-worker/package.json services/audio-asset-worker/
COPY src/shared/lib/audio /app/src/shared/lib/audio
COPY src/shared/lib/tracks/trackStoragePaths.ts /app/src/shared/lib/tracks/trackStoragePaths.ts

WORKDIR /app/services/audio-asset-worker
RUN npm install

COPY services/audio-asset-worker/src ./src
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8090
EXPOSE 8090

CMD ["node", "dist/index.js"]
