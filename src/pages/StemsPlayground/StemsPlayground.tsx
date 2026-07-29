// src/pages/StemsPlayground/StemsPlayground.tsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { List as ListIcon, Save as SaveIcon } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useEffectiveLocation,
  useEffectiveSearchParams,
} from '@shared/lib/hooks/useEffectiveLocation';
import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { selectPublicArtistSlug, setPublicArtistSlug } from '@shared/model/currentArtist';
import { isAuthenticated } from '@shared/lib/auth';
import { useArtistPageBuilder } from '@shared/lib/hooks/useArtistPageBuilder';
import { selectDashboardAlbumsData } from '@entities/album';
import { transformEditableAlbumsToAlbumData } from '@entities/album/lib/transformEditableAlbumData';
import { withPublicArtistQuery } from '@shared/lib/artistQuery';
import { buildPublicSiteUrl } from '@shared/lib/publicSiteOrigin';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import { ContextNav } from '@shared/ui/contextNav';
import { sanitizeReturnPath } from '@shared/lib/authReturnUrl';
import { useArchiveAccessModal } from '@shared/lib/archiveAccessModal';
import { refreshPremiumContentForArchiveChange } from '@features/artistArchive';
import { queueMixToast } from '@shared/lib/mixToast';
import { MixToast } from '@shared/ui/mixToast';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  createMix,
  deleteMix,
  getMyMixes,
  getSharedMix,
  type SavedMixApiError,
} from '@shared/api/savedMixes';
import type { SavedMix, SharedMix } from '@entities/savedMix';
import { useMixerCatalog } from './lib/useMixerCatalog';
import { useMixerNavigation } from './lib/useMixerNavigation';
import { pluralizeTracks, type TrackCountLabels } from './lib/pluralizeTracks';
import { formatTrackDuration } from './lib/formatTrackDuration';
import { MixerAlbumList } from './components/MixerAlbumList';
import { MixerTrackList } from './components/MixerTrackList';
import { MixerAlbumListSkeleton } from './components/MixerAlbumListSkeleton';
import { MixerTrackListSkeleton } from './components/MixerTrackListSkeleton';
import { MixerBackNav } from './components/MixerBackNav';
import { MixerPlayerPanel, type MixerPlayerPanelHandle } from './components/MixerPlayerPanel';
import { SaveMixModal } from './components/SaveMixModal';
import { MyMixesModal } from './components/MyMixesModal';
import { StemsPlaygroundOwnerEmptyState } from './components/StemsPlaygroundOwnerEmptyState';
import { StemsPlaygroundVisitorEmptyState } from './components/StemsPlaygroundVisitorEmptyState';
import './style.scss';

