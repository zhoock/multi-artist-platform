import { describe, expect, it } from '@jest/globals';
import { shouldApplyRemoteStemsLoad } from '../mixerTrackStemsLoadGuard';

describe('shouldApplyRemoteStemsLoad', () => {
  it('accepts when generation and revision unchanged', () => {
    expect(
      shouldApplyRemoteStemsLoad({
        currentLoadGeneration: 2,
        expectedLoadGeneration: 2,
        localRevisionAtLoadStart: 0,
        currentLocalRevision: 0,
      })
    ).toBe(true);
  });

  it('rejects superseded load generation', () => {
    expect(
      shouldApplyRemoteStemsLoad({
        currentLoadGeneration: 3,
        expectedLoadGeneration: 2,
        localRevisionAtLoadStart: 0,
        currentLocalRevision: 0,
      })
    ).toBe(false);
  });

  it('rejects when local mutation happened after load started', () => {
    expect(
      shouldApplyRemoteStemsLoad({
        currentLoadGeneration: 1,
        expectedLoadGeneration: 1,
        localRevisionAtLoadStart: 0,
        currentLocalRevision: 1,
      })
    ).toBe(false);
  });
});
