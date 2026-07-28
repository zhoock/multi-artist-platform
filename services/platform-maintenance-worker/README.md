# Platform Maintenance Worker

Scheduled operational tasks for the audio asset platform (GC, retries, integrity checks).

## Endpoints

- `GET /health` — liveness
- `POST /maintenance/run` — run maintenance tasks (sync)

Auth: `Authorization: Bearer $PLATFORM_MAINTENANCE_WEBHOOK_SECRET`

### Request body

```json
{
  "taskIds": ["gc-orphan-audio-files"],
  "dryRun": true
}
```

- `dryRun` defaults to **`true`** — orphan files are reported but not deleted.
- Pass `"dryRun": false` to actually remove unreferenced `original/` and `derived/` audio files.

## Tasks

| Task                      | Status      | Description                                                                                                                   |
| ------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `gc-orphan-audio-files`   | **enabled** | Delete storage files under `users/*/audio/*/original\|derived/` not referenced by `tracks.master_path` or `track_assets.path` |
| `retry-failed-jobs`       | stub        | Re-enqueue failed tracks                                                                                                      |
| `rebuild-missing-assets`  | stub        | Enqueue tracks missing derived assets                                                                                         |
| `regenerate-stale-assets` | stub        | Bulk regen outdated generator versions                                                                                        |
| `integrity-check`         | stub        | Verify DB ↔ storage consistency                                                                                              |

## Environment

| Variable                              | Description                          |
| ------------------------------------- | ------------------------------------ |
| `DATABASE_URL`                        | Postgres connection string           |
| `SUPABASE_URL`                        | Supabase project URL                 |
| `SUPABASE_SERVICE_ROLE_KEY`           | Service role key for storage         |
| `PLATFORM_MAINTENANCE_WEBHOOK_SECRET` | Bearer secret for `/maintenance/run` |
| `PORT`                                | HTTP port (default 8081)             |

## Nightly schedule (example)

Point Railway/Fly cron at **03:00 UTC**:

```bash
curl -X POST "$MAINTENANCE_WORKER_URL/maintenance/run" \
  -H "Authorization: Bearer $PLATFORM_MAINTENANCE_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'
```

Dry-run report first in staging:

```bash
curl -X POST "$MAINTENANCE_WORKER_URL/maintenance/run" \
  -H "Authorization: Bearer $PLATFORM_MAINTENANCE_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'
```

## Local development

```bash
cd services/platform-maintenance-worker
npm install
npm run dev
```

## Docker

From repo root:

```bash
docker build -f services/platform-maintenance-worker/Dockerfile -t platform-maintenance-worker .
docker run -p 8081:8081 --env-file .env platform-maintenance-worker
```
