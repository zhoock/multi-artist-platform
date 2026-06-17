import type { LucideProps } from 'lucide-react';

export const PLAYER_TRANSPORT_ICON_SIZE = 36;
export const PLAYER_TRANSPORT_PLAY_ICON_SIZE = 48;
export const PLAYER_SECONDARY_ICON_SIZE = 28;
export const PLAYER_VOLUME_ICON_SIZE = 22;
export const PLAYER_MINI_ICON_SIZE = 32;
export const TRACK_LIST_PLAY_ICON_SIZE = 16;
export const TRACK_LIST_PAUSE_ICON_SIZE = 17;
export const ALBUM_PLAY_BUTTON_ICON_SIZE = 19;
export const LYRICS_MODAL_TRANSPORT_ICON_SIZE = 24;
export const MIXER_WAVE_PLAY_ICON_SIZE = 22;
export const MIXER_TRANSPORT_PLAY_ICON_SIZE = 25;
export const PLAYER_ICON_STROKE_WIDTH = 2;

export function playerIconProps(size: number, overrides?: Partial<LucideProps>): LucideProps {
  return {
    size,
    strokeWidth: PLAYER_ICON_STROKE_WIDTH,
    'aria-hidden': true,
    ...overrides,
  };
}

export function playerTransportIconProps(
  size: number,
  overrides?: Partial<LucideProps>
): LucideProps {
  return playerIconProps(size, {
    fill: 'currentColor',
    ...overrides,
  });
}
