export class StorageUploadError extends Error {
  readonly code?: string;
  readonly details?: string;
  readonly httpStatus?: number;

  constructor(message: string, opts?: { code?: string; details?: string; httpStatus?: number }) {
    super(message);
    this.name = 'StorageUploadError';
    this.code = opts?.code;
    this.details = opts?.details;
    this.httpStatus = opts?.httpStatus;
  }
}

export function formatStorageUploadErrorForUi(
  err: StorageUploadError | (Error & { code?: string; details?: string })
): string {
  const parts = [err.message];
  const details = 'details' in err ? err.details : undefined;
  const code = 'code' in err ? err.code : undefined;
  if (details && !err.message.includes(details)) {
    parts.push(details);
  }
  if (code) {
    parts.push(`(${code})`);
  }
  return parts.join(' ');
}
