import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';

import type { Universe3dArtistCardPlayLabels } from '@/components/view/universe3dArtistCardPlayButton';

function capitalizeFirstLetter(label: string, lang: SupportedLang): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  const locale = lang === 'ru' ? 'ru' : 'en';
  return trimmed.charAt(0).toLocaleUpperCase(locale) + trimmed.slice(1);
}

export function resolveHomeArtistCardPlayLabels(
  lang: SupportedLang,
  ui: IInterface | null | undefined
): Universe3dArtistCardPlayLabels {
  const play = ui?.buttons?.playButton?.trim() || (lang === 'ru' ? 'Воспроизвести' : 'Play');
  const starting = lang === 'ru' ? 'Загрузка…' : 'Loading…';
  const pauseRaw =
    (ui?.buttons as { pause?: string } | undefined)?.pause?.trim() ||
    (lang === 'ru' ? 'Пауза' : 'Pause');
  const pause = capitalizeFirstLetter(pauseRaw, lang);
  return { play, starting, pause };
}

/** @deprecated use resolveHomeArtistCardPlayLabels */
export const resolveHomeArtistPlayStartingLabels = resolveHomeArtistCardPlayLabels;
