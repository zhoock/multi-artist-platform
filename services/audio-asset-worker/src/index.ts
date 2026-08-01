import './loadEnv.js';
import express from 'express';
import { pipelineTrace } from './lib/pipelineTrace.js';
import { checkFfmpegToolsAvailable, getFfmpegVersionLabel } from './processors/ffmpegTranscoder.js';
import { processTrackJobWithRetry } from './processTrackJobRetry.js';
import type { ProcessTrackJobPayload } from './pipeline/types.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

let ffmpegTools: Awaited<ReturnType<typeof checkFfmpegToolsAvailable>> | null = null;

async function getFfmpegToolsStatus() {
  if (!ffmpegTools) {
    ffmpegTools = await checkFfmpegToolsAvailable();
  }
  return ffmpegTools;
}

function ffmpegToolsErrorMessage(
  tools: Awaited<ReturnType<typeof checkFfmpegToolsAvailable>>
): string {
  const missing = [!tools.ffmpeg && 'ffmpeg', !tools.ffprobe && 'ffprobe'].filter(Boolean);
  return `Missing required tools on PATH: ${missing.join(', ')}. Install ffmpeg (macOS: brew install ffmpeg).`;
}

app.get('/health', async (_req, res) => {
  const tools = await getFfmpegToolsStatus();
  const ok = tools.ffmpeg && tools.ffprobe;
  res.status(ok ? 200 : 503).json({
    ok,
    ffmpeg: tools.ffmpeg,
    ffprobe: tools.ffprobe,
    ...(ok ? {} : { error: ffmpegToolsErrorMessage(tools) }),
  });
});

function authorize(req: express.Request): boolean {
  const secret = process.env.ASSET_WORKER_WEBHOOK_SECRET || '';
  if (!secret) return false;
  const header = req.headers.authorization || '';
  return header === `Bearer ${secret}`;
}

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

  const tools = await getFfmpegToolsStatus();
  if (!tools.ffmpeg || !tools.ffprobe) {
    res.status(503).json({ error: ffmpegToolsErrorMessage(tools) });
    return;
  }

  res.status(202).json({ accepted: true, trackId: payload.trackId });

  pipelineTrace(
    'HTTP /jobs/process-track accepted',
    {
      trackDbId: payload.trackDbId,
      trackId: payload.trackId,
      masterPath: payload.masterPath,
      stages: payload.stages ?? '(default)',
    },
    { trackDbId: payload.trackDbId, trackId: payload.trackId }
  );

  void processTrackJobWithRetry(payload).catch((err) => {
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

  const tools = await getFfmpegToolsStatus();
  if (!tools.ffmpeg || !tools.ffprobe) {
    res.status(503).json({ error: ffmpegToolsErrorMessage(tools) });
    return;
  }

  res.status(202).json({ accepted: true, trackId: payload.trackId });

  pipelineTrace(
    'HTTP /jobs/regenerate accepted',
    {
      trackDbId: payload.trackDbId,
      trackId: payload.trackId,
      masterPath: payload.masterPath,
      stages: payload.stages ?? '(default)',
    },
    { trackDbId: payload.trackDbId, trackId: payload.trackId ?? payload.trackDbId }
  );

  void processTrackJobWithRetry(payload).catch((err) => {
    console.error('[regenerate] Job failed:', {
      trackId: payload.trackId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
});

const port = Number(process.env.PORT || 8090);
app.listen(port, async () => {
  const tools = await getFfmpegToolsStatus();
  const version = tools.ffmpeg ? await getFfmpegVersionLabel() : null;
  console.log(`audio-asset-worker listening on ${port}`);
  if (tools.ffmpeg && tools.ffprobe) {
    console.log(`✅ ffmpeg tools OK${version ? `: ${version}` : ''}`);
  } else {
    console.error(`⚠️  ${ffmpegToolsErrorMessage(tools)}`);
    console.error('   Jobs will return 503 until ffmpeg and ffprobe are on PATH.');
  }
});
