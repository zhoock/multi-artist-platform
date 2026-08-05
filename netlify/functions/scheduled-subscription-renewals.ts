/**
 * Scheduled Premium subscription renewals + period-end expiry (PR-7).
 * Gated by SUBSCRIPTION_AUTO_RENEW_ENABLED.
 */

import type { Handler } from '@netlify/functions';
import { runRenewalCycle } from './lib/subscription-renewal-engine';

export const handler: Handler = async () => {
  try {
    const result = await runRenewalCycle(new Date());

    console.log('[scheduled-subscription-renewals] cycle complete', result);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, ...result }),
    };
  } catch (error) {
    console.error('[scheduled-subscription-renewals] cycle failed', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Renewal cycle failed' }),
    };
  }
};
