/**
 * Housekeeping for stale pending copyright claim attachments (presign without complete).
 */

import { query } from './db';
import { createSupabaseAdminClient, STORAGE_BUCKET_NAME } from './supabase';
import {
  COPYRIGHT_CLAIM_ATTACHMENT_CLEANUP_BATCH_SIZE,
  COPYRIGHT_CLAIM_ATTACHMENT_PENDING_CLEANUP_HOURS,
  isCopyrightClaimAttachmentStoragePath,
} from './copyright-claim-attachments';

export type StalePendingAttachmentRow = {
  id: string;
  storage_path: string;
};

export type CopyrightClaimAttachmentsCleanupSummary = {
  batchesRun: number;
  pendingFound: number;
  storageObjectsRemoved: number;
  storageAlreadyAbsent: number;
  dbRecordsRemoved: number;
  storageErrors: number;
  dbErrors: number;
  invalidPathsSkipped: number;
};

export type CleanupAttachmentResult = {
  outcome: 'db_deleted' | 'storage_error' | 'db_error' | 'invalid_path';
  storage?: 'removed' | 'already_absent';
};

export async function fetchStalePendingCopyrightAttachments(
  limit: number,
  olderThanHours: number = COPYRIGHT_CLAIM_ATTACHMENT_PENDING_CLEANUP_HOURS
): Promise<StalePendingAttachmentRow[]> {
  const safeLimit = Math.max(1, Math.min(limit, 500));
  const hours = Math.max(1, olderThanHours);
  const r = await query<StalePendingAttachmentRow>(
    `SELECT id, storage_path
     FROM copyright_claim_attachments
     WHERE upload_status = 'pending'
       AND uploaded_at IS NULL
       AND created_at < NOW() - ($1::int * INTERVAL '1 hour')
     ORDER BY created_at ASC
     LIMIT $2`,
    [hours, safeLimit],
    0
  );
  return r.rows;
}

export async function deleteCopyrightClaimAttachmentById(attachmentId: string): Promise<void> {
  await query(`DELETE FROM copyright_claim_attachments WHERE id = $1::uuid`, [attachmentId], 0);
}

function isStorageObjectMissingError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('not found') ||
    lower.includes('object not found') ||
    lower.includes('does not exist')
  );
}

/**
 * Removes storage object when path is trusted. Missing objects are treated as success.
 */
export async function tryRemoveStaleCopyrightAttachmentStorage(
  storagePath: string
): Promise<'removed' | 'already_absent' | 'invalid_path' | 'error'> {
  if (!isCopyrightClaimAttachmentStoragePath(storagePath)) {
    return 'invalid_path';
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return 'error';
  }

  try {
    const { error } = await supabase.storage.from(STORAGE_BUCKET_NAME).remove([storagePath]);
    if (!error) {
      return 'removed';
    }
    const message = error.message ?? String(error);
    if (isStorageObjectMissingError(message)) {
      return 'already_absent';
    }
    console.error('copyright-attachments-cleanup storage remove failed', {
      attachmentStoragePathPrefix: storagePath.slice(0, 48),
      code: error.name,
      message: message.slice(0, 200),
    });
    return 'error';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('copyright-attachments-cleanup storage remove threw', {
      attachmentStoragePathPrefix: storagePath.slice(0, 48),
      message: message.slice(0, 200),
    });
    return 'error';
  }
}

export async function cleanupOneStalePendingAttachment(
  row: StalePendingAttachmentRow
): Promise<CleanupAttachmentResult> {
  const storageOutcome = await tryRemoveStaleCopyrightAttachmentStorage(row.storage_path);

  if (storageOutcome === 'invalid_path') {
    return { outcome: 'invalid_path' };
  }

  if (storageOutcome === 'error') {
    return { outcome: 'storage_error' };
  }

  try {
    await deleteCopyrightClaimAttachmentById(row.id);
    return {
      outcome: 'db_deleted',
      storage: storageOutcome === 'removed' ? 'removed' : 'already_absent',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('copyright-attachments-cleanup db delete failed', {
      attachmentId: row.id,
      message: message.slice(0, 200),
    });
    return { outcome: 'db_error' };
  }
}

export async function runCopyrightClaimAttachmentsCleanup(options?: {
  batchSize?: number;
  olderThanHours?: number;
}): Promise<CopyrightClaimAttachmentsCleanupSummary> {
  const batchSize = options?.batchSize ?? COPYRIGHT_CLAIM_ATTACHMENT_CLEANUP_BATCH_SIZE;
  const olderThanHours =
    options?.olderThanHours ?? COPYRIGHT_CLAIM_ATTACHMENT_PENDING_CLEANUP_HOURS;

  const summary: CopyrightClaimAttachmentsCleanupSummary = {
    batchesRun: 0,
    pendingFound: 0,
    storageObjectsRemoved: 0,
    storageAlreadyAbsent: 0,
    dbRecordsRemoved: 0,
    storageErrors: 0,
    dbErrors: 0,
    invalidPathsSkipped: 0,
  };

  for (;;) {
    const batch = await fetchStalePendingCopyrightAttachments(batchSize, olderThanHours);
    if (batch.length === 0) {
      break;
    }

    summary.batchesRun += 1;
    summary.pendingFound += batch.length;

    for (const row of batch) {
      const result = await cleanupOneStalePendingAttachment(row);
      switch (result.outcome) {
        case 'invalid_path':
          summary.invalidPathsSkipped += 1;
          console.error('copyright-attachments-cleanup skipped invalid storage path', {
            attachmentId: row.id,
          });
          break;
        case 'storage_error':
          summary.storageErrors += 1;
          break;
        case 'db_error':
          summary.dbErrors += 1;
          break;
        case 'db_deleted':
          summary.dbRecordsRemoved += 1;
          if (result.storage === 'removed') {
            summary.storageObjectsRemoved += 1;
          } else {
            summary.storageAlreadyAbsent += 1;
          }
          break;
        default:
          break;
      }
    }

    if (batch.length < batchSize) {
      break;
    }
  }

  console.info('copyright-attachments-cleanup finished', { ...summary });

  return summary;
}
