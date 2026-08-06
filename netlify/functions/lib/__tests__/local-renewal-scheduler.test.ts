import {
  buildNetlifyScheduledInvocationBody,
  buildScheduledSubscriptionRenewalsUrl,
  DEFAULT_LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS,
  getLocalNetlifyDevPort,
  getLocalRenewalSchedulerIntervalMs,
  isLocalRenewalSchedulerEnabled,
} from '../local-renewal-scheduler';

describe('local-renewal-scheduler (PR-10.4)', () => {
  const envKeys = [
    'LOCAL_RENEWAL_SCHEDULER',
    'SUBSCRIPTION_AUTO_RENEW_ENABLED',
    'CONTEXT',
    'NODE_ENV',
    'NETLIFY_DEV',
    'LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS',
    'LOCAL_NETLIFY_PORT',
  ] as const;

  const originalEnv: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  function enableLocalSchedulerEnv(): void {
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    process.env.NETLIFY_DEV = 'true';
    process.env.NODE_ENV = 'development';
  }

  it('is disabled when SUBSCRIPTION_AUTO_RENEW_ENABLED is off', () => {
    process.env.NETLIFY_DEV = 'true';
    expect(isLocalRenewalSchedulerEnabled()).toBe(false);
  });

  it('is disabled on production deploy context', () => {
    enableLocalSchedulerEnv();
    process.env.CONTEXT = 'production';
    expect(isLocalRenewalSchedulerEnabled()).toBe(false);
  });

  it('is disabled in production Node without Netlify Dev', () => {
    enableLocalSchedulerEnv();
    process.env.NODE_ENV = 'production';
    delete process.env.NETLIFY_DEV;
    expect(isLocalRenewalSchedulerEnabled()).toBe(false);
  });

  it('is disabled when LOCAL_RENEWAL_SCHEDULER=false', () => {
    enableLocalSchedulerEnv();
    process.env.LOCAL_RENEWAL_SCHEDULER = 'false';
    expect(isLocalRenewalSchedulerEnabled()).toBe(false);
  });

  it('is disabled without NETLIFY_DEV or LOCAL_RENEWAL_SCHEDULER=true', () => {
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    process.env.NODE_ENV = 'development';
    expect(isLocalRenewalSchedulerEnabled()).toBe(false);
  });

  it('is enabled under Netlify Dev with autorenew flag on', () => {
    enableLocalSchedulerEnv();
    expect(isLocalRenewalSchedulerEnabled()).toBe(true);
  });

  it('is enabled when LOCAL_RENEWAL_SCHEDULER=true without NETLIFY_DEV', () => {
    process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
    process.env.LOCAL_RENEWAL_SCHEDULER = 'true';
    process.env.NODE_ENV = 'development';
    expect(isLocalRenewalSchedulerEnabled()).toBe(true);
  });

  it('defaults interval to 60 seconds', () => {
    expect(getLocalRenewalSchedulerIntervalMs()).toBe(DEFAULT_LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS);
  });

  it('parses LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS', () => {
    process.env.LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS = '30000';
    expect(getLocalRenewalSchedulerIntervalMs()).toBe(30_000);
  });

  it('falls back when interval is invalid', () => {
    process.env.LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS = '500';
    expect(getLocalRenewalSchedulerIntervalMs()).toBe(DEFAULT_LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS);
  });

  it('builds scheduled renewals URL from port', () => {
    process.env.LOCAL_NETLIFY_PORT = '9999';
    expect(buildScheduledSubscriptionRenewalsUrl()).toBe(
      'http://127.0.0.1:9999/.netlify/functions/scheduled-subscription-renewals'
    );
    expect(getLocalNetlifyDevPort()).toBe(9999);
  });

  it('buildNetlifyScheduledInvocationBody includes next_run', () => {
    const at = new Date('2026-08-06T12:00:00.000Z');
    expect(JSON.parse(buildNetlifyScheduledInvocationBody(at))).toEqual({
      next_run: '2026-08-06T12:00:00.000Z',
    });
  });
});
