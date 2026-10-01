/** Full Player ambient gradient — keep duration in sync with `popup/style.scss`. */
export const PLAYER_AMBIENT_GRADIENT_DURATION_S = 20;

export const PLAYER_AMBIENT_GRADIENT_EASING = 'linear' as const;

export const PLAYER_AMBIENT_GRADIENT_KEYFRAMES_NAME = 'player-gradient-rotate';

export const PLAYER_AMBIENT_GRADIENT_CLASSES = {
  outer: 'popup__gradient',
  inner: 'popup__gradient-inner',
} as const;

/** Inner layer uses transform rotation; no JS/CSS phase reset. */
export const PLAYER_AMBIENT_GRADIENT_USES_TRANSFORM_LOOP = true;
