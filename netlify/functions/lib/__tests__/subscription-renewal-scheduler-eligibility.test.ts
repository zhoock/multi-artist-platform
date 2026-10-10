import { afterEach, describe, expect, test } from '@jest/globals';

import { sqlExcludePr10E2eIntegrationUsersFilter } from '../subscription-renewal-scheduler-eligibility';
import { PR10_E2E_EMAIL_DOMAIN } from '../subscription-pr10-e2e-constants';

const ENV_KEYS = ['DEV_PAYMENT_MODE', 'NETLIFY_DEV', 'NODE_ENV', 'CONTEXT'] as const;
const ORIGINAL = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = ORIGINAL[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('sqlExcludePr10E2eIntegrationUsersFilter', () => {
  test('returns empty fragment in dev payment mode (PR-10 integration DB)', () => {
    process.env.DEV_PAYMENT_MODE = 'true';
    process.env.NETLIFY_DEV = 'true';
    process.env.NODE_ENV = 'test';

    expect(sqlExcludePr10E2eIntegrationUsersFilter()).toBe('');
  });

  test('excludes PR-10 e2e email domain on production runtime', () => {
    delete process.env.DEV_PAYMENT_MODE;
    process.env.NODE_ENV = 'production';
    process.env.CONTEXT = 'production';

    const sql = sqlExcludePr10E2eIntegrationUsersFilter();
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain(PR10_E2E_EMAIL_DOMAIN);
    expect(sql).toContain('users u');
  });
});
