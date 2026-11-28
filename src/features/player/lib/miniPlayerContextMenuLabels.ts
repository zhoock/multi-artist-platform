import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';

export type MiniPlayerContextMenuLabels = {
  goToAlbum: string;
  goToArtist: string;
  openMixer: string;
  addToCollection: string;
  hideMiniPlayer: string;
  menuLabel: string;
};

const FALLBACK: Record<SupportedLang, MiniPlayerContextMenuLabels> = {
  ru: {
    goToAlbum: 'Перейти к альбому',
    goToArtist: 'Перейти к артисту',
    openMixer: 'Открыть микшер',
    addToCollection: 'Добавить в коллекцию',
    hideMiniPlayer: 'Скрыть мини-плеер',
    menuLabel: 'Действия мини-плеера',
  },
  en: {
    goToAlbum: 'Go to album',
    goToArtist: 'Go to artist',
    openMixer: 'Open mixer',
    addToCollection: 'Add to collection',
    hideMiniPlayer: 'Hide mini player',
    menuLabel: 'Mini player actions',
  },
};

export function getMiniPlayerContextMenuLabels(
  lang: SupportedLang,
  ui: IInterface | null | undefined
): MiniPlayerContextMenuLabels {
  const fb = FALLBACK[lang];
  const menu = ui?.player?.contextMenu;
  return {
    goToAlbum: menu?.goToAlbum?.trim() || fb.goToAlbum,
    goToArtist: menu?.goToArtist?.trim() || fb.goToArtist,
    openMixer: menu?.openMixer?.trim() || ui?.player?.openMixer?.trim() || fb.openMixer,
    addToCollection: menu?.addToCollection?.trim() || fb.addToCollection,
    hideMiniPlayer: menu?.hideMiniPlayer?.trim() || fb.hideMiniPlayer,
    menuLabel: menu?.menuLabel?.trim() || fb.menuLabel,
  };
}
