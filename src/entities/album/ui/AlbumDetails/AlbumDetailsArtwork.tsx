import type { AlbumDetails } from '../../model/albumDetails';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';

/**
 * Компонент отображает блок с информацией об обложке альбома.
 */
export default function AlbumDetailsArtwork({ album }: { album: AlbumDetails }) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const art = album.artwork;
  const photographer = art.photographer;
  const photographerURL = art.photographerURL;
  const designer = art.designer;
  const designerURL = art.designerURL;
  const titles = ui?.titles ?? {};

  return (
    <>
      {photographer && (
        <>
          <h3>{titles.photo ?? 'Фото'}</h3>
          <div className="album-details__artwork-photographer">
            {photographerURL ? (
              <a
                className="album-details__link"
                href={photographerURL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {photographer}
              </a>
            ) : (
              photographer
            )}
          </div>
        </>
      )}

      <h3>{titles.design ?? 'Дизайн'}</h3>
      <div className="album-details__artwork-designer">
        {designerURL ? (
          <a
            className="album-details__link"
            href={designerURL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {designer}
          </a>
        ) : (
          designer
        )}
      </div>
    </>
  );
}
