/**
 * Insert system admin notification for a new copyright claim.
 * title/body left null; body stores JSON with contentTitle for UI i18n interpolation.
 */

import { query } from './db';

export interface CopyrightClaimNotificationPayload {
  contentTitle: string;
}

export async function insertCopyrightClaimAdminNotification(input: {
  claimId: string;
  payload: CopyrightClaimNotificationPayload;
}): Promise<void> {
  const bodyJson = JSON.stringify(input.payload);
  await query(
    `INSERT INTO admin_notifications (type, title, body, target_type, target_id)
     VALUES ('copyright_claim', NULL, $1, 'copyright_claim', $2::uuid)
     ON CONFLICT (type, target_type, target_id) DO NOTHING`,
    [bodyJson, input.claimId],
    0
  );
}
