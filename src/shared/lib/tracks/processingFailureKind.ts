/**
 * Distinguish enqueue failures (worker never started) from pipeline failures (FFmpeg, etc.).
 * Enqueue errors are stored with [[enqueue]] prefix in tracks.processing_error.
 */

export type ProcessingFailureKind = 'enqueue' | 'pipeline';

export const ENQUEUE_PROCESSING_ERROR_PREFIX = '[[enqueue]]';

export function formatEnqueueProcessingError(message: string): string {
  return `${ENQUEUE_PROCESSING_ERROR_PREFIX}${message.trim()}`;
}

export function parseProcessingError(raw: string | null | undefined): {
  kind: ProcessingFailureKind;
  message: string;
} {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) {
    return { kind: 'pipeline', message: '' };
  }
  if (trimmed.startsWith(ENQUEUE_PROCESSING_ERROR_PREFIX)) {
    return {
      kind: 'enqueue',
      message: trimmed.slice(ENQUEUE_PROCESSING_ERROR_PREFIX.length).trim(),
    };
  }
  if (isLegacyEnqueueFailureMessage(trimmed)) {
    return { kind: 'enqueue', message: trimmed };
  }
  return { kind: 'pipeline', message: trimmed };
}

function isLegacyEnqueueFailureMessage(message: string): boolean {
  return (
    message.includes('worker is not configured') ||
    message.includes('worker is unavailable') ||
    message.includes('worker rejected the job')
  );
}

export function isFailedProcessingStatus(status: string | null | undefined): status is 'failed' {
  return status === 'failed';
}
