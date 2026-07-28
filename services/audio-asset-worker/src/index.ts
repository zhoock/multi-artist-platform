import express from 'express';
import { processTrackJob } from './processTrackJob.js';
import type { ProcessTrackJobPayload } from './pipeline/types.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

function authorize(req: express.Request): boolean {
  const secret = process.env.ASSET_WORKER_WEBHOOK_SECRET || '';
  if (!secret) return false;
  const header = req.headers.authorization || '';
  return header === `Bearer ${secret}`;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/jobs/process-track', async (req, res) => {
  if (!authorize(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const payload = req.body as ProcessTrackJobPayload;
  const required = [
    'userId',
    'albumDbId',
    'albumSlug',
    'trackDbId',
    'trackId',
    'masterPath',
  ] as const;

  for (const key of required) {
    if (!payload?.[key]) {
      res.status(400).json({ error: `Missing required field: ${key}` });
      return;
    }
  }

  res.status(202).json({ accepted: true, trackId: payload.trackId });

  void processTrackJob(payload)
    .then((result) => {
      if (result === 'skipped') {
        console.log('[process-track] Skipped duplicate job (advisory lock held):', {
          trackId: payload.trackId,
          trackDbId: payload.trackDbId,
        });
      }
    })
    .catch((err) => {
      console.error('[process-track] Job failed:', {
        trackId: payload.trackId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
});

app.post('/jobs/regenerate', async (req, res) => {
  if (!authorize(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const payload = req.body as ProcessTrackJobPayload;
  if (!payload?.trackDbId || !payload?.masterPath) {
    res.status(400).json({ error: 'Missing trackDbId or masterPath' });
    return;
  }

  res.status(202).json({ accepted: true, trackId: payload.trackId });

  void processTrackJob(payload)
    .then((result) => {
      if (result === 'skipped') {
        console.log('[regenerate] Skipped duplicate job (advisory lock held):', {
          trackId: payload.trackId,
          trackDbId: payload.trackDbId,
        });
      }
    })
    .catch((err) => {
      console.error('[regenerate] Job failed:', {
        trackId: payload.trackId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`audio-asset-worker listening on ${port}`);
});
