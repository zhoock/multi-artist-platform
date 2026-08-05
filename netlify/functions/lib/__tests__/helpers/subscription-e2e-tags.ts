/**
 * PR-10 scenario tagging utilities.
 * @see docs/adr/pr-10-e2e-specification.md §2, §8
 */

export const E2E_TAG = {
  P0: '@p0',
  P1: '@p1',
  P2: '@p2',
  FLAG_ON: '@flag-on',
  FLAG_OFF: '@flag-off',
  TIER1: '@tier1',
  TIER2: '@tier2',
  TIER3: '@tier3',
  KNOWN_GAP_I2: '@known-gap-I2',
} as const;

export type E2ePriority = 'P0' | 'P1' | 'P2';

export type E2eScenarioMeta = {
  id: string;
  title: string;
  priority: E2ePriority;
  flags?: Array<'on' | 'off' | 'both'>;
  tier: 'tier1-backend' | 'tier2-ui' | 'tier3-smoke';
  knownGaps?: string[];
};

const PRIORITY_TAG: Record<E2ePriority, string> = {
  P0: E2E_TAG.P0,
  P1: E2E_TAG.P1,
  P2: E2E_TAG.P2,
};

/** Builds a Jest test name grep-able by CI profiles (quick / nightly / full). */
export function buildTaggedTestName(meta: E2eScenarioMeta): string {
  const parts = [meta.id, meta.title, PRIORITY_TAG[meta.priority]];

  if (meta.flags?.includes('on') || meta.flags?.includes('both')) {
    parts.push(E2E_TAG.FLAG_ON);
  }
  if (meta.flags?.includes('off') || meta.flags?.includes('both')) {
    parts.push(E2E_TAG.FLAG_OFF);
  }

  if (meta.tier === 'tier1-backend') parts.push(E2E_TAG.TIER1);
  if (meta.tier === 'tier2-ui') parts.push(E2E_TAG.TIER2);
  if (meta.tier === 'tier3-smoke') parts.push(E2E_TAG.TIER3);

  if (meta.knownGaps?.includes('I2')) {
    parts.push(E2E_TAG.KNOWN_GAP_I2);
  }

  return parts.join(' ');
}

/** Regex fragment for npm script testNamePattern (quick = P0 only). */
export const E2E_NAME_PATTERN = {
  quick: '@p0',
  nightly: '@p0|@p1',
  full: '@p0|@p1|@p2',
} as const;
