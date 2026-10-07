import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';

import type { Universe3dArtistCardPlayLabels } from '@/components/view/universe3dArtistCardPlayButton';

export function resolveHomeArtistCardPlayLabels(
  lang: SupportedLang,
  ui: IInterface | null | undefined
): Universe3dArtistCardPlayLabels {
  const play = ui?.buttons?.playButton?.trim() || (lang === 'ru' ? 'Воспроизвести' : 'Play');
  const starting = lang === 'ru' ? 'Загрузка…' : 'Loading…';
  const pause =
    (ui?.buttons as { pause?: string } | undefined)?.pause?.trim() ||
    (lang === 'ru' ? 'Пауза' : 'Pause');
  return { play, starting, pause };
}

/** @deprecated use resolveHomeArtistCardPlayLabels */
export const resolveHomeArtistPlayStartingLabels = resolveHomeArtistCardPlayLabels;
