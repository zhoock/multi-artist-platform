/**
 * Scheduled Premium subscription renewals + period-end expiry (PR-7).
 * Gated by SUBSCRIPTION_AUTO_RENEW_ENABLED.
 * PR-10.1: fail-closed authorization (C-2).
 * PR-10.3: structured scheduler observability.
 */

import type { Handler } from '@netlify/functions';
import crypto from 'node:crypto';

import { authorizeScheduledRenewalInvocation } from './lib/subscription-renewal-scheduler-auth';
import { runRenewalCycle } from './lib/subscription-renewal-engine';
import {
  logSubscriptionEvent,
  runWithSubscriptionObservability,
  SUBSCRIPTION_LOG_EVENTS,
} from './lib/subscription-observability';

export const handler: Handler = async (event) => {
  if (!authorizeScheduledRenewalInvocation(event)) {
    logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.SCHEDULER_UNAUTHORIZED, {}, 'error');
    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  const correlationId = crypto.randomUUID();

  try {
    const result = await runWithSubscriptionObservability(
      { source: 'scheduler', kind: 'renewal', correlationId },
      () => runRenewalCycle(new Date())
    );

    logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CYCLE, {
      chargesAttempted: result.chargesAttempted,
      chargesSkipped: result.chargesSkipped,
      periodsEnded: result.periodsEnded,
      errors: result.errors,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, ...result }),
    };
  } catch (error) {
    logSubscriptionEvent(
      SUBSCRIPTION_LOG_EVENTS.SCHEDULER_ERROR,
      { error: error instanceof Error ? error.message : String(error) },
      'error'
    );
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Renewal cycle failed' }),
    };
  }
};
