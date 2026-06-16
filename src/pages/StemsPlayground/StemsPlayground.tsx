// src/pages/StemsPlayground/StemsPlayground.tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { List as ListIcon, Save as SaveIcon } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { selectPublicArtistSlug, setPublicArtistSlug } from '@shared/model/currentArtist';
import { isAuthenticated } from '@shared/lib/auth';
import { withPublicArtistQuery } from '@shared/lib/artistQuery';
import { buildPublicSiteUrl } from '@shared/lib/publicSiteOrigin';
import { sanitizeReturnPath } from '@shared/lib/authReturnUrl';
import { queueMixToast } from '@shared/lib/mixToast';
import { MixToast } from '@shared/ui/mixToast';
import { ConfirmationModal } from '@shared/ui/confirmationModal';
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
import { MixerBackNav } from './components/MixerBackNav';
import { MixerPlayerPanel, type MixerPlayerPanelHandle } from './components/MixerPlayerPanel';
import { SaveMixModal } from './components/SaveMixModal';
import { MyMixesModal } from './components/MyMixesModal';
import { ServiceScreen } from '@shared/ui/serviceScreen';
import './style.scss';

export default function StemsPlayground() {
  const { lang } = useLang();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { mixId } = useParams<{ mixId?: string }>();
  const publicArtistSlug = useAppSelector(selectPublicArtistSlug);

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
  const panelRef = useRef<MixerPlayerPanelHandle | null>(null);

  const canonical = buildPublicSiteUrl(`${location.pathname}${location.search}`);

  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const stems = (ui?.stems ?? {}) as Record<string, string>;
  const buttons = (ui?.buttons ?? {}) as Record<string, string>;

  const pageTitle = stems.pageTitle ?? 'Mixer';
  const selectAlbumHint = stems.selectAlbumHint ?? '';
  const selectTrackHint = stems.selectTrackHint ?? '';
  const noAlbumsLabel = stems.noAlbums ?? '';
  const emptyTitle = stems.emptyTitle ?? 'No stems available';
  const emptyDescriptionLine1 =
    stems.emptyDescriptionLine1 ?? 'When the artist publishes albums with stems,';
  const emptyDescriptionLine2 = stems.emptyDescriptionLine2 ?? 'they will appear here.';
  const loadingLabel = stems.loading ?? '…';

  const showEmptyCatalog = !loading && albums.length === 0 && !mixId;

  useLayoutEffect(() => {
    document.body.classList.toggle('page--service-screen', showEmptyCatalog);
    document.body.classList.toggle('page--stems-empty', showEmptyCatalog);
    return () => {
      document.body.classList.remove('page--service-screen');
      document.body.classList.remove('page--stems-empty');
    };
  }, [showEmptyCatalog]);

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
  const [pendingDelete, setPendingDelete] = useState<SavedMix | null>(null);

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

  // Как только каталог построен — открываем нужный альбом/трек shared-микса.
  useEffect(() => {
    if (!sharedMix || sharedAppliedRef.current) return;
    const album = albums.find((a) => a.albumId === sharedMix.albumId);
    const track = album?.tracks.find((t) => t.id === sharedMix.trackId);
    if (!album || !track) return;
    sharedAppliedRef.current = true;
    selectAlbum(album.albumId);
    selectTrack(track.id);
  }, [sharedMix, albums, selectAlbum, selectTrack]);

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

  const handleMyMixesClick = async () => {
    if (!requireAuth()) return;
    setMyMixesOpen(true);
    setMixesLoading(true);
    try {
      setMixes(await getMyMixes());
    } catch (error) {
      const apiError = error as SavedMixApiError;
      if (apiError?.code === 'UNAUTHORIZED') {
        setMyMixesOpen(false);
        requireAuth();
      } else {
        console.error('[stems] load mixes failed', error);
        showToast(stems.mixError ?? 'Something went wrong');
      }
    } finally {
      setMixesLoading(false);
    }
  };

  const handleApply = (mix: SavedMix) => {
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

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const mix = pendingDelete;
    setBusyMixId(mix.id);
    try {
      await deleteMix(mix.id);
      setMixes((prev) => prev.filter((m) => m.id !== mix.id));
      showToast(stems.mixDeleted ?? 'Mix deleted');
    } catch (error) {
      console.error('[stems] delete mix failed', error);
      showToast(stems.mixError ?? 'Something went wrong');
    } finally {
      setBusyMixId(null);
      setPendingDelete(null);
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

  const myMixesLabels = {
    title: stems.myMixes ?? 'My mixes',
    empty: stems.noMixes ?? 'No saved mixes yet',
    loading: loadingLabel,
    apply: stems.apply ?? 'Apply',
    delete: stems.delete ?? 'Delete',
    copyLink: stems.copyLink ?? 'Copy link',
    close: stems.close ?? 'Close',
  };

  if (showEmptyCatalog) {
    return (
      <ServiceScreen
        modifier="mixer-empty"
        titleId="stems-empty-title"
        pageTitle={pageTitle}
        title={emptyTitle}
        description={
          <>
            {emptyDescriptionLine1}
            <br />
            {emptyDescriptionLine2}
          </>
        }
        divider={false}
      />
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
        <h2>{pageTitle}</h2>

        <div className="mixer">
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
              <div className="mixer-track-head">
                <MixerBackNav onBack={backToTracks} ariaLabel={selectTrackHint || pageTitle}>
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
        busyId={busyMixId}
        locale={lang === 'ru' ? 'ru-RU' : 'en-US'}
        labels={myMixesLabels}
        onClose={() => setMyMixesOpen(false)}
        onApply={handleApply}
        onDelete={setPendingDelete}
        onCopyLink={handleCopyLink}
      />

      <ConfirmationModal
        isOpen={Boolean(pendingDelete)}
        title={stems.deleteMixTitle ?? 'Delete mix'}
        message={stems.deleteMixConfirm ?? 'Delete this mix?'}
        irreversibleHint={null}
        confirmText={stems.delete ?? 'Delete'}
        cancelText={stems.cancel ?? 'Cancel'}
        closeLabel={stems.close ?? 'Close'}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <MixToast triggerKey={toastKey} />
    </section>
  );
}
