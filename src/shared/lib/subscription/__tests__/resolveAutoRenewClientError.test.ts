import { describe, expect, test } from '@jest/globals';

import { resolveAutoRenewClientError } from '../resolveAutoRenewClientError';

describe('resolveAutoRenewClientError', () => {
  test('replaces FEATURE_DISABLED with generic copy', () => {
    expect(
      resolveAutoRenewClientError(
        { code: 'FEATURE_DISABLED', error: 'Auto-renew is not enabled' },
        'Could not update auto-renew'
      )
    ).toBe('Could not update auto-renew');
  });

  test('passes through other API errors', () => {
    expect(
      resolveAutoRenewClientError(
        { code: 'INVALID_TRANSITION', error: 'Transition not allowed' },
        'Could not update auto-renew'
      )
    ).toBe('Transition not allowed');
  });

  test('falls back when error text is missing', () => {
    expect(resolveAutoRenewClientError({ code: 'UNKNOWN' }, 'Generic')).toBe('Generic');
  });
});
