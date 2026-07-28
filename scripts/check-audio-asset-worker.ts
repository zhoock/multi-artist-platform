/**
 * Warn when ASSET_WORKER_URL is configured but the worker process is not reachable.
 * Non-blocking — always exits 0 so `npm run dev` can continue.
 */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const workerUrl = (process.env.ASSET_WORKER_URL || '').replace(/\/$/, '');

async function main(): Promise<void> {
  if (!workerUrl) {
    console.warn(
      '⚠️  ASSET_WORKER_URL is not set — audio processing will not run after track upload.'
    );
    console.warn(
      '   Add ASSET_WORKER_URL and ASSET_WORKER_WEBHOOK_SECRET to .env (see .env.example).\n'
    );
    return;
  }

  try {
    const res = await fetch(`${workerUrl}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      console.log(`✅ Audio Asset Worker is reachable at ${workerUrl}\n`);
      return;
    }
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      ffprobe?: boolean;
      ffmpeg?: boolean;
    };
    if (body.error) {
      console.warn(`⚠️  Audio Asset Worker at ${workerUrl} is unhealthy: ${body.error}\n`);
      return;
    }
  } catch {
    // Worker not running — warn below.
  }

  console.warn('\n⚠️  Audio Asset Worker is not running.');
  console.warn(`   Expected at: ${workerUrl}`);
  console.warn('   Start it with:\n');
  console.warn('     npm run dev:worker');
  console.warn('     npm run dev:docker:worker   (Docker — ffmpeg included, like prod)');
  console.warn('   or run everything together:\n');
  console.warn('     npm run dev:all');
  console.warn(
    '     npm run dev:docker          (recommended if ffmpeg is not installed locally)\n'
  );
}

main().catch(() => {
  // Never block dev startup.
});
