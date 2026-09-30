import { parseProcessingError } from '@shared/lib/tracks/processingFailureKind';

export function buildTrackProcessingFailedAfterUploadMessage(
  entries: Array<{ processingError?: string | null }>,
  fallback: string
): string {
  const messages = [
    ...new Set(
      entries
        .map((entry) => parseProcessingError(entry.processingError).message)
        .map((message) => message.trim())
        .filter(Boolean)
    ),
  ];
  return messages.length > 0 ? messages.join('\n\n') : fallback;
}
