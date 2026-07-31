import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';

type ResolveAlbumNoTracksOwnerDescriptionOptions = {
  artistInCatalog: boolean;
  lang?: SupportedLang;
};

/**
 * Owner empty-album helper: catalog onboarding only before the artist's first public release.
 */
export function resolveAlbumNoTracksOwnerDescription(
  ui: IInterface | null | undefined,
  { artistInCatalog, lang = 'en' }: ResolveAlbumNoTracksOwnerDescriptionOptions
): string {
  const d = ui?.dashboard;
  const ru = lang === 'ru';

  if (artistInCatalog) {
    return (
      d?.albumNoTracksOwnerDescriptionNeutral ??
      (ru
        ? 'Загрузите треки, чтобы опубликовать этот альбом.'
        : 'Upload tracks to publish this album.')
    );
  }

  return (
    d?.albumNoTracksOwnerDescription ??
    (ru
      ? 'После публикации артист появится в каталоге и поиске.'
      : 'After publishing, your artist profile will appear in the catalog and search.')
  );
}
