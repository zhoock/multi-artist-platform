import type { IInterface, DashboardTrackVisibilityLabels } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';

type DashboardUi = NonNullable<IInterface['dashboard']>;
type DashboardUiWithTrackAccess = DashboardUi & {
  trackVisibility?: DashboardTrackVisibilityLabels;
  albumVisibility?: DashboardTrackVisibilityLabels;
};

export type AlbumVisibilityMenuOption = {
  value: Extract<TrackVisibility, 'public' | 'hidden'>;
  label: string;
  description: string;
};

const ALBUM_VISIBILITY_VALUES = ['public', 'hidden'] as const satisfies readonly Extract<
  TrackVisibility,
  'public' | 'hidden'
>[];

export function getAlbumVisibilityFromIsPublic(
  isPublic: boolean | undefined
): Extract<TrackVisibility, 'public' | 'hidden'> {
  return isPublic === false ? 'hidden' : 'public';
}

export function albumVisibilityToIsPublic(visibility: TrackVisibility): boolean {
  return visibility !== 'hidden';
}

export function buildAlbumVisibilityMenuOptions(
  ui: IInterface | undefined,
  lang: SupportedLang
): AlbumVisibilityMenuOption[] {
  const d = ui?.dashboard as DashboardUiWithTrackAccess | undefined;
  const t = d?.albumVisibility ?? d?.trackVisibility;
  const en = lang === 'en';
  const fallbacks = {
    public: {
      title: en ? 'Visible' : 'Видим',
      description: en
        ? 'Album is shown on your artist page'
        : 'Альбом отображается на странице артиста',
    },
    hidden: {
      title: en ? 'Hidden' : 'Скрыт',
      description: en
        ? 'Album is hidden from your artist page'
        : 'Альбом скрыт на странице артиста',
    },
  } as const;

  return ALBUM_VISIBILITY_VALUES.map((value) => {
    const block = value === 'public' ? t?.public : t?.hidden;
    const fb = value === 'public' ? fallbacks.public : fallbacks.hidden;
    return {
      value,
      label: block?.title ?? fb.title,
      description: block?.description ?? fb.description,
    };
  });
}
