import { Pause, Play } from 'lucide-react';

import { renderLucideIconMarkup } from '@shared/lib/lucide/renderLucideIconMarkup';
import {
  playerFilledPlayIconProps,
  playerTransportIconProps,
} from '@shared/ui/icons/playerActionIcon';

export const UNIVERSE3D_ARTIST_CARD_PLAY_BUTTON_PX = 48;
export const UNIVERSE3D_ARTIST_CARD_PLAY_ICON_SIZE = 22;

export function universe3dArtistCardPlayIconMarkup(): string {
  return renderLucideIconMarkup(
    Play,
    playerFilledPlayIconProps(UNIVERSE3D_ARTIST_CARD_PLAY_ICON_SIZE, {
      className: 'universe3d-card__play-glyph-svg universe3d-card__play-glyph-svg--play',
    })
  );
}

export function universe3dArtistCardPauseIconMarkup(): string {
  return renderLucideIconMarkup(
    Pause,
    playerTransportIconProps(UNIVERSE3D_ARTIST_CARD_PLAY_ICON_SIZE, {
      className: 'universe3d-card__play-glyph-svg',
    })
  );
}