export default function StemsPlayground() {
  const { lang } = useLang();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useEffectiveLocation();
  const { mixId } = useParams<{ mixId?: string }>();
  const [searchParams] = useEffectiveSearchParams();
  const publicArtistSlugFromStore = useAppSelector(selectPublicArtistSlug);
  const artistSlug = searchParams.get('artist')?.trim() || publicArtistSlugFromStore?.trim() || '';
  const publicArtistSlug = artistSlug || null;

  const { albums, loading, catalogHasStemAlbums, tracksLoadingAlbumId, loadAlbumTracks } =
    useMixerCatalog();
  const {
    view,
    selectedAlbum,
    selectedTrack,
    selectAlbum,
    selectTrack,
    backToAlbums,
    backToTracks,
  } = useMixerNavigation(albums);

  const { requestAccess } = useArchiveAccessModal();

  const handleSelectAlbum = useCallback(
    (albumId: string) => {
      selectAlbum(albumId);
      void loadAlbumTracks(albumId);
    },
    [selectAlbum, loadAlbumTracks]
  );

  const handleSelectTrack = useCallback(
    (trackId: string) => {
      const track = selectedAlbum?.tracks.find((t) => t.id === trackId);
      if (track?.locked) {
        void requestAccess({
          artistUserId: selectedAlbum?.userId,
          artistSlug: publicArtistSlug ?? undefined,
          onAccessGranted: () => {
            refreshPremiumContentForArchiveChange(dispatch, publicArtistSlug, {
              immediate: true,
            });
            if (selectedAlbum?.albumId) {
              void loadAlbumTracks(selectedAlbum.albumId, { force: true });
            }
          },
        });
        return;
      }
      selectTrack(trackId);
    },
    [selectedAlbum, publicArtistSlug, requestAccess, dispatch, selectTrack, loadAlbumTracks]
  );

  useEffect(() => {
    const onArchiveChanged = () => {
      refreshPremiumContentForArchiveChange(dispatch, publicArtistSlug);
      if (selectedAlbum?.albumId) {
        void loadAlbumTracks(selectedAlbum.albumId, { force: true });
      }
    };
    window.addEventListener('archive:changed', onArchiveChanged);
    return () => window.removeEventListener('archive:changed', onArchiveChanged);
  }, [dispatch, publicArtistSlug, selectedAlbum?.albumId, loadAlbumTracks]);

  const sectionRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<MixerPlayerPanelHandle | null>(null);

  const canonical = buildPublicSiteUrl(`${location.pathname}${location.search}`);

  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const stems = (ui?.stems ?? {}) as Record<string, string>;
  const buttons = (ui?.buttons ?? {}) as Record<string, string>;

  const pageTitle = stems.pageTitle ?? 'Mixer';
  const { displayName: siteArtistName } = useSiteArtistDisplayName(lang, {
    artistSlug: artistSlug || null,
  });
  const artistHubPath = withPublicArtistQuery('/', artistSlug);
  const selectAlbumHint = stems.selectAlbumHint ?? '';
  const noAlbumsLabel = stems.noAlbums ?? '';
  const { isOwner, ownerResolved } = useArtistPageBuilder(artistSlug);
  const dashboardAlbumsFromStore = useAppSelector(selectDashboardAlbumsData);

  const showEmptyCatalog = catalogHasStemAlbums === false && !loading && !mixId;
  const showEmptyCatalogResolving = showEmptyCatalog && !ownerResolved;
  const showOwnerEmptyCatalog = showEmptyCatalog && ownerResolved && isOwner;
  const showVisitorEmptyCatalog = showEmptyCatalog && ownerResolved && !isOwner;

  const dashboardAlbums = useMemo(
    () => transformEditableAlbumsToAlbumData(dashboardAlbumsFromStore, siteArtistName, lang),
    [dashboardAlbumsFromStore, siteArtistName, lang]
  );

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

  // ── Saved Mixes state ─────────────────────────────────────────────
  const [toastKey, setToastKey] = useState(0);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [myMixesOpen, setMyMixesOpen] = useState(false);
  const [mixesLoading, setMixesLoading] = useState(false);
  const [mixes, setMixes] = useState<SavedMix[]>([]);
  const [busyMixId, setBusyMixId] = useState<string | null>(null);

  // ── Shared-link (read-only пресет) ────────────────────────────────
  const [sharedMix, setSharedMix] = useState<SharedMix | null>(null);
  const sharedAppliedRef = useRef(false);

  const showToast = (message: string) => {
    if (!message) return;
    queueMixToast(message);
    setToastKey((k) => k + 1);
  };

  const requireAuth = (): boolean => {
    if (isAuthenticated()) return true;
    const returnTo = sanitizeReturnPath(`${location.pathname}${location.search}`) ?? '/stems';
    const params = new URLSearchParams();
    params.set('mode', 'login');
    params.set('returnTo', returnTo);
    navigate(`/auth?${params.toString()}`, { state: { backgroundLocation: location } });
    return false;
  };

  const loadTrackMixes = useCallback(async () => {
    if (!selectedAlbum || !selectedTrack) {
      setMixes([]);
      return;
    }
    setMixesLoading(true);
    try {
      setMixes(
        await getMyMixes({
          albumId: selectedAlbum.albumId,
          trackId: selectedTrack.id,
        })
      );
    } catch (error) {
      const apiError = error as SavedMixApiError;
      if (apiError?.code === 'UNAUTHORIZED') {
        setMyMixesOpen(false);
        requireAuth();
      } else {
        console.error('[stems] load mixes failed', error);
        showToast(stems.mixError ?? 'Something went wrong');
        setMixes([]);
      }
    } finally {
      setMixesLoading(false);
    }
  }, [selectedAlbum, selectedTrack, stems.mixError, location.pathname, location.search, navigate]);

  useEffect(() => {
    setMixes([]);
    if (!selectedAlbum || !selectedTrack) {
      setMyMixesOpen(false);
    }
  }, [selectedAlbum?.albumId, selectedTrack?.id]);

  useEffect(() => {
    if (!myMixesOpen || !selectedAlbum || !selectedTrack) return;
    void loadTrackMixes();
  }, [myMixesOpen, selectedAlbum?.albumId, selectedTrack?.id, loadTrackMixes]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }, []);

  // При переходе на уровень треков/микшера подтягиваем секцию в зону видимости.
  useEffect(() => {
    if (view === 'albums') return;
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [view]);

  // Shared-ссылка: загружаем пресет (read-only) и переключаем артиста.
  useEffect(() => {
    if (!mixId) {
      setSharedMix(null);
      sharedAppliedRef.current = false;
      return;
    }
    let cancelled = false;
    getSharedMix(mixId)
      .then((mix) => {
        if (cancelled) return;
        sharedAppliedRef.current = false;
        setSharedMix(mix);
        dispatch(setPublicArtistSlug(mix.artistSlug || null));

        const slug = mix.artistSlug?.trim();
        if (slug) {
          const currentArtist = new URLSearchParams(window.location.search).get('artist')?.trim();
          if (currentArtist !== slug) {
            navigate(withPublicArtistQuery(window.location.pathname, slug), { replace: true });
          }
        }
      })
      .catch((error) => {
        console.error('[stems] shared mix load failed', error);
      });
    return () => {
      cancelled = true;
    };
  }, [mixId, dispatch, navigate]);

  // Shared mix: load AlbumDetails + stems for the target album, then drill in.
  useEffect(() => {
    if (!sharedMix || sharedAppliedRef.current) return;
    const albumShell = albums.find((a) => a.albumId === sharedMix.albumId);
    if (!albumShell) return;

    let cancelled = false;
    void (async () => {
      const loaded = await loadAlbumTracks(sharedMix.albumId, { force: true });
      if (cancelled || !loaded) return;
      const track = loaded.tracks.find((t) => t.id === sharedMix.trackId);
      if (!track || track.locked) return;
      sharedAppliedRef.current = true;
      selectAlbum(loaded.albumId);
      selectTrack(track.id);
    })();

    return () => {
      cancelled = true;
    };
  }, [sharedMix, albums, loadAlbumTracks, selectAlbum, selectTrack]);

  const isSharedTrack =
    Boolean(sharedMix) && view === 'mixer' && selectedTrack?.id === sharedMix?.trackId;

  const sharedLabel = stems.sharedMix ?? 'Shared Mix';
  const sharedByTemplate = stems.sharedMixBy ?? 'Created by {author}';
  const sharedNote = isSharedTrack
    ? sharedMix?.authorName
      ? `${sharedLabel} • ${sharedByTemplate.replace('{author}', sharedMix.authorName)}`
      : sharedLabel
    : null;

  const initialMix = isSharedTrack ? sharedMix?.settings : undefined;

  // ── Handlers ──────────────────────────────────────────────────────
  const handleSaveClick = () => {
    if (!requireAuth()) return;
    setSaveOpen(true);
  };

  const handleSave = async (name: string) => {
    if (!selectedAlbum || !selectedTrack) return;
    setSaving(true);
    try {
      await createMix({
        albumId: selectedAlbum.albumId,
        trackId: selectedTrack.id,
        name,
        trackTitle: selectedTrack.title,
        albumTitle: selectedAlbum.title,
        artistSlug: publicArtistSlug,
        settings: panelRef.current?.getMixSettings() ?? [],
      });
      setSaveOpen(false);
      showToast(stems.mixSaved ?? 'Mix saved');
    } catch (error) {
      const apiError = error as SavedMixApiError;
      if (apiError?.code === 'UNAUTHORIZED') {
        setSaveOpen(false);
        requireAuth();
      } else {
        console.error('[stems] save mix failed', error);
        showToast(stems.mixError ?? 'Something went wrong');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleMyMixesClick = () => {
    if (!requireAuth()) return;
    if (!selectedAlbum || !selectedTrack) return;
    setMyMixesOpen(true);
  };

  const handleApply = (mix: SavedMix) => {
    if (!selectedAlbum || !selectedTrack) return;
    if (mix.albumId !== selectedAlbum.albumId || mix.trackId !== selectedTrack.id) return;
    panelRef.current?.applyMix(mix.settings);
    setMyMixesOpen(false);
    showToast(stems.mixApplied ?? 'Mix applied');
  };

  const handleCopyLink = async (mix: SavedMix) => {
    const url = `${origin}/stems/mix/${mix.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(stems.linkCopied ?? 'Link copied');
    } catch (error) {
      console.error('[stems] copy link failed', error);
      showToast(stems.mixError ?? 'Something went wrong');
    }
  };

  const handleDeleteMix = async (mix: SavedMix) => {
    setBusyMixId(mix.id);
    try {
      await deleteMix(mix.id);
      setMixes((prev) => prev.filter((m) => m.id !== mix.id));
    } catch (error) {
      console.error('[stems] delete mix failed', error);
      showToast(stems.mixError ?? 'Something went wrong');
      throw error;
    } finally {
      setBusyMixId(null);
    }
  };

  const saveModalLabels = {
    title: stems.saveMixTitle ?? 'Save mix',
    nameLabel: stems.saveMixName ?? 'Name (optional)',
    namePlaceholder: stems.saveMixNamePlaceholder ?? selectedTrack?.title ?? '',
    save: stems.saveMix ?? 'Save mix',
    saving: stems.saving ?? 'Saving…',
    close: stems.close ?? 'Close',
  };

  const dashboard = (ui?.dashboard ?? {}) as Record<string, string>;

  const myMixesLabels = {
    title: stems.myMixes ?? 'My mixes',
    empty: stems.noMixes ?? 'No saved mixes yet',
    apply: stems.apply ?? 'Apply',
    delete: stems.delete ?? 'Delete',
    cancel: stems.cancel ?? 'Cancel',
    copyLink: stems.copyLink ?? 'Copy link',
    close: stems.close ?? 'Close',
    deleteConfirm: stems.deleteMixConfirm ?? 'Delete this mix?',
    deleteDescription:
      lang === 'ru'
        ? '«{name}» будет удалён без возможности восстановления.'
        : '"{name}" will be permanently deleted.',
    deleteIrreversible: dashboard.confirmActionIrreversible ?? 'This action cannot be undone.',
  };

  if (showEmptyCatalogResolving) {
    return (
      <section className="stems-page main-background" aria-label="Блок c миксером">
        <Helmet>
          <title>{pageTitle}</title>
        </Helmet>
        <div className="wrapper">
          <ContextNav mode="artist-only" artistName={siteArtistName} artistTo={artistHubPath} />
          <h2>{pageTitle}</h2>
          <div className="mixer">
            <MixerAlbumListSkeleton />
          </div>
        </div>
      </section>
    );
  }

  if (showOwnerEmptyCatalog) {
    return (
      <section className="stems-page main-background" aria-label="Блок c миксером">
        <Helmet>
          <title>{pageTitle}</title>
          <meta name="description" content={selectAlbumHint || pageTitle} />
          <link rel="canonical" href={canonical} />
        </Helmet>
        <div className="wrapper">
          <ContextNav mode="artist-only" artistName={siteArtistName} artistTo={artistHubPath} />
          <h2>{pageTitle}</h2>
          <StemsPlaygroundOwnerEmptyState ui={ui} dashboardAlbums={dashboardAlbums} />
        </div>
      </section>
    );
  }

  if (showVisitorEmptyCatalog) {
    return (
      <section
        className="stems-page stems-page--visitor-empty main-background"
        aria-label={stems.emptyTitle ?? pageTitle}
      >
        <Helmet>
          <title>{pageTitle}</title>
          <meta name="description" content={selectAlbumHint || pageTitle} />
          <link rel="canonical" href={canonical} />
        </Helmet>
        <div className="wrapper">
          <StemsPlaygroundVisitorEmptyState
            ui={ui}
            artistSlug={artistSlug}
            artistHubPath={artistHubPath}
          />
        </div>
      </section>
    );
  }

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
        <meta name="twitter:url" content={canonical} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={selectAlbumHint || pageTitle} />
      </Helmet>

      <div className="wrapper">
        {view === 'albums' ? (
          <ContextNav mode="artist-only" artistName={siteArtistName} artistTo={artistHubPath} />
        ) : null}

        <h2>{pageTitle}</h2>

        <div className="mixer">
          {view === 'albums' && (
            <>
              <MixerAlbumList
                albums={albums}
                loading={loading}
                lang={lang}
                trackCountLabels={trackCountLabels}
                emptyLabel={noAlbumsLabel}
                onSelectAlbum={handleSelectAlbum}
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
                    selectedAlbum.tracksStatus === 'loaded'
                      ? pluralizeTracks(selectedAlbum.tracks.length, lang, trackCountLabels)
                      : pluralizeTracks(
                          selectedAlbum.listedTrackCount > 0
                            ? selectedAlbum.listedTrackCount
                            : selectedAlbum.tracks.length,
                          lang,
                          trackCountLabels
                        ),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </MixerBackNav>
              {tracksLoadingAlbumId === selectedAlbum.albumId ||
              selectedAlbum.tracksStatus === 'loading' ||
              selectedAlbum.tracksStatus === 'idle' ? (
                <MixerTrackListSkeleton
                  count={selectedAlbum.listedTrackCount > 0 ? selectedAlbum.listedTrackCount : 3}
                />
              ) : selectedAlbum.tracks.length === 0 ? (
                <p className="mixer-level__hint">{noAlbumsLabel || stems.emptyTitle}</p>
              ) : (
                <MixerTrackList tracks={selectedAlbum.tracks} onSelectTrack={handleSelectTrack} />
              )}
            </>
          )}

          {view === 'mixer' && selectedAlbum && selectedTrack && (
            <>
              <div className="mixer-track-head">
                <MixerBackNav onBack={backToTracks} ariaLabel={pageTitle}>
                  <span className="mixer-back__title">{selectedTrack.title}</span>
                  <span className="mixer-back__meta">
                    {[selectedAlbum.title, formatTrackDuration(selectedTrack.duration)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </MixerBackNav>
                <div className="mixer-track-head__actions">
                  <button type="button" className="mixer-track-head__btn" onClick={handleSaveClick}>
                    <SaveIcon {...dashboardActionIconProps({ size: 16 })} />
                    <span>{stems.saveMix ?? 'Save mix'}</span>
                  </button>
                  <button
                    type="button"
                    className="mixer-track-head__btn"
                    onClick={handleMyMixesClick}
                  >
                    <ListIcon {...dashboardActionIconProps({ size: 16 })} />
                    <span>{stems.myMixes ?? 'My mixes'}</span>
                  </button>
                </div>
              </div>
              <MixerPlayerPanel
                key={selectedTrack.id}
                ref={panelRef}
                track={selectedTrack}
                labels={playerLabels}
                initialMix={initialMix}
                sharedNote={sharedNote}
              />
            </>
          )}
        </div>
      </div>

      <SaveMixModal
        isOpen={saveOpen}
        busy={saving}
        labels={saveModalLabels}
        onClose={() => {
          if (!saving) setSaveOpen(false);
        }}
        onSave={handleSave}
      />

      <MyMixesModal
        isOpen={myMixesOpen}
        mixes={mixes}
        loading={mixesLoading}
        deletingId={busyMixId}
        locale={lang === 'ru' ? 'ru-RU' : 'en-US'}
        labels={myMixesLabels}
        onClose={() => setMyMixesOpen(false)}
        onApply={handleApply}
        onDeleteConfirm={handleDeleteMix}
        onCopyLink={handleCopyLink}
      />

      <MixToast triggerKey={toastKey} />
    </section>
  );
}
