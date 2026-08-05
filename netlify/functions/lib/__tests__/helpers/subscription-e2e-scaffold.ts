/**
 * Registers test.todo placeholders for PR-10 scenarios (scaffold phase).
 */

import { test } from '@jest/globals';

import { buildTaggedTestName, type E2eScenarioMeta } from './subscription-e2e-tags';

/** Creates Jest todo entries grep-able by @p0 / @p1 / @tier tags. */
export function registerScenarioTodos(scenarios: E2eScenarioMeta[]): void {
  for (const scenario of scenarios) {
    test.todo(buildTaggedTestName(scenario));
  }
}
