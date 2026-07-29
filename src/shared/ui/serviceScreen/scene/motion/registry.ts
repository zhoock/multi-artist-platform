import type { MatterConfig } from '../matter/matterBehavior';

export type MotionId = 'assemble' | 'drift' | 'pulse' | 'idle';

/** How a shape lives — rhythm and field modulation. */
export type MotionProfile = {
  id: MotionId;
  breathPeriodScale: number;
  fieldSpeedScale: number;
  matterOverrides?: Partial<MatterConfig>;
};

export const MOTION_PROFILES: Record<MotionId, MotionProfile> = {
  assemble: {
    id: 'assemble',
    breathPeriodScale: 1,
    fieldSpeedScale: 1,
  },
  drift: {
    id: 'drift',
    breathPeriodScale: 1.15,
    fieldSpeedScale: 0.85,
  },
  pulse: {
    id: 'pulse',
    breathPeriodScale: 0.75,
    fieldSpeedScale: 1.1,
    matterOverrides: { breathAmplitude: 0.032 },
  },
  idle: {
    id: 'idle',
    breathPeriodScale: 1.2,
    fieldSpeedScale: 0.7,
    matterOverrides: { fieldAmplitude: 0.0012 },
  },
};

export function getMotionProfile(id: MotionId): MotionProfile {
  return MOTION_PROFILES[id];
}
