/**
 * Scheduled purge of user notifications older than retention window (90 days).
 * Netlify Clockwork only in production; local: NETLIFY_DEV=true.
 */

import type { Handler } from '@netlify/functions';
import {
  purgeUserNotificationsOlderThanDays,
  USER_NOTIFICATIONS_RETENTION_DAYS,
} from './lib/user-notifications-db';
import { isTrustedNetlifyPlatformSchedule } from './lib/subscription-renewal-scheduler-auth';

export const handler: Handler = async (event) => {
  const trustedSchedule = isTrustedNetlifyPlatformSchedule(event);
  if (!trustedSchedule && process.env.NETLIFY_DEV !== 'true') {
    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  try {
    const deleted = await purgeUserNotificationsOlderThanDays(USER_NOTIFICATIONS_RETENTION_DAYS);
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        deleted,
        retentionDays: USER_NOTIFICATIONS_RETENTION_DAYS,
      }),
    };
  } catch (error) {
    console.error('scheduled-user-notifications-cleanup failed', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: 'Cleanup failed' }),
    };
  }
};
