import type { MatterConfig } from '../../matter/matterBehavior';

/** Concept #16 — static matter band (no breath / drift / break-zone motion). */
export const BROKEN_LINK_MATTER: Partial<MatterConfig> = {
  breathAmplitude: 0,
  fieldAmplitude: 0,
  introMs: 0,
  particleIntroMs: 0,
  driftAmplitude: 0,
  stretchAmplitude: 0,
  breakZoneDispersion: 0,
};
