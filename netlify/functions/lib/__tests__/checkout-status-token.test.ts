import {
  CHECKOUT_STATUS_EXPIRES_PARAM,
  CHECKOUT_STATUS_TOKEN_PARAM,
  CHECKOUT_STATUS_TOKEN_TTL_MS,
  createCheckoutStatusToken,
  parseCheckoutStatusTokenFromQuery,
  verifyCheckoutStatusToken,
} from '../checkout-status-token';

describe('checkout-status-token', () => {
  const orderA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const orderB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-checkout-status-secret-with-enough-length';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  it('creates a verifiable token bound to order id', () => {
    const { token, expiresAt } = createCheckoutStatusToken(orderA);
    expect(verifyCheckoutStatusToken(token, orderA, expiresAt)).toBe(true);
  });

  it('rejects forged token', () => {
    const { expiresAt } = createCheckoutStatusToken(orderA);
    expect(verifyCheckoutStatusToken('forged-token', orderA, expiresAt)).toBe(false);
  });

  it('rejects token for order A when checking order B', () => {
    const { token, expiresAt } = createCheckoutStatusToken(orderA);
    expect(verifyCheckoutStatusToken(token, orderB, expiresAt)).toBe(false);
  });

  it('rejects expired token', () => {
    const { token } = createCheckoutStatusToken(orderA);
    const expiredAt = Date.now() - 1000;
    expect(verifyCheckoutStatusToken(token, orderA, expiredAt)).toBe(false);
  });

  it('parses query params', () => {
    const { token, expiresAt } = createCheckoutStatusToken(orderA);
    const parsed = parseCheckoutStatusTokenFromQuery({
      [CHECKOUT_STATUS_TOKEN_PARAM]: token,
      [CHECKOUT_STATUS_EXPIRES_PARAM]: String(expiresAt),
    });
    expect(parsed).toEqual({ token, expiresAt });
  });

  it('token TTL is 48 hours', () => {
    const before = Date.now();
    const { expiresAt } = createCheckoutStatusToken(orderA);
    expect(expiresAt - before).toBeGreaterThanOrEqual(CHECKOUT_STATUS_TOKEN_TTL_MS - 50);
    expect(expiresAt - before).toBeLessThanOrEqual(CHECKOUT_STATUS_TOKEN_TTL_MS + 50);
  });
});
