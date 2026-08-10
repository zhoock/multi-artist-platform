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

  test('uses generic copy for unknown coded API errors', () => {
    expect(
      resolveAutoRenewClientError(
        { code: 'INVALID_TRANSITION', error: 'Transition not allowed' },
        'Could not update auto-renew'
      )
    ).toBe('Could not update auto-renew');
  });

  test('falls back when error text is missing', () => {
    expect(resolveAutoRenewClientError({ code: 'UNKNOWN' }, 'Generic')).toBe('Generic');
  });
});
