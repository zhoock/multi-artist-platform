import express from 'express';
import { runMaintenance } from './runMaintenance.js';

const app = express();
app.use(express.json({ limit: '256kb' }));

function authorize(req: express.Request): boolean {
  const secret = process.env.PLATFORM_MAINTENANCE_WEBHOOK_SECRET || '';
  if (!secret) return false;
  const header = req.headers.authorization || '';
  return header === `Bearer ${secret}`;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'platform-maintenance-worker' });
});

/**
 * POST /maintenance/run
 * Body: { taskIds?: string[], dryRun?: boolean }
 *
 * dryRun defaults to true — pass dryRun: false to delete orphan files.
 * Schedule nightly via Railway/Fly cron hitting this endpoint.
 */
app.post('/maintenance/run', async (req, res) => {
  if (!authorize(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = (req.body ?? {}) as { taskIds?: string[]; dryRun?: boolean };

  try {
    const report = await runMaintenance({
      taskIds: body.taskIds,
      dryRun: body.dryRun,
    });
    res.status(200).json({ ok: true, report });
  } catch (err) {
    console.error('[maintenance/run] Failed:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Maintenance run failed',
    });
  }
});

const port = Number(process.env.PORT || 8081);
app.listen(port, () => {
  console.log(`platform-maintenance-worker listening on ${port}`);
});
