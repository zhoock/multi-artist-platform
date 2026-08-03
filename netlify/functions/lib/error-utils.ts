/** YooKassa API error JSON (v3). */
export interface YooKassaErrorBody {
  type?: string;
  id?: string;
  code?: string;
  description?: string;
  parameter?: string;
}

export interface PostgresErrorLike {
  message?: string;
  code?: string;
  detail?: string;
  hint?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}

export function getErrorCode(error: unknown): string | undefined {
  if (!isRecord(error) || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

export function getErrorCause(error: unknown): unknown {
  if (!isRecord(error) || !('cause' in error)) return undefined;
  return error.cause;
}

export function asPostgresError(error: unknown): PostgresErrorLike {
  if (!isRecord(error)) return {};
  return {
    message: typeof error.message === 'string' ? error.message : undefined,
    code: typeof error.code === 'string' ? error.code : undefined,
    detail: typeof error.detail === 'string' ? error.detail : undefined,
    hint: typeof error.hint === 'string' ? error.hint : undefined,
  };
}

export function isFetchTimeoutError(error: unknown): boolean {
  const code = getErrorCode(error);
  const cause = getErrorCause(error);
  const causeCode = isRecord(cause) && typeof cause.code === 'string' ? cause.code : undefined;
  const message = getErrorMessage(error).toLowerCase();
  return (
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    causeCode === 'UND_ERR_CONNECT_TIMEOUT' ||
    message.includes('timeout') ||
    message.includes('aborted')
  );
}

export function parseYooKassaErrorBody(text: string): YooKassaErrorBody | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed)) return null;
    return {
      type: typeof parsed.type === 'string' ? parsed.type : undefined,
      id: typeof parsed.id === 'string' ? parsed.id : undefined,
      code: typeof parsed.code === 'string' ? parsed.code : undefined,
      description: typeof parsed.description === 'string' ? parsed.description : undefined,
      parameter: typeof parsed.parameter === 'string' ? parsed.parameter : undefined,
    };
  } catch {
    return null;
  }
}

export function getStorageErrorStatus(error: unknown): unknown {
  if (typeof error !== 'object' || error === null) return undefined;
  const record = error as { status?: unknown; statusCode?: unknown };
  return record.status ?? record.statusCode;
}
