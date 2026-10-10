/**
 * Fail-closed scheduler run mode: only explicit SUBSCRIPTION_SCHEDULER_LIVE=true enables real renewals.
 */

import { describe, expect, test } from '@jest/globals';

import {
  describeSchedulerModeFlags,
  resolveSchedulerRunMode,
} from '../subscription-renewal-scheduler-mode';

describe('resolveSchedulerRunMode', () => {
  test('empty env → blocked (live_flag_unset)', () => {
    expect(resolveSchedulerRunMode({})).toEqual({ mode: 'blocked', reason: 'live_flag_unset' });
  });

  test('exact live=true → live', () => {
    expect(resolveSchedulerRunMode({ SUBSCRIPTION_SCHEDULER_LIVE: 'true' })).toEqual({
      mode: 'live',
    });
  });

  test('live=false → blocked (live_flag_disabled)', () => {
    expect(resolveSchedulerRunMode({ SUBSCRIPTION_SCHEDULER_LIVE: 'false' })).toEqual({
      mode: 'blocked',
      reason: 'live_flag_disabled',
    });
  });

  test.each(['1', 'yes', '', ' ', 'ture', 'TRUE', 'True', ' true', 'true ', 'on', 'enabled'])(
    'live=%p → blocked (live_flag_invalid)',
    (value) => {
      expect(resolveSchedulerRunMode({ SUBSCRIPTION_SCHEDULER_LIVE: value })).toEqual({
        mode: 'blocked',
        reason: 'live_flag_invalid',
      });
    }
  );

  test.each(['true', 'TRUE', ' true ', 'True'])('dry-run=%p wins over live=true', (value) => {
    expect(
      resolveSchedulerRunMode({
        SUBSCRIPTION_SCHEDULER_DRY_RUN: value,
        SUBSCRIPTION_SCHEDULER_LIVE: 'true',
      })
    ).toEqual({ mode: 'dry_run' });
  });

  test.each(['1', 'yes', 'ture', 'on'])(
    'invalid dry-run=%p blocks even with live=true',
    (value) => {
      expect(
        resolveSchedulerRunMode({
          SUBSCRIPTION_SCHEDULER_DRY_RUN: value,
          SUBSCRIPTION_SCHEDULER_LIVE: 'true',
        })
      ).toEqual({ mode: 'blocked', reason: 'dry_run_flag_invalid' });
    }
  );

  test.each(['', 'false', ' FALSE '])('dry-run=%p is treated as off', (value) => {
    expect(
      resolveSchedulerRunMode({
        SUBSCRIPTION_SCHEDULER_DRY_RUN: value,
        SUBSCRIPTION_SCHEDULER_LIVE: 'true',
      })
    ).toEqual({ mode: 'live' });
  });
});

describe('describeSchedulerModeFlags', () => {
  test('reports flag states, never raw values', () => {
    const flags = describeSchedulerModeFlags({
      SUBSCRIPTION_SCHEDULER_LIVE: 'secret-looking-typo',
      SUBSCRIPTION_SCHEDULER_DRY_RUN: 'true',
    });

    expect(flags).toEqual({ liveFlag: 'invalid', dryRunFlag: 'true' });
    expect(JSON.stringify(flags)).not.toContain('secret-looking-typo');
  });
});
