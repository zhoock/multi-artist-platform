/**
 * test-email is dev-only. Fail closed on production deploys and production Node
 * without Netlify Dev (mirrors dev-payment-mode gates, inverted default).
 */

export function isTestEmailEndpointEnabled(): boolean {
  if (process.env.CONTEXT === 'production') {
    return false;
  }

  if (process.env.NODE_ENV === 'production' && process.env.NETLIFY_DEV !== 'true') {
    return false;
  }

  return true;
}
