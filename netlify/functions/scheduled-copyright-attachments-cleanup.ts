/**
 * Daily housekeeping: remove stale pending copyright claim attachments (>72h).
 * Netlify Clockwork in production; local invoke when NETLIFY_DEV=true.
 */

import type { Handler } from '@netlify/functions';

import { isTrustedNetlifyPlatformSchedule } from './lib/subscription-renewal-scheduler-auth';
import { COPYRIGHT_CLAIM_ATTACHMENT_PENDING_CLEANUP_HOURS } from './lib/copyright-claim-attachments';
import { runCopyrightClaimAttachmentsCleanup } from './lib/copyright-claim-attachments-cleanup';

export const handler: Handler = async (event) => {
  const trustedSchedule = isTrustedNetlifyPlatformSchedule(event);
  if (!trustedSchedule && process.env.NETLIFY_DEV !== 'true') {
    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  try {
    const summary = await runCopyrightClaimAttachmentsCleanup();
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        pendingCleanupHours: COPYRIGHT_CLAIM_ATTACHMENT_PENDING_CLEANUP_HOURS,
        ...summary,
      }),
    };
  } catch (error) {
    console.error('scheduled-copyright-attachments-cleanup failed', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Cleanup failed' }),
    };
  }
};
