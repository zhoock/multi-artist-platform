import {
  canClaimTrackProcessingLock,
  claimTrackProcessingLockSql,
  releaseTrackProcessingLockSql,
  shouldRefuseInFlightTrackReprocess,
  TRACK_PROCESSING_LOCK_LEASE_INTERVAL,
  TRACK_PROCESSING_LOCK_LEASE_MS,
} from '../trackProcessingLock';

describe('track processing lock', () => {
  const now = 1_700_000_000_000;

  test('claim sql is a single conditional update and does not use a session advisory lock', () => {
    const sql = claimTrackProcessingLockSql();
    expect(sql).toContain('UPDATE tracks');
    expect(sql).toContain('processing_lock_token = $2');
    expect(sql).toContain('processing_lock_token IS NULL');
    expect(sql).toContain('processing_locked_at IS NULL');
    expect(sql).toContain(
      `processing_locked_at < NOW() - INTERVAL '${TRACK_PROCESSING_LOCK_LEASE_INTERVAL}'`
    );
    expect(sql).toContain('RETURNING id');
    expect(sql).not.toContain('pg_try_advisory_lock');
    expect(sql).not.toContain(';');
    expect(releaseTrackProcessingLockSql()).toContain('processing_lock_token = $2');
  });

  test('a free or stale row can be claimed, a fresh claim cannot', () => {
    expect(canClaimTrackProcessingLock({ token: null, lockedAtMs: null }, now)).toBe(true);
    expect(canClaimTrackProcessingLock({ token: 'owner', lockedAtMs: null }, now)).toBe(true);
    expect(
      canClaimTrackProcessingLock(
        { token: 'owner', lockedAtMs: now - TRACK_PROCESSING_LOCK_LEASE_MS },
        now
      )
    ).toBe(false);
    expect(
      canClaimTrackProcessingLock(
        { token: 'owner', lockedAtMs: now - TRACK_PROCESSING_LOCK_LEASE_MS - 1 },
        now
      )
    ).toBe(true);
  });

  test('in-flight regenerate is refused until the previous claim is stale', () => {
    expect(
      shouldRefuseInFlightTrackReprocess({ processingStatus: 'pending', lockStale: false })
    ).toBe(true);
    expect(
      shouldRefuseInFlightTrackReprocess({ processingStatus: 'processing', lockStale: false })
    ).toBe(true);
    expect(
      shouldRefuseInFlightTrackReprocess({ processingStatus: 'processing', lockStale: true })
    ).toBe(false);
    expect(
      shouldRefuseInFlightTrackReprocess({ processingStatus: 'failed', lockStale: false })
    ).toBe(false);
    expect(
      shouldRefuseInFlightTrackReprocess({ processingStatus: 'ready', lockStale: false })
    ).toBe(false);
  });
});
