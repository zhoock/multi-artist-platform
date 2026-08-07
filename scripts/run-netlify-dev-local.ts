/**
 * Local Netlify Dev entrypoint: load .env, then force autorenew on for npm run dev.
 * SUBSCRIPTION_AUTO_RENEW_ENABLED must win over .env (see .env.example default false).
 */
import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env') });
process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';

const result = spawnSync('netlify', ['dev'], {
  stdio: 'inherit',
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 1);
