/**
 * Persist enqueue / pipeline-start failures on tracks + pending track_assets rows.
 */

import { query } from './db';
import { formatEnqueueProcessingError } from '../../../src/shared/lib/tracks/processingFailureKind';

export async function markTrackProcessingEnqueueFailed(
  trackDbId: string,
  errorMessage: string
): Promise<void> {
  const truncated = formatEnqueueProcessingError(errorMessage).slice(0, 4000);

  await query(
    `UPDATE tracks
     SET processing_status = 'failed',
         processing_error = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [trackDbId, truncated]
  );

  await query(
    `UPDATE track_assets
     SET status = 'failed',
         error = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE track_id = $1
       AND status IN ('pending', 'processing')`,
    [trackDbId, truncated]
  );
}
