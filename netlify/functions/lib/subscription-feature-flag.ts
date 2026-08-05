/**
 * Feature flag for Premium autoprenewal rollout.
 * When disabled, all subscription access checks must match pre-autorenew behavior.
 */

export function isSubscriptionAutoRenewEnabled(): boolean {
  const raw = process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}
