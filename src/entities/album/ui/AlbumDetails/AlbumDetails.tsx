import { Link } from 'react-router-dom';

import AlbumDetailsRelease from './AlbumDetailsRelease';
import AlbumDetailsArtwork from './AlbumDetailsArtwork';
import AlbumDetailsMusic from './AlbumDetailsMusic';
import type { String } from '@models';
import type { AlbumDetails as AlbumDetailsData } from '../../model/albumDetails';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  hasPublicAlbumArtworkCredits,
  isAlbumDetailBlockPubliclyVisible,
} from '../../lib/albumDetailPublicVisibility';
import './style.scss';

export type AlbumCopyrightReportLink = {
  to: string;
  label: string;
};

type AlbumDetailsProps = {
  album: AlbumDetailsData;
  copyrightReport?: AlbumCopyrightReportLink;
};

/**
 * Компонент отображает дополнительные данные об альбоме.
 */
export default function AlbumDetails({ album, copyrightReport }: AlbumDetailsProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const titles = (ui?.titles as String | undefined) ?? {};
  const { music, release, albumCover } = titles;

  const visibleMusicDetails = Array.isArray(album.details)
    ? album.details.filter(isAlbumDetailBlockPubliclyVisible)
    : [];
  const hasMusicMetadata = visibleMusicDetails.length > 0;
  const hasArtworkMetadata = hasPublicAlbumArtworkCredits(album.artwork);
  const hasReleaseMetadata = Boolean(release);
  const hasMetadataColumns = hasMusicMetadata || hasReleaseMetadata || hasArtworkMetadata;
  const showCopyrightReport = Boolean(copyrightReport);

  if (!hasMetadataColumns && !showCopyrightReport) {
    return null;
  }

  return (
    <section className="album-details nested-background">
      {hasMetadataColumns && <hr />}
      {hasMetadataColumns && (
        <div className="wrapper album__wrapper">
          {hasMusicMetadata && (
            <div className="item">
              <div className="album-details__music">
                {music && <h2>{music}</h2>}
                <AlbumDetailsMusic album={{ ...album, details: visibleMusicDetails }} />
              </div>
            </div>
          )}
          <div className="item item-release">
            <div className="album-details__released">
              {release && <h2>{release}</h2>}
              <AlbumDetailsRelease album={album} />
              {hasArtworkMetadata && <hr />}
            </div>
            {hasArtworkMetadata && (
              <div className="album-details__artwork">
                {albumCover && <h2>{albumCover}</h2>}
                <AlbumDetailsArtwork album={album} />
                <hr />
              </div>
            )}
          </div>
        </div>
      )}
      {copyrightReport && (
        <div className="wrapper album__wrapper">
          <div
            className={`item album-details__copyright${hasMetadataColumns ? ' album-details__copyright--after-metadata' : ''}`}
          >
            <Link className="album-details__copyright-link" to={copyrightReport.to}>
              {copyrightReport.label}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
