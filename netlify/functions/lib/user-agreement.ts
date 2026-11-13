/** Bump when legal text in user-agreement-{lang}.json changes materially. */
export const CURRENT_USER_AGREEMENT_VERSION = 2;

export function parseUserAgreementAccepted(body: unknown): boolean {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }
  return (body as { userAgreementAccepted?: unknown }).userAgreementAccepted === true;
}
