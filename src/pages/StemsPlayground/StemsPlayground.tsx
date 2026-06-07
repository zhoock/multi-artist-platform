// src/pages/StemsPlayground/StemsPlayground.tsx
import { useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useMixerCatalog } from './lib/useMixerCatalog';
import { useMixerNavigation } from './lib/useMixerNavigation';
import { pluralizeTracks, type TrackCountLabels } from './lib/pluralizeTracks';
import { formatTrackDuration } from './lib/formatTrackDuration';
import { MixerAlbumList } from './components/MixerAlbumList';
import { MixerTrackList } from './components/MixerTrackList';
import { MixerBackNav } from './components/MixerBackNav';
import { MixerPlayerPanel } from './components/MixerPlayerPanel';
import './style.scss';

export default function StemsPlayground() {
  const { lang } = useLang();
  const { albums, loading } = useMixerCatalog();
  const {
    view,
    selectedAlbum,
    selectedTrack,
    selectAlbum,
    selectTrack,
    backToAlbums,
    backToTracks,
  } = useMixerNavigation(albums);

  const sectionRef = useRef<HTMLElement | null>(null);

  const { pathname } = useLocation();
  const origin =
    (typeof window !== 'undefined' && window.location.origin) || 'https://smolyanoechuchelko.ru';
  const canonical = `${origin}${pathname}`;

  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const stems = (ui?.stems ?? {}) as Record<string, string>;
  const buttons = (ui?.buttons ?? {}) as Record<string, string>;

  const pageTitle = stems.pageTitle ?? 'Mixer';
  const selectAlbumHint = stems.selectAlbumHint ?? '';
  const selectTrackHint = stems.selectTrackHint ?? '';
  const noAlbumsLabel = stems.noAlbums ?? '';
  const loadingLabel = stems.loading ?? '…';

  const trackCountLabels: TrackCountLabels = {
    one: stems.tracksCountOne ?? '{count}',
    few: stems.tracksCountFew ?? '{count}',
    many: stems.tracksCountMany ?? '{count}',
  };

  const playerLabels = {
    play: buttons.playButton ?? 'Play',
    pause: buttons.pause ?? 'Pause',
    solo: stems.solo ?? 'Solo',
    mute: stems.mute ?? 'Mute',
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, []);

  // При переходе на уровень треков/микшера подтягиваем секцию в зону видимости.
  useEffect(() => {
    if (view === 'albums') return;
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [view]);

  return (
    <section className="stems-page main-background" aria-label="Блок c миксером" ref={sectionRef}>
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={selectAlbumHint || pageTitle} />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:description" content={selectAlbumHint || pageTitle} />
        <meta property="og:url" content={canonical} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={selectAlbumHint || pageTitle} />
      </Helmet>

      <div className="wrapper mixer">
        <h2 className="mixer__title">{pageTitle}</h2>

        {view === 'albums' && (
          <>
            {selectAlbumHint ? <p className="mixer-level__hint">{selectAlbumHint}</p> : null}
            <MixerAlbumList
              albums={albums}
              loading={loading}
              lang={lang}
              trackCountLabels={trackCountLabels}
              emptyLabel={noAlbumsLabel}
              loadingLabel={loadingLabel}
              onSelectAlbum={selectAlbum}
            />
          </>
        )}

        {view === 'tracks' && selectedAlbum && (
          <>
            <MixerBackNav onBack={backToAlbums} ariaLabel={selectAlbumHint || pageTitle}>
              <span className="mixer-back__title">{selectedAlbum.title}</span>
              <span className="mixer-back__meta">
                {[
                  selectedAlbum.year,
                  pluralizeTracks(selectedAlbum.tracks.length, lang, trackCountLabels),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </MixerBackNav>
            <MixerTrackList tracks={selectedAlbum.tracks} onSelectTrack={selectTrack} />
            {selectTrackHint ? <p className="mixer-level__hint">{selectTrackHint}</p> : null}
          </>
        )}

        {view === 'mixer' && selectedAlbum && selectedTrack && (
          <>
            <MixerBackNav onBack={backToTracks} ariaLabel={selectTrackHint || pageTitle}>
              <span className="mixer-back__title">{selectedTrack.title}</span>
              <span className="mixer-back__meta">
                {[selectedAlbum.title, formatTrackDuration(selectedTrack.duration)]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </MixerBackNav>
            <MixerPlayerPanel key={selectedTrack.id} track={selectedTrack} labels={playerLabels} />
          </>
        )}
      </div>
    </section>
  );
}
