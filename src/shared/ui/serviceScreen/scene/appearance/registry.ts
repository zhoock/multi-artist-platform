export type AppearanceId = 'ambient';

/** Color, opacity, glow, fog, point size — visual surface of matter. */
export type AppearanceProfile = {
  id: AppearanceId;
  color: number;
  baseOpacity: number;
  opacityPulse: number;
  pointSize: number;
  fogColor: number;
  fogDensity: number;
};

export const APPEARANCE_PRESETS: Record<AppearanceId, AppearanceProfile> = {
  ambient: {
    id: 'ambient',
    color: 0xd4c078,
    baseOpacity: 0.8,
    opacityPulse: 0.04,
    pointSize: 0.052,
    fogColor: 0x050508,
    fogDensity: 0.34,
  },
};

export function getAppearance(id: AppearanceId): AppearanceProfile {
  return APPEARANCE_PRESETS[id];
}
