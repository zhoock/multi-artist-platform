import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import type { RootState } from '@shared/model/appStore/types';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';

export type PlayerA11yLabels = {
  previousTrack: string;
  play: string;
  pause: string;
  nextTrack: string;
  openFullPlayer: string;
  closePlayer: string;
};

const FALLBACK: Record<SupportedLang, PlayerA11yLabels> = {
  ru: {
    previousTrack: 'Предыдущий трек',
    play: 'Воспроизвести',
    pause: 'Пауза',
    nextTrack: 'Следующий трек',
    openFullPlayer: 'Открыть полноэкранный плеер',
    closePlayer: 'Закрыть плеер',
  },
  en: {
    previousTrack: 'Previous track',
    play: 'Play',
    pause: 'Pause',
    nextTrack: 'Next track',
    openFullPlayer: 'Open full player',
    closePlayer: 'Close player',
  },
};

/** Safe when `uiDictionary` slice is absent (tests, partial stores) — falls back via {@link getPlayerA11yLabels}. */
export function selectPlayerUiForA11y(state: RootState, lang: SupportedLang): IInterface | null {
  if (!state.uiDictionary) {
    return null;
  }
  return selectUiDictionaryFirst(state, lang);
}

export function getPlayerA11yLabels(
  lang: SupportedLang,
  ui: IInterface | null | undefined
): PlayerA11yLabels {
  const fb = FALLBACK[lang];
  const p = ui?.player;
  return {
    previousTrack: p?.previousTrack?.trim() || fb.previousTrack,
    play: p?.play?.trim() || fb.play,
    pause: p?.pause?.trim() || fb.pause,
    nextTrack: p?.nextTrack?.trim() || fb.nextTrack,
    openFullPlayer: p?.openFullPlayer?.trim() || fb.openFullPlayer,
    closePlayer: p?.closePlayer?.trim() || fb.closePlayer,
  };
}
