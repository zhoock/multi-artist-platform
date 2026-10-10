/**
 * Production scheduler eligibility guards (PR-10 integration isolation).
 */

import { isDevPaymentModeEnabled } from './dev-payment-mode';
import { PR10_E2E_EMAIL_DOMAIN } from './subscription-pr10-e2e-constants';

/** SQL fragment: skip PR-10 integration users on production runtime only. */
export function sqlExcludePr10E2eIntegrationUsersFilter(): string {
  if (isDevPaymentModeEnabled()) {
    return '';
  }

  return `AND NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = subscriptions.user_id
      AND u.email ILIKE '%${PR10_E2E_EMAIL_DOMAIN}'
  )`;
}
