# Audio Asset Worker

External processing service for the Audio Asset Pipeline. Runs FFmpeg transcoding and writes derived assets to Supabase Storage + Postgres.

Concurrent jobs for the same track are deduplicated via **PostgreSQL advisory locks** (`pg_try_advisory_lock`) — duplicate webhooks return 202 and skip processing.

## Endpoints

- `GET /health` — liveness
- `POST /jobs/process-track` — run pipeline for one track (async, returns 202)
- `POST /jobs/regenerate` — same as process-track (idempotent)

Auth: `Authorization: Bearer $ASSET_WORKER_WEBHOOK_SECRET`

## Environment

| Variable                      | Description                  |
| ----------------------------- | ---------------------------- |
| `DATABASE_URL`                | Postgres connection string   |
| `SUPABASE_URL`                | Supabase project URL         |
| `SUPABASE_SERVICE_ROLE_KEY`   | Service role key for storage |
| `ASSET_WORKER_WEBHOOK_SECRET` | Shared secret with Netlify   |
| `PORT`                        | HTTP port (default 8080)     |

## Local development

```bash
cd services/audio-asset-worker
npm install
npm run dev
```

Requires `ffmpeg` and `ffprobe` on PATH.

## Docker

```bash
docker build -t audio-asset-worker .
docker run -p 8080:8080 --env-file .env audio-asset-worker
```

## Netlify integration

Set on Netlify:

- `ASSET_WORKER_URL` — public URL of this service
- `ASSET_WORKER_WEBHOOK_SECRET` — same secret as worker

Upload flow enqueues jobs via `netlify/functions/lib/enqueueTrackProcessing.ts`.
