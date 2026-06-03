import React, { useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { Lock as LockIcon } from 'lucide-react';
import type { TracksProps, IAlbums } from '@models';
import { normalizeTrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { isTrackPlaybackBlocked } from '@shared/lib/tracks/trackPlayback';
import type { AppStore, RootState } from '@shared/model/appStore/types';
import { fallbackAlbumClientId } from '@shared/lib/albumClientId';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

function formatDuration(duration?: number | string): string {
  // Если duration не задан или не является валидным числом
  if (duration == null) return '--:--';

  // Преобразуем в число, если это строка
  let durationNum: number;
  if (typeof duration === 'string') {
    durationNum = parseFloat(duration);
    if (isNaN(durationNum) || !Number.isFinite(durationNum)) return '--:--';
  } else {
    durationNum = duration;
    if (!Number.isFinite(durationNum)) return '--:--';
  }

  // duration хранится в секундах в БД
  // Убеждаемся, что это положительное число
  if (durationNum < 0) return '--:--';

  const mins = Math.floor(durationNum / 60);
  const secs = Math.floor(durationNum % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Сравнение id треков из плейлиста и каталога (API/нормализация slice дают number vs string). */
function isSameTrackId(
  a: string | number | null | undefined,
  b: string | number | null | undefined
): boolean {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

/** Однозначная подпись набора треков: тот же альбом даже при расхождении player.albumId (главная vs страница альбома). */
function buildPlaylistSignature(list: TracksProps[]): string {
  if (!list.length) return '';
  return `${list.length}:${list
    .map((t) => String(t.id))
    .sort()
    .join('|')}`;
}

type TrackListProps = {
  tracks: TracksProps[];
  album: IAlbums;
  onSelectTrack: (payload: {
    index: number;
    track: TracksProps;
    isActive: boolean;
    isPlayingNow: boolean;
  }) => void;
  store: AppStore;
};

export function TrackList({ tracks, album, store, onSelectTrack }: TrackListProps) {
  const initialState = store.getState() as RootState;
  const [activeIndex, setActiveIndex] = React.useState(initialState.player.currentTrackIndex);
  const [isPlaying, setIsPlaying] = React.useState(initialState.player.isPlaying);
  const [shuffle, setShuffle] = React.useState(initialState.player.shuffle);
  const [currentTrackId, setCurrentTrackId] = React.useState<string | number | null>(() => {
    const playerState = (store.getState() as RootState).player;
    return playerState.playlist[playerState.currentTrackIndex]?.id ?? null;
  });
  const [currentAlbumId, setCurrentAlbumId] = React.useState<string | null>(
    (store.getState() as RootState).player.albumId ?? null
  );
  const [progress, setProgress] = React.useState((store.getState() as RootState).player.progress);
  const [playerPlaylistSignature, setPlayerPlaylistSignature] = React.useState(() =>
    buildPlaylistSignature(initialState.player.playlist)
  );

  const albumUniqueId = useMemo(() => fallbackAlbumClientId(album), [album]);

  const pagePlaylistSignature = useMemo(() => buildPlaylistSignature(tracks), [tracks]);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      const playerState = (store.getState() as RootState).player;
      setActiveIndex(playerState.currentTrackIndex);
      setIsPlaying(playerState.isPlaying);
      setShuffle(playerState.shuffle);
      setCurrentAlbumId(playerState.albumId ?? null);
      setCurrentTrackId(playerState.playlist[playerState.currentTrackIndex]?.id ?? null);
      setProgress(playerState.progress);
      setPlayerPlaylistSignature(buildPlaylistSignature(playerState.playlist));
    });
    const currentState = store.getState() as RootState;
    setActiveIndex(currentState.player.currentTrackIndex);
    setIsPlaying(currentState.player.isPlaying);
    setShuffle(currentState.player.shuffle);
    setCurrentAlbumId(currentState.player.albumId ?? null);
    setCurrentTrackId(
      currentState.player.playlist[currentState.player.currentTrackIndex]?.id ?? null
    );
    setProgress(currentState.player.progress);
    setPlayerPlaylistSignature(buildPlaylistSignature(currentState.player.playlist));
    return unsubscribe;
  }, [store]);

  return (
    <div className="tracks">
      {tracks?.map((track, index) => {
        const isCurrentAlbumById = currentAlbumId === albumUniqueId;
        const isCurrentAlbumByPlaylist =
          pagePlaylistSignature.length > 0 &&
          playerPlaylistSignature.length > 0 &&
          pagePlaylistSignature === playerPlaylistSignature;
        const isCurrentAlbum = isCurrentAlbumById || isCurrentAlbumByPlaylist;

        const rowMatchesCurrentTrack =
          currentTrackId != null && isSameTrackId(currentTrackId, track.id);
        const isActive =
          isCurrentAlbum && (shuffle ? rowMatchesCurrentTrack : activeIndex === index);
        const isPlayingNow = isCurrentAlbum && isPlaying && rowMatchesCurrentTrack;

        const visibility = normalizeTrackVisibility(track.visibility);
        const isSubscribersOnly = visibility === 'subscribers_only';
        const playbackLocked = isTrackPlaybackBlocked(track);

        // Логируем для отладки, если duration отсутствует
        if (track.duration == null && index === 0) {
          console.warn(
            `[TrackList] ⚠️ Track ${track.id} (${track.title}) has no duration. Type: ${typeof track.duration}, Value:`,
            track.duration
          );
        }

        return (
          <button
            key={track.id}
            type="button"
            className={clsx('tracks__btn', {
              active: isActive,
              'tracks__btn--playing': isPlayingNow,
              'tracks__btn--locked': playbackLocked,
            })}
            style={
              isPlayingNow
                ? {
                    ['--progress' as string]: `${progress}%`,
                  }
                : undefined
            }
            aria-label={playbackLocked ? `Недоступно: ${track.title}` : 'Кнопка с названием песни'}
            aria-description={
              playbackLocked
                ? `Трек недоступен без покупки: ${track.title}`
                : isSubscribersOnly
                  ? `Для гостей — после покупки альбома. ${track.title}`
                  : isPlayingNow
                    ? `Остановить воспроизведение: ${track.title}`
                    : `Воспроизвести: ${track.title}`
            }
            onClick={() => onSelectTrack({ index, track, isActive, isPlayingNow })}
          >
            <span className="tracks__symbol">
              {playbackLocked ? (
                <span className="tracks__symbol-lock" aria-hidden>
                  <LockIcon
                    {...dashboardActionIconProps({
                      size: 18,
                      className: 'tracks__lock-icon tracks__lock-icon--lead',
                    })}
                  />
                </span>
              ) : (
                <>
                  <span className="tracks__symbol-index">{index + 1}</span>
                  <span className="tracks__symbol-play icon-controller-play" aria-hidden></span>
                  <span className="tracks__symbol-pause icon-controller-pause" aria-hidden></span>
                  <span className="tracks__symbol-equalizer" aria-hidden>
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </>
              )}
            </span>
            <span className="tracks__title">
              <span className="tracks__title-text">{track.title}</span>
            </span>
            <span className="tracks__duration">{formatDuration(track.duration)}</span>
          </button>
        );
      })}
    </div>
  );
}
