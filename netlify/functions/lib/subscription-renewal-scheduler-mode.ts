/**
 * Fail-closed run mode for the scheduled renewal handler.
 * Authorization (SUBSCRIPTION_CRON_SECRET) proves who is calling; it never selects live mode.
 *
 * - SUBSCRIPTION_SCHEDULER_DRY_RUN=true → read-only preview (wins over everything else).
 * - SUBSCRIPTION_SCHEDULER_LIVE=true (exact) and dry-run off → real renewal cycle.
 * - Anything else (unset, typo, `1`, `yes`, whitespace, invalid dry-run value) → blocked.
 */

export type SchedulerFlagState = 'unset' | 'true' | 'false' | 'invalid';

export type SchedulerRunMode =
  | { mode: 'dry_run' }
  | { mode: 'live' }
  | {
      mode: 'blocked';
      reason:
        | 'live_flag_unset'
        | 'live_flag_disabled'
        | 'live_flag_invalid'
        | 'dry_run_flag_invalid';
    };

export type SchedulerModeDiagnostics = {
  liveFlag: SchedulerFlagState;
  dryRunFlag: SchedulerFlagState;
};

type SchedulerModeEnv = Record<string, string | undefined>;

/** Exact match only: the live flag must be written deliberately. */
function classifyLiveFlag(raw: string | undefined): SchedulerFlagState {
  if (raw === undefined) return 'unset';
  if (raw === 'true') return 'true';
  if (raw === 'false') return 'false';
  return 'invalid';
}

/** Lenient on the safe side: any casing/whitespace of `true` still enables dry-run. */
function classifyDryRunFlag(raw: string | undefined): SchedulerFlagState {
  if (raw === undefined || raw === '') return 'unset';
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') return 'true';
  if (normalized === 'false') return 'false';
  return 'invalid';
}

export function describeSchedulerModeFlags(
  env: SchedulerModeEnv = process.env
): SchedulerModeDiagnostics {
  return {
    liveFlag: classifyLiveFlag(env.SUBSCRIPTION_SCHEDULER_LIVE),
    dryRunFlag: classifyDryRunFlag(env.SUBSCRIPTION_SCHEDULER_DRY_RUN),
  };
}

export function resolveSchedulerRunMode(env: SchedulerModeEnv = process.env): SchedulerRunMode {
  const { liveFlag, dryRunFlag } = describeSchedulerModeFlags(env);

  if (dryRunFlag === 'true') return { mode: 'dry_run' };
  if (dryRunFlag === 'invalid') return { mode: 'blocked', reason: 'dry_run_flag_invalid' };

  if (liveFlag === 'true') return { mode: 'live' };
  if (liveFlag === 'false') return { mode: 'blocked', reason: 'live_flag_disabled' };
  if (liveFlag === 'invalid') return { mode: 'blocked', reason: 'live_flag_invalid' };
  return { mode: 'blocked', reason: 'live_flag_unset' };
}
