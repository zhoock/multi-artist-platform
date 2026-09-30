import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Resolves where upload/retry should send an audio processing job.
 *
 * Local development sets ASSET_WORKER_URL=http://localhost:8090 in gitignored .env.
 * That file is not deployed. Production Netlify previously had neither
 * ASSET_WORKER_URL nor ASSET_WORKER_WEBHOOK_SECRET, so enqueue stopped before
 * any job was created.
 *
 * On a remote Netlify runtime (CONTEXT=production / deploy-preview / branch-deploy,
 * or Lambda outside `netlify dev`), an unset external worker uses the in-site
 * background function. That function runs in the same deploy and already has
 * DATABASE_URL and Supabase credentials. A loopback ASSET_WORKER_URL is rejected
 * there because the function cannot reach the developer's machine.
 */

import {
  PROCESSING_ERROR_WORKER_NOT_CONFIGURED,
  processingErrorWorkerNotConfigured,
} from './trackProcessingErrors';

const LOOPBACK_PROCESSOR_URL =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/|$)/i;

const IN_SITE_FUNCTION_NAME = 'process-track-assets-background';

export type AudioProcessorMode = 'external' | 'netlify-background';

export type ResolveAudioProcessorResult =
  | {
      ok: true;
      endpoint: string;
      secret: string;
      mode: AudioProcessorMode;
      source: 'env' | 'netlify-background';
    }
  | {
      ok: false;
      reason: 'worker_not_configured';
      message: string;
      missing: string[];
    };

export function isLoopbackProcessorUrl(workerUrl: string): boolean {
  return LOOPBACK_PROCESSOR_URL.test(workerUrl.trim());
}

export function isRemoteNetlifyRuntime(): boolean {
  if (process.env.NETLIFY_DEV === 'true') {
    return false;
  }
  const context = (process.env.CONTEXT || '').trim();
  if (context === 'production' || context === 'deploy-preview' || context === 'branch-deploy') {
    return true;
  }
  return Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export function signInSiteProcessorBody(secret: string, rawBody: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function inSiteProcessorSignatureMatches(
  secret: string,
  rawBody: string,
  signature: string | undefined
): boolean {
  const expected = signInSiteProcessorBody(secret, rawBody);
  const provided = (signature || '').trim();
  if (!provided || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

export function buildProcessorJobUrl(workerUrl: string): string {
  const trimmed = workerUrl.trim().replace(/\/$/, '');
  if (trimmed.includes('/.netlify/functions/') || /\/jobs\/process-track$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/jobs/process-track`;
}

function readSiteUrl(): string {
  return (process.env.URL || process.env.DEPLOY_PRIME_URL || '').trim().replace(/\/$/, '');
}

export function resolveAudioProcessorConfig(): ResolveAudioProcessorResult {
  const configuredUrl = (process.env.ASSET_WORKER_URL || '').trim().replace(/\/$/, '');
  const configuredSecret = (process.env.ASSET_WORKER_WEBHOOK_SECRET || '').trim();
  const remote = isRemoteNetlifyRuntime();

  if (configuredUrl && isLoopbackProcessorUrl(configuredUrl) && remote) {
    return {
      ok: false,
      reason: 'worker_not_configured',
      missing: ['ASSET_WORKER_URL'],
      message:
        'ASSET_WORKER_URL points at a loopback address. Netlify functions cannot reach a processor on localhost. Unset ASSET_WORKER_URL to use the in-site processor, or set it to the public processor URL together with ASSET_WORKER_WEBHOOK_SECRET. Local .env is not deployed.',
    };
  }

  if (configuredUrl && configuredSecret) {
    const endpoint = buildProcessorJobUrl(configuredUrl);
    const mode: AudioProcessorMode = endpoint.includes('/.netlify/functions/')
      ? 'netlify-background'
      : 'external';
    return {
      ok: true,
      endpoint,
      secret: configuredSecret,
      mode,
      source: 'env',
    };
  }

  if (configuredUrl || configuredSecret) {
    const missing = [
      configuredUrl ? null : 'ASSET_WORKER_URL',
      configuredSecret ? null : 'ASSET_WORKER_WEBHOOK_SECRET',
    ].filter((item): item is string => Boolean(item));
    return {
      ok: false,
      reason: 'worker_not_configured',
      missing,
      message: processingErrorWorkerNotConfigured(missing),
    };
  }

  const siteUrl = readSiteUrl();
  const platformSecret = (process.env.JWT_SECRET || '').trim();
  if (remote && siteUrl && platformSecret) {
    return {
      ok: true,
      endpoint: `${siteUrl}/.netlify/functions/${IN_SITE_FUNCTION_NAME}`,
      secret: platformSecret,
      mode: 'netlify-background',
      source: 'netlify-background',
    };
  }

  const missing = ['ASSET_WORKER_URL', 'ASSET_WORKER_WEBHOOK_SECRET'];
  if (remote && !siteUrl) missing.push('URL');
  if (remote && !platformSecret) missing.push('JWT_SECRET');
  return {
    ok: false,
    reason: 'worker_not_configured',
    missing,
    message: remote
      ? processingErrorWorkerNotConfigured(missing)
      : PROCESSING_ERROR_WORKER_NOT_CONFIGURED,
  };
}
