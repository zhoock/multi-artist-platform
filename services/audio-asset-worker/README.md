# Audio Asset Worker

External processing service for the Audio Asset Pipeline. Runs FFmpeg transcoding and writes derived assets to Supabase Storage + Postgres.

Concurrent jobs for the same track are deduplicated via **PostgreSQL advisory locks** (`pg_try_advisory_lock`) — duplicate webhooks return 202 and skip processing.

## Endpoints

- `GET /health` — liveness
- `POST /jobs/process-track` — run pipeline for one track (async, returns 202)
- `POST /jobs/regenerate` — same as process-track (idempotent)

Auth: `Authorization: Bearer $ASSET_WORKER_WEBHOOK_SECRET`

## Environment

| Variable                      | Description                                             |
| ----------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`                | Postgres connection string                              |
| `SUPABASE_URL`                | Supabase project URL                                    |
| `SUPABASE_SERVICE_ROLE_KEY`   | Service role key for storage                            |
| `ASSET_WORKER_WEBHOOK_SECRET` | Shared secret with Netlify                              |
| `PORT`                        | HTTP port (default **8090** locally; webpack uses 8080) |

## Local development

```bash
# From repo root (recommended — starts worker + Netlify together):
npm run dev:all

# Or only the worker (reads root .env automatically):
cd services/audio-asset-worker
npm install
npm run dev
```

Listens on **8090** by default (webpack dev server uses 8080). Set in root `.env`:

```bash
ASSET_WORKER_URL=http://localhost:8090
ASSET_WORKER_WEBHOOK_SECRET=same-secret-as-worker
```

Worker loads `../../.env` on startup — no manual `source` needed when using `npm run dev:worker` or `npm run dev:all`.

### Pipeline tracing (debug)

Detailed step-by-step logs use prefix `[pipeline-trace]`. Enabled by default; disable with:

```bash
AUDIO_PIPELINE_TRACE=0 npm run dev:worker
```

Logs include: pipeline stages, DB writes with `rowCount`, storage upload/download, and a DB snapshot of `track_assets` before `tracks.processing_status = ready`.

Requires `ffmpeg` and `ffprobe` on PATH.

## Docker

Build context is the **repo root** (shared pipeline config lives under `src/shared/`).

```bash
# From repo root
docker compose up --build audio-asset-worker
# or: npm run dev:docker:worker
```

Local full stack (Netlify + Docker worker): `npm run dev:docker` from repo root.

```bash
docker build -f services/audio-asset-worker/Dockerfile -t audio-asset-worker .
docker run -p 8090:8090 --env-file .env -e PORT=8090 audio-asset-worker
```

Worker listens on **8090** (`PORT` env). Map to `ASSET_WORKER_URL=http://localhost:8090` in root `.env`.

## Netlify integration

Set on Netlify:

- `ASSET_WORKER_URL` — public URL of this service
- `ASSET_WORKER_WEBHOOK_SECRET` — same secret as worker

Upload flow enqueues jobs via `netlify/functions/lib/enqueueTrackProcessing.ts`.
