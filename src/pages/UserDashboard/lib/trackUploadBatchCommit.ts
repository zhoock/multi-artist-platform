import type { TrackUploadData, TrackUploadResponse } from '@shared/api/tracks';
import type { SupportedLang } from '@shared/model/lang';

export type TrackUploadBatchPostStorageDecision =
  | { action: 'cancel' }
  | { action: 'all_failed' }
  | { action: 'commit' };

/**
 * After the storage upload loop: explicit cancel must win even when tracksData is non-empty.
 */
export function resolveTrackUploadBatchPostStorageDecision(
  abortSignal: AbortSignal,
  uploadedTrackCount: number
): TrackUploadBatchPostStorageDecision {
  if (abortSignal.aborted) {
    return { action: 'cancel' };
  }
  if (uploadedTrackCount === 0) {
    return { action: 'all_failed' };
  }
  return { action: 'commit' };
}

/** Immediate pre-DB guard: cancel may fire after the last storage upload resolves. */
export function shouldProceedWithTrackUploadDbCommit(abortSignal: AbortSignal): boolean {
  return !abortSignal.aborted;
}

export type TrackUploadBatchCommitResult =
  | { status: 'cancelled' }
  | { status: 'committed'; result: TrackUploadResponse };

export type CommitTrackUploadBatchToDbOptions = {
  abortSignal: AbortSignal;
  albumId: string;
  lang: SupportedLang;
  tracksData: TrackUploadData[];
  uploadTracksFn: (
    albumId: string,
    lang: SupportedLang,
    tracks: TrackUploadData[]
  ) => Promise<TrackUploadResponse>;
};

export async function commitTrackUploadBatchToDb(
  options: CommitTrackUploadBatchToDbOptions
): Promise<TrackUploadBatchCommitResult> {
  if (!shouldProceedWithTrackUploadDbCommit(options.abortSignal)) {
    return { status: 'cancelled' };
  }

  const result = await options.uploadTracksFn(options.albumId, options.lang, options.tracksData);

  return { status: 'committed', result };
}
