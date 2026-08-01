/**
 * Persist enqueue / pipeline-start failures on tracks + pending track_assets rows.
 */

import {
  getGeneratorsForStageIds,
  isOptionalOnlyPipelineRun,
} from '../../../src/shared/lib/audio/audioAssetPipelineConfig';
import { formatEnqueueProcessingError } from '../../../src/shared/lib/tracks/processingFailureKind';
import { query } from './db';

export async function markTrackProcessingEnqueueFailed(
  trackDbId: string,
  errorMessage: string,
  options?: { stages?: string[] }
): Promise<void> {
  const truncated = formatEnqueueProcessingError(errorMessage).slice(0, 4000);
  const stageIds = options?.stages;
  const optionalOnly = stageIds ? isOptionalOnlyPipelineRun(stageIds) : false;

  if (optionalOnly && stageIds) {
    const generators = getGeneratorsForStageIds(stageIds);
    for (const generator of generators) {
      await query(
        `UPDATE track_assets
         SET status = 'failed',
             error = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE track_id = $1
           AND generator = $3
           AND status IN ('pending', 'processing')`,
        [trackDbId, truncated, generator]
      );
    }
    return;
  }

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
