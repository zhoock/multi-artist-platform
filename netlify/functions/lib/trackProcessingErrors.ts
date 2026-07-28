export const PROCESSING_ERROR_WORKER_NOT_CONFIGURED =
  'Audio processing worker is not configured. Please contact support or retry after the worker is available.';

export function processingErrorWorkerUnreachable(detail: string): string {
  const trimmed = detail.trim();
  return trimmed
    ? `Audio processing worker is unavailable. ${trimmed}`
    : 'Audio processing worker is unavailable. Please try again later.';
}

export function processingErrorWorkerRejected(status: number, detail: string): string {
  const trimmed = detail.trim();
  const suffix = trimmed ? ` ${trimmed}` : '';
  return `Audio processing worker rejected the job (HTTP ${status}).${suffix}`;
}
