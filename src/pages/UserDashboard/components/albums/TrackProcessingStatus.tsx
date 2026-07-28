import clsx from 'clsx';

import type { TrackData } from '@entities/album/lib/transformEditableAlbumData';
import type { IInterface } from '@models';
import { parseProcessingError } from '@shared/lib/tracks/processingFailureKind';
import { DashboardButton } from '@shared/ui/dashboard';

type TrackProcessingStatusProps = {
  track: Pick<TrackData, 'processingStatus' | 'processingError'>;
  ui?: IInterface;
  albumId: string;
  retrying?: boolean;
  onRetry?: (albumId: string, trackId: string) => void;
  trackId: string;
  /** Hide badge while album-level upload progress is active */
  suppressed?: boolean;
};

export function TrackProcessingStatus({
  track,
  ui,
  albumId,
  retrying = false,
  onRetry,
  trackId,
  suppressed = false,
}: TrackProcessingStatusProps) {
  const copy = ui?.dashboard?.trackProcessing;

  if (suppressed || !track.processingStatus || track.processingStatus === 'ready') {
    return null;
  }

  if (track.processingStatus === 'pending' || track.processingStatus === 'processing') {
    const label = copy?.processing ?? 'Processing…';

    return (
      <span
        className={clsx(
          'user-dashboard__track-processing-badge',
          'user-dashboard__track-processing-badge--processing'
        )}
      >
        {label}
      </span>
    );
  }

  const parsed = parseProcessingError(track.processingError);
  const isEnqueueFailure = parsed.kind === 'enqueue';
  const title =
    parsed.message ||
    (isEnqueueFailure
      ? (copy?.enqueueFailedHint ?? copy?.workerUnavailableHint)
      : copy?.pipelineFailedHint) ||
    (isEnqueueFailure ? 'Audio processing could not be started.' : 'Audio processing failed.');

  const label = isEnqueueFailure
    ? (copy?.enqueueFailed ?? 'Processing not started')
    : (copy?.pipelineFailed ?? 'Processing failed');

  // Failed without stored error usually means enqueue never ran (legacy rows).
  const treatAsEnqueueFailure =
    isEnqueueFailure || (!parsed.message && track.processingStatus === 'failed');
  const displayLabel = treatAsEnqueueFailure
    ? (copy?.enqueueFailed ?? 'Processing not started')
    : label;
  const displayTitle = treatAsEnqueueFailure
    ? title || (copy?.enqueueFailedHint ?? copy?.workerUnavailableHint ?? '')
    : title;

  return (
    <div className="user-dashboard__track-processing">
      <span
        className={clsx(
          'user-dashboard__track-processing-badge',
          'user-dashboard__track-processing-badge--failed',
          treatAsEnqueueFailure && 'user-dashboard__track-processing-badge--enqueue-failed'
        )}
        title={displayTitle || undefined}
      >
        {displayLabel}
      </span>
      {onRetry ? (
        <DashboardButton
          variant="outline"
          className="user-dashboard__track-processing-retry"
          disabled={retrying}
          onClick={(event) => {
            event.stopPropagation();
            onRetry(albumId, trackId);
          }}
        >
          {retrying ? (copy?.retrying ?? 'Retrying…') : (copy?.retry ?? 'Retry')}
        </DashboardButton>
      ) : null}
    </div>
  );
}
