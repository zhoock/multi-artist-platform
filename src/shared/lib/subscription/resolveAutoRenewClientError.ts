/**
 * Maps auto-renew API failures to user-facing copy; hides internal FEATURE_DISABLED text.
 */

export type AutoRenewClientErrorSource = {
  error?: string;
  code?: string;
};

export function resolveAutoRenewClientError(
  result: AutoRenewClientErrorSource,
  genericMessage: string
): string {
  if (result.code === 'FEATURE_DISABLED') {
    return genericMessage;
  }
  return result.error ?? genericMessage;
}
