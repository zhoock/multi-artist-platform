/**
 * Client mirror of SUBSCRIPTION_AUTO_RENEW_ENABLED (UX gate only — server enforces).
 * Reads the same root .env value injected via webpack DefinePlugin.
 */

function parseAutoRenewFlag(raw: string | undefined): boolean {
  const normalized = raw?.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function isSubscriptionAutoRenewClientEnabled(): boolean {
  return parseAutoRenewFlag(import.meta.env.VITE_SUBSCRIPTION_AUTO_RENEW_ENABLED);
}
