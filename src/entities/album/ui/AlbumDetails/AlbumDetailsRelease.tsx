import type { String } from '@models';
import type { AlbumDetails } from '../../model/albumDetails';
import { formatDate } from '@shared/api/albums';
import { useLang } from '@app/providers/lang';
import { functionsMap } from './Functions';

/**
 * Компонент отображает блок с датой релиза альбома.
 */
export default function AlbumDetailsReleased({ album }: { album: AlbumDetails }) {
  const { lang } = useLang() as { lang: keyof typeof functionsMap };
  const { endForTracks, endForMinutes } = functionsMap[lang];

  const convertDurationToMinutes = (duration: number | string | undefined | null): number => {
    if (duration == null) return 0;

    if (typeof duration === 'number') {
      return duration / 60;
    }

    if (typeof duration === 'string') {
      const mmssMatch = duration.match(/^(\d+):(\d{2})$/);
      if (mmssMatch) {
        const minutes = parseInt(mmssMatch[1], 10);
        const seconds = parseInt(mmssMatch[2], 10);
        return minutes + seconds / 60;
      }

      const numDuration = parseFloat(duration);
      if (!isNaN(numDuration) && Number.isFinite(numDuration)) {
        return numDuration / 60;
      }
    }

    return 0;
  };

  const durationInMinutes: number =
    album.tracks?.reduce((sum, track) => sum + convertDurationToMinutes(track.duration), 0) ?? 0;

  const date = typeof album.release?.date === 'string' ? album.release.date : '';
  const UPC = typeof album.release?.UPC === 'string' ? album.release.UPC : '';

  function Block({ date: releaseDate, UPC: upc }: String) {
    return (
      <>
        <time className="album-details__released-time" dateTime={releaseDate}>
          {formatDate(releaseDate)}
        </time>
        <div>
          <small>UPC: {upc}</small>
        </div>
        <div>
          <small>
            {album.tracks.length} {endForTracks(album.tracks.length)},{' '}
            {Number.isFinite(durationInMinutes) && durationInMinutes > 0
              ? `${Math.round(durationInMinutes)} ${endForMinutes(Math.round(durationInMinutes))}`
              : `0 ${endForMinutes(0)}`}
          </small>
        </div>
      </>
    );
  }

  return <Block date={date} UPC={UPC} />;
}
