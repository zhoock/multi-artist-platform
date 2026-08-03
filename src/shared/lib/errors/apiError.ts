/** Common JSON error shapes from Netlify /api/* handlers. */
export interface ApiErrorBody {
  error?: string;
  message?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readApiErrorField(body: unknown, field: keyof ApiErrorBody): string | undefined {
  if (!isRecord(body)) return undefined;
  const value = body[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function getHttpErrorMessage(
  body: unknown,
  status: number,
  preferredField: keyof ApiErrorBody = 'error'
): string {
  const primary = readApiErrorField(body, preferredField);
  if (primary) return primary;
  const fallbackField = preferredField === 'error' ? 'message' : 'error';
  const fallback = readApiErrorField(body, fallbackField);
  if (fallback) return fallback;
  return `HTTP error! status: ${status}`;
}

/** RTK Query / createAsyncThunk condition abort — not a user-facing failure. */
export function isConditionError(error: unknown): boolean {
  return (
    isRecord(error) && 'name' in error && (error as { name?: unknown }).name === 'ConditionError'
  );
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

/** Supabase storage-js errors may expose `statusCode` or `status`. */
export function getStorageErrorStatus(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  const record = error as { status?: unknown; statusCode?: unknown };
  return record.status ?? record.statusCode;
}
