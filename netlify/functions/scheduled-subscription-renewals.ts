/**
 * Scheduled Premium subscription renewals + period-end expiry (PR-7).
 * Gated by SUBSCRIPTION_AUTO_RENEW_ENABLED.
 * PR-10.1: fail-closed authorization (C-2).
 * PR-10.3: structured scheduler observability.
 * Run mode is fail-closed (see subscription-renewal-scheduler-mode): real renewals only with
 * SUBSCRIPTION_SCHEDULER_LIVE=true and dry-run off; SUBSCRIPTION_SCHEDULER_DRY_RUN=true only counts.
 */

import type { Handler } from '@netlify/functions';
import crypto from 'node:crypto';

import {
  authorizeScheduledRenewalInvocation,
  describeSchedulerInvocation,
} from './lib/subscription-renewal-scheduler-auth';
import {
  describeSchedulerModeFlags,
  resolveSchedulerRunMode,
} from './lib/subscription-renewal-scheduler-mode';
import { previewRenewalCycle, runRenewalCycle } from './lib/subscription-renewal-engine';
import {
  logSubscriptionEvent,
  runWithSubscriptionObservability,
  SUBSCRIPTION_LOG_EVENTS,
} from './lib/subscription-observability';

export const handler: Handler = async (event) => {
  if (!authorizeScheduledRenewalInvocation(event)) {
    logSubscriptionEvent(
      SUBSCRIPTION_LOG_EVENTS.SCHEDULER_UNAUTHORIZED,
      { ...describeSchedulerInvocation(event), ...describeSchedulerModeFlags() },
      'error'
    );
    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  const correlationId = crypto.randomUUID();
  const runMode = resolveSchedulerRunMode();

  if (runMode.mode === 'blocked') {
    logSubscriptionEvent(
      SUBSCRIPTION_LOG_EVENTS.SCHEDULER_MODE_BLOCKED,
      {
        correlationId,
        reason: runMode.reason,
        ...describeSchedulerModeFlags(),
        ...describeSchedulerInvocation(event),
      },
      'warn'
    );
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, mode: 'blocked', reason: runMode.reason }),
    };
  }

  try {
    if (runMode.mode === 'dry_run') {
      const preview = await previewRenewalCycle(new Date());
      logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.SCHEDULER_DRY_RUN, {
        correlationId,
        ...preview,
        ...describeSchedulerModeFlags(),
        ...describeSchedulerInvocation(event),
      });
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, mode: 'dry_run', dryRun: true, ...preview }),
      };
    }

    const result = await runWithSubscriptionObservability(
      { source: 'scheduler', kind: 'renewal', correlationId },
      () => runRenewalCycle(new Date())
    );

    logSubscriptionEvent(SUBSCRIPTION_LOG_EVENTS.SCHEDULER_CYCLE, {
      mode: 'live',
      chargesAttempted: result.chargesAttempted,
      chargesSkipped: result.chargesSkipped,
      periodsEnded: result.periodsEnded,
      errors: result.errors,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, mode: 'live', ...result }),
    };
  } catch (error) {
    logSubscriptionEvent(
      SUBSCRIPTION_LOG_EVENTS.SCHEDULER_ERROR,
      { mode: runMode.mode, error: error instanceof Error ? error.message : String(error) },
      'error'
    );
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Renewal cycle failed' }),
    };
  }
};
