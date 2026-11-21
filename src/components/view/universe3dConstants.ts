/** sessionStorage key: set before opening `/?artist=`, read on home cloud init to focus camera. */
export const UNIVERSE_FOCUS_ARTIST_STORAGE_KEY = 'focusArtist';

/** Hero artist-page embed: rest camera Z (matches Universe3D hero init). */
export const HERO_PREVIEW_CAMERA_Z = 0.92;

/** Hero navigate hover: balance between responsiveness and no zoom-jump. */
export const HERO_PREVIEW_NAVIGATE_HOVER_LERP = 0.09;

export const HERO_PREVIEW_IDLE_TIME_STEP = 0.01;
export const HERO_PREVIEW_HOVER_TIME_STEP = 0.012;

export const HERO_PREVIEW_IDLE_BREATH_AMP = 0.04;
/** Slight breath lift on hover — kept small so it does not read as image scale-up. */
export const HERO_PREVIEW_HOVER_BREATH_AMP = 0.046;

/** Fixed camera pull toward scene at full hover (world units from rest Z). */
export const HERO_PREVIEW_HOVER_FORWARD_Z_PULL = 0.022;

export const HERO_PREVIEW_HOVER_PARALLAX_X = 0.022;
export const HERO_PREVIEW_HOVER_PARALLAX_Y = 0.015;

/** Extra nebula shader phase while hovered (flow, not mesh scale). */
export const HERO_PREVIEW_HOVER_SHADER_TIME_BOOST = 2.2;
