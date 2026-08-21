// src/pages/UserDashboard/UserDashboard.tsx

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import {
  useNavigate,
  useSearchParams,
  useLocation,
  useParams,
  Navigate,
  type Location,
} from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import clsx from 'clsx';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import { getAlbumsDashboardRouteScopeKey } from '@shared/lib/albumsRouteScope';
import { toLocalYYYYMMDD } from '@shared/lib/dateCalendar';
import { Popup, PopupCloseButton } from '@shared/ui/popup';
import { ConfirmationModal } from '@shared/ui/confirmationModal';
import { AlertModal } from '@shared/ui/alertModal';
import { DashboardButton, DashboardLoadingState } from '@shared/ui/dashboard';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import {
  isAuthenticated,
  getToken,
  isEmailVerified,
  clearAuth,
  getAuthHeader,
} from '@shared/lib/auth';
import { clearAccountDeletedSkipReturn } from '@shared/lib/accountDeletedSession';
import {
  clearDashboardModalBackground,
  localizeDashboardModalBackground,
  resolveDashboardModalCloseTarget,
} from '@shared/lib/dashboardModalBackground';
import { readDashboardOpenIntent, stripDashboardOpenIntent } from '@shared/lib/dashboardOpenIntent';
import { EmailVerificationOnboarding } from '@shared/lib/emailVerification';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { getHttpErrorMessage, isConditionError } from '@shared/lib/errors/apiError';
import { buildApiUrl } from '@shared/lib/artistQuery';
import { isAlbumReadyToPublish } from '@entities/album/lib/isAlbumReadyToPublish';
import { hasPublishedPublicReleases } from '@entities/album/lib/hasPublishedPublicReleases';
import { albumVisibilityToIsPublic } from './components/albums/albumVisibilityOptions';
import { AlbumsTabContent } from './components/albums/AlbumsTabContent';
import { PostsTabContent } from './components/articles/PostsTabContent';
import {
  ALBUM_CREATED_TOAST_DURATION_MS,
  ALBUM_DELETED_TOAST_DURATION_MS,
  ALBUM_PUBLISHED_TOAST_DURATION_MS,
  ARTICLE_DELETED_TOAST_DURATION_MS,
  DASHBOARD_ERROR_TOAST_DURATION_MS,
  LYRICS_SYNC_SAVED_TOAST_DURATION_MS,
  TRACKS_UPLOADED_TOAST_DURATION_MS,
  TRACK_DELETED_TOAST_DURATION_MS,
} from '@shared/lib/toast/toastDurations';
import { toast } from '@shared/lib/toast';
import { getArtistSlugFromLocation } from '@shared/lib/albumDeletedRedirect';
import { isAuthOverlayPathname } from '@shared/lib/publicArtistContext';
import {
  buildSessionExpiredAuthTarget,
  isSessionExpiredHandlingPending,
} from '@shared/lib/sessionExpired';
import { openOwnArtistPage } from '@shared/lib/ownArtistPage';
import { isArticlePublicOnArtistPage } from '@shared/lib/artistPageContent';
import { buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang/buildLocalizedPublicPath';
import { platformDisplayName } from '@shared/constants/platformBranding';
import { useOwnArtistPageSummary } from '@shared/lib/hooks/useOwnArtistPageSummary';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { ArtistMonetizationProvider } from '@shared/lib/payment/ArtistMonetizationContext';
import {
  fetchDashboardAlbums,
  patchDashboardAlbumVisibility,
  patchDashboardTrackVisibility,
  selectDashboardAlbumsStatus,
  selectDashboardAlbumsData,
  selectDashboardAlbumsError,
} from '@entities/album';
import {
  fetchArticles,
  patchDashboardArticleVisibility,
  removeArticleFromPublicCatalog,
  selectDashboardArticlesStatus,
  selectDashboardArticlesError,
  selectDashboardArticlesDataResolved,
} from '@entities/article';
import {
  flushPendingPublicSurfaceSync,
  notifyPublicSurfaceChanged,
} from '@shared/lib/publicSurfaceSync';
import {
  applyTrackLyricsBundle,
  resolveTrackLyricsBundle,
  saveTrackLyricsContentApi,
} from '@entities/lyrics';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';
import { getStore } from '@shared/model/appStore';
import { uploadTracks, prepareAndUploadTrack, type TrackUploadData } from '@shared/api/tracks';
import { regenerateTrackAssets } from '@shared/api/tracks/regenerateTrackAssets';
import { TRACK_ORDER_INDEX_STEP } from '@shared/lib/tracks/trackOrderIndex';
import type { AlbumFormData } from './components/modals/album/EditAlbumModal.types';
import { DashboardLazyModals } from './components/shell/DashboardLazyModals';
import { DashboardNavTabIcon } from './lib/dashboardNavTabIcon';
import { useDashboardRowFlash } from './lib/dashboardRowStateFlash';
import {
  preloadEditAlbumModal,
  preloadEditArticleModal,
  preloadLyricsModals,
  preloadSyncLyricsModal,
} from './lib/dashboardLazyModals';
import { useDashboardMountedTabs } from './lib/useDashboardMountedTabs';
import { computeAlbumsTabPinned } from './lib/dashboardTabMountPolicy';
import { SettingsPageContent } from './components/settings/SettingsPageContent';
import { usePublicProfilePreview } from './components/profile/usePublicProfilePreview';
import { UpgradeToArtistModal } from './components/modals/settings/UpgradeToArtistModal';
import {
  DeleteAccountModal,
  type DeleteAccountModalCopy,
} from './components/modals/settings/DeleteAccountModal';
import { PaymentSettings } from '@features/paymentSettings/ui/PaymentSettings';
import { MyPurchasesContent } from './components/purchases/MyPurchasesContent';
import { MixerAdmin } from './components/mixer/MixerAdmin';
import { MixerEmptyState } from './components/mixer/MixerEmptyState';
import { MyArchiveContent } from './components/archive/MyArchiveContent';
import { SubscriptionContent } from './components/archive/SubscriptionContent';
import { DashboardBillingSync } from './components/DashboardBillingSync';
import type { AlbumEditable, IArticles, IInterface, DashboardTrackVisibilityLabels } from '@models';
import {
  transformEditableAlbumsToAlbumData,
  type AlbumData,
  type TrackData,
} from '@entities/album/lib/transformEditableAlbumData';
import { useAvatar, getProfileAvatarInitials } from '@shared/lib/hooks/useAvatar';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import {
  type DashboardTab,
  DASHBOARD_PATH,
  isDashboardTabSlug,
  isDashboardTabAllowed,
  resolveDashboardTab,
  getDefaultDashboardTab,
  getVisibleDashboardTabs,
  isArtistAccount,
  isListenerAccount,
} from '@shared/lib/accountType';
import { parseTrackDurationToSeconds } from '@shared/lib/parseTrackDuration';
import { useDashboardModalShell } from '@shared/lib/dashboardModalShellContext';
import { useCloseWithUnsavedConfirmation } from '@shared/lib/hooks/useCloseWithUnsavedConfirmation';
import { useUnsavedNavigationLeaveGuard } from '@shared/lib/hooks/useUnsavedNavigationLeaveGuard';
import {
  InlineEditDiscardDialog,
  getCloseDiscardConfirmLabels,
} from './components/shared/EditableCardField';
import type { SupportedLang } from '@shared/model/lang';
import './UserDashboard.style.scss';
import { normalizeTrackVisibility, type TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import {
  formatTrackUploadCancelledMessage,
  resolveTrackUploadErrorCopy,
  resolveTrackUploadFailureReason,
} from '@shared/lib/tracks/trackUploadErrorMessages';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';

/** Сообщение об успешной загрузке треков: RU — формы 1 трек / 2 трека / 5 треков. */
function formatUploadedTracksSuccessMessage(
  count: number,
  lang: SupportedLang,
  ui: IInterface | null | undefined
): string {
  if (lang === 'ru') {
    const n = count % 100;
    const n1 = count % 10;
    let form = 'треков';
    if (n < 11 || n > 14) {
      if (n1 === 1) form = 'трек';
      else if (n1 >= 2 && n1 <= 4) form = 'трека';
    }
    const prefix = ui?.dashboard?.uploadedTracksSuccessPrefix ?? 'Успешно загружено';
    return `${prefix} ${count} ${form}`;
  }
  const prefix = ui?.dashboard?.uploadedTracksSuccessPrefix ?? 'Successfully uploaded';
  const unit = count === 1 ? 'track' : 'tracks';
  return `${prefix} ${count} ${unit}`;
}

type TrackUploadFailure = { fileName: string; reason: string };

function formatUploadedTracksPartialTitle(
  uploaded: number,
  total: number,
  ui: IInterface | null | undefined
): string {
  const template = ui?.dashboard?.uploadedTracksPartialTitle ?? 'Uploaded {uploaded} of {total}';
  return template.replace('{uploaded}', String(uploaded)).replace('{total}', String(total));
}

function formatUploadFailuresMessage(
  failures: TrackUploadFailure[],
  ui: IInterface | null | undefined
): string {
  if (failures.length === 0) {
    return '';
  }
  const intro =
    ui?.dashboard?.uploadedTracksPartialFailuresIntro ??
    'The following files could not be uploaded:';
  const lines = failures.map((failure) => `• ${failure.fileName}: ${failure.reason}`);
  return `${intro}\n${lines.join('\n')}`;
}

function formatTrackUploadAllFailedMessage(
  failures: TrackUploadFailure[],
  ui: IInterface | null | undefined,
  lang: SupportedLang
): string {
  const intro =
    ui?.dashboard?.trackUploadAllFailedIntro ??
    (lang === 'ru' ? 'Не удалось загрузить ни один трек.' : 'Could not upload any tracks.');
  if (failures.length === 0) {
    return intro;
  }
  const lines = failures.map((failure) => `• ${failure.fileName}: ${failure.reason}`).join('\n');
  return `${intro}\n${lines}`;
}

function formatAlbumDeletedSuccessMessage(
  albumTitle: string | undefined,
  ui: IInterface | null | undefined
): string {
  const title = albumTitle?.trim();
  if (title) {
    const template = ui?.dashboard?.albumDeletedSuccessToastWithTitle ?? 'Album "{name}" deleted';
    return template.replace('{name}', title);
  }
  return ui?.dashboard?.albumDeletedSuccessToast ?? 'Album deleted';
}

function formatTrackDeletedSuccessMessage(
  trackTitle: string | undefined,
  ui: IInterface | null | undefined
): string {
  const title = trackTitle?.trim();
  if (title) {
    const template = ui?.dashboard?.trackDeletedSuccessToastWithTitle ?? 'Track "{name}" deleted';
    return template.replace('{name}', title);
  }
  return ui?.dashboard?.trackDeletedSuccessToast ?? 'Track deleted';
}

function formatArticleDeletedSuccessMessage(
  articleTitle: string | undefined,
  ui: IInterface | null | undefined
): string {
  const title = articleTitle?.trim();
  if (title) {
    const template =
      ui?.dashboard?.articleDeletedSuccessToastWithTitle ?? 'Article "{name}" deleted';
    return template.replace('{name}', title);
  }
  return ui?.dashboard?.articleDeletedSuccessToast ?? 'Article deleted';
}

function formatAlbumPublishedToastCopy(
  ui: IInterface | null | undefined,
  lang: string
): { title: string; description: string } {
  const en = lang !== 'ru';
  return {
    title:
      ui?.dashboard?.albumPublishedSuccessToast ?? (en ? 'Album published' : 'Альбом опубликован'),
    description:
      ui?.dashboard?.albumPublishedSuccessToastDescription ??
      (en ? 'Your album is now available to listeners.' : 'Ваш альбом теперь доступен слушателям.'),
  };
}

function formatAlbumCreatedToastCopy(
  ui: IInterface | null | undefined,
  lang: string
): { title: string; description: string } {
  const en = lang !== 'ru';
  return {
    title: ui?.dashboard?.albumCreatedSuccessToast ?? (en ? 'Album created' : 'Альбом создан'),
    description:
      ui?.dashboard?.albumCreatedSuccessToastDescription ??
      (en
        ? 'Upload tracks to complete publication.'
        : 'Загрузите треки для завершения публикации.'),
  };
}

function formatLyricsSyncSavedToastCopy(
  ui: IInterface | null | undefined,
  lang: string
): { title: string; description: string } {
  const en = lang !== 'ru';
  return {
    title:
      ui?.dashboard?.lyricsSyncSavedToast ??
      (en ? 'Synchronization saved' : 'Синхронизация сохранена'),
    description:
      ui?.dashboard?.lyricsSyncSavedToastDescription ??
      (en ? 'Your changes have been saved.' : 'Изменения сохранены.'),
  };
}

/** В кабинете список альбомов всегда принадлежит сессии; бэкенд иногда не присылает `userId`. */
function withDashboardAlbumOwner(
  albums: AlbumData[],
  sessionUserId: string | null | undefined
): AlbumData[] {
  if (sessionUserId == null || sessionUserId === '') {
    return albums;
  }
  return albums.map((a) => ({
    ...a,
    userId: a.userId ?? sessionUserId,
  }));
}

/** URL segment under `/dashboard/:tab` — источник истины для активной вкладки. */
export type { DashboardTab } from '@shared/lib/accountType';

function dashboardHeadingForTab(tab: DashboardTab, ui: IInterface | null): string {
  const d = ui?.dashboard;
  switch (tab) {
    case 'settings':
      return d?.settings ?? 'Settings';
    case 'albums':
      return d?.tabs?.albums ?? 'Albums';
    case 'posts':
      return d?.tabs?.posts ?? 'Articles';
    case 'mixer':
      return d?.tabs?.mixer ?? 'Mixer';
    case 'collection':
      return d?.collection?.title ?? d?.tabs?.archive ?? 'Your Collection';
    case 'subscription':
      return d?.tabs?.subscription ?? 'Subscription';
    case 'payment-settings':
      return d?.tabs?.paymentSettings ?? 'Payment Settings';
    case 'my-purchases':
      return d?.tabs?.myPurchases ?? 'My Purchases';
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

function createNewDraftArticle(): IArticles {
  return {
    articleId: `new-${Date.now()}`,
    nameArticle: '',
    img: '',
    date: toLocalYYYYMMDD(),
    details: [],
    description: '',
    isDraft: true,
  };
}

function UserDashboard() {
  const { lang, setLang } = useLang();
  const { displayName: siteArtistDisplayName } = useSiteArtistDisplayName(lang, {
    variant: 'authenticated',
  });
  const dispatch = useAppDispatch();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const navigate = useNavigate();
  const location = useLocation();
  const { surfaceLocation: dashboardSurfaceFromLayout } = useDashboardModalShell();
  const backgroundLocation =
    (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation ??
    dashboardSurfaceFromLayout ??
    undefined;
  const dashboardNavState = backgroundLocation ? { backgroundLocation } : undefined;
  const goDashboard = useCallback(
    (path: string) => {
      navigate(path, {
        replace: true,
        ...(dashboardNavState ? { state: dashboardNavState } : {}),
      });
    },
    [navigate, dashboardNavState]
  );
  const { tab: tabFromRoute } = useParams<{ tab?: string }>();
  const [searchParams] = useSearchParams();
  const albumsStatus = useAppSelector(selectDashboardAlbumsStatus);
  const albumsError = useAppSelector(selectDashboardAlbumsError);
  const albumsFromStore = useAppSelector(selectDashboardAlbumsData);
  const articlesStatus = useAppSelector(selectDashboardArticlesStatus);
  const articlesError = useAppSelector(selectDashboardArticlesError);
  const articlesFromStore = useAppSelector((state) => selectDashboardArticlesDataResolved(state));
  const { hasPublicPageContent: isArtistPagePublic, isLoading: isArtistPageSummaryLoading } =
    useOwnArtistPageSummary();
  const isArtistPageVisibilityKnown = !isArtistPageSummaryLoading;
  const sessionUser = useAuthSessionUser();
  const lastSessionUserRef = useRef(sessionUser);
  if (sessionUser) {
    lastSessionUserRef.current = sessionUser;
  }
  const sessionReauthSurface =
    (typeof window !== 'undefined' && isAuthOverlayPathname(window.location.pathname)) ||
    isSessionExpiredHandlingPending();
  const user = sessionUser ?? (sessionReauthSurface ? lastSessionUserRef.current : null);
  const userId = user?.id ?? null;
  const emailVerified = isEmailVerified(user);

  const tabInvalid =
    tabFromRoute !== undefined && tabFromRoute !== '' && !isDashboardTabSlug(tabFromRoute);
  const tabDisallowed =
    tabFromRoute !== undefined &&
    tabFromRoute !== '' &&
    isDashboardTabSlug(tabFromRoute) &&
    !isDashboardTabAllowed(tabFromRoute, user);
  const activeTab: DashboardTab = resolveDashboardTab(tabFromRoute, user);
  const visibleTabs = useMemo(() => getVisibleDashboardTabs(user), [user]);
  const isArtist = isArtistAccount(user);
  const isListener = isListenerAccount(user);

  const [isUpgradeToArtistModalOpen, setIsUpgradeToArtistModalOpen] = useState(false);
  const [scrollSettingsToHeaderImages, setScrollSettingsToHeaderImages] = useState(false);
  const [collectionContentReady, setCollectionContentReady] = useState(false);
  const handleCollectionContentReady = useCallback(() => {
    setCollectionContentReady(true);
  }, []);
  const handleCollectionContentBusy = useCallback(() => {
    setCollectionContentReady(false);
  }, []);
  const [subscriptionContentReady, setSubscriptionContentReady] = useState(false);
  const handleSubscriptionContentReady = useCallback(() => {
    setSubscriptionContentReady(true);
  }, []);
  const handleSubscriptionContentBusy = useCallback(() => {
    setSubscriptionContentReady(false);
  }, []);

  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const { data: publicProfilePreview } = usePublicProfilePreview(userId, lang);
  const profilePublicSlug = publicProfilePreview.publicSlug;
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [scrollToAlbumUploadId, setScrollToAlbumUploadId] = useState<string | null>(null);
  const [scrollToAlbumId, setScrollToAlbumId] = useState<string | null>(null);
  const [pendingTrackUploadAlbumId, setPendingTrackUploadAlbumId] = useState<string | null>(null);
  const [pendingFocusTrackKey, setPendingFocusTrackKey] = useState<string | null>(null);
  const [publishingAlbumId, setPublishingAlbumId] = useState<string | null>(null);
  const trackUploadSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const trackUploadAbortControllersRef = useRef<Record<string, AbortController>>({});
  const [articleAccessMenuArticleId, setArticleAccessMenuArticleId] = useState<string | null>(null);
  const [albumAccessMenuAlbumId, setAlbumAccessMenuAlbumId] = useState<string | null>(null);
  const [albumsData, setAlbumsData] = useState<AlbumData[]>([]);
  const { flashes: dashboardRowFlashes, flashRow: flashDashboardRow } = useDashboardRowFlash();

  const resolvePublicArtistSlugForRefresh = useCallback((): string | null => {
    const fromBackground = backgroundLocation
      ? getArtistSlugFromLocation(backgroundLocation)
      : null;
    return fromBackground ?? profilePublicSlug?.trim() ?? null;
  }, [backgroundLocation, profilePublicSlug]);

  const handleArticlePersisted = useCallback(
    ({ affectsPublicSurface }: { affectsPublicSurface: boolean }) => {
      if (!affectsPublicSurface) return;
      notifyPublicSurfaceChanged(
        { type: 'articlePublicChanged' },
        { artistSlug: resolvePublicArtistSlugForRefresh() }
      );
    },
    [resolvePublicArtistSlugForRefresh]
  );

  const handleArticleRemoved = useCallback(
    ({ wasPublished }: { wasPublished: boolean }) => {
      if (!wasPublished) return;
      notifyPublicSurfaceChanged(
        { type: 'articlePublicChanged' },
        { artistSlug: resolvePublicArtistSlugForRefresh() }
      );
    },
    [resolvePublicArtistSlugForRefresh]
  );

  const closeDashboard = useCallback(() => {
    const closeTarget = resolveDashboardModalCloseTarget({ backgroundLocation });
    if (!closeTarget) {
      navigate('/');
      return;
    }

    clearDashboardModalBackground();

    const localizedCloseTarget = localizeDashboardModalBackground(
      {
        pathname: closeTarget.pathname,
        search: closeTarget.search,
        hash: closeTarget.hash ?? '',
      },
      lang
    );

    const backgroundArtistSlug = getArtistSlugFromLocation({
      ...closeTarget,
      pathname: localizedCloseTarget.pathname,
      search: localizedCloseTarget.search,
      hash: localizedCloseTarget.hash,
    });
    const artistSlugForRefresh = backgroundArtistSlug ?? profilePublicSlug?.trim() ?? null;

    navigate(
      {
        pathname: localizedCloseTarget.pathname,
        search: localizedCloseTarget.search,
        hash: localizedCloseTarget.hash ?? '',
      },
      { replace: true }
    );

    // Only retries scopes that could not resolve a slug at mutation time — not a global refresh.
    flushPendingPublicSurfaceSync(artistSlugForRefresh);
  }, [backgroundLocation, lang, navigate, profilePublicSlug]);
  const [editArticleModal, setEditArticleModal] = useState<{
    isOpen: boolean;
    article: IArticles | null;
  } | null>(null);
  const openNewArticleEditor = useCallback(() => {
    preloadEditArticleModal();
    setEditArticleModal({ isOpen: true, article: createNewDraftArticle() });
  }, []);

  const openEditAlbumModal = useCallback((albumId?: string) => {
    preloadEditAlbumModal();
    setEditAlbumModal({ isOpen: true, ...(albumId ? { albumId } : {}) });
  }, []);
  const [isLoadingTracks, setIsLoadingTracks] = useState<boolean>(false);
  const [isUploadingTracks, setIsUploadingTracks] = useState<{ [albumId: string]: boolean }>({});
  const [uploadProgress, setUploadProgress] = useState<{ [albumId: string]: number }>({});
  const fileInputRefs = useRef<{ [albumId: string]: HTMLInputElement | null }>({});
  const [addLyricsModal, setAddLyricsModal] = useState<{
    isOpen: boolean;
    albumId: string;
    trackId: string;
    trackTitle: string;
  } | null>(null);
  const [editTrackModal, setEditTrackModal] = useState<{
    isOpen: boolean;
    albumId: string;
    trackId: string;
    trackTitle: string;
  } | null>(null);
  const [editTrackTitleDraft, setEditTrackTitleDraft] = useState('');
  const [editLyricsModal, setEditLyricsModal] = useState<{
    isOpen: boolean;
    albumId: string;
    trackId: string;
    trackTitle: string;
    trackState: TrackLyricsBundle['state'];
    hasSyncedLyrics?: boolean;
    initialLyrics?: string;
    initialAuthorship?: string;
  } | null>(null);
  const [previewLyricsModal, setPreviewLyricsModal] = useState<{
    isOpen: boolean;
    lyrics: TrackLyricsBundle;
    trackSrc?: string;
    mediaOwnerUserId?: string;
  } | null>(null);
  const [syncLyricsModal, setSyncLyricsModal] = useState<{
    isOpen: boolean;
    albumId: string;
    trackId: string;
    trackTitle: string;
    trackSrc?: string;
    mediaOwnerUserId?: string;
    trackDurationSeconds?: number;
    lyricsText?: string;
    authorship?: string;
  } | null>(null);
  const [editAlbumModal, setEditAlbumModal] = useState<{
    isOpen: boolean;
    albumId?: string;
  } | null>(null);
  const [albumEditorDiscardRisk, setAlbumEditorDiscardRisk] = useState(false);
  const handleAlbumEditorDiscardRiskChange = useCallback((hasRisk: boolean) => {
    setAlbumEditorDiscardRisk(hasRisk);
  }, []);
  const closeEditAlbumModal = useCallback(() => {
    setAlbumEditorDiscardRisk(false);
    setEditAlbumModal(null);
  }, []);
  const albumEditorLeaveGuardActive = Boolean(editAlbumModal?.isOpen) && albumEditorDiscardRisk;
  const albumEditorRouteLeaveBlocker = useUnsavedNavigationLeaveGuard(albumEditorLeaveGuardActive);

  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
    confirmText?: string;
    irreversibleHint?: string | null;
  } | null>(null);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title?: string;
    message: string;
    variant?: 'success' | 'error' | 'warning' | 'info';
    retryTracks?: { albumId: string; trackIds: string[] };
  } | null>(null);
  const [retryingTrackProcessingId, setRetryingTrackProcessingId] = useState<string | null>(null);
  const [replacingTrackId, setReplacingTrackId] = useState<string | null>(null);
  const [tabPinSignals, setTabPinSignals] = useState<Partial<Record<DashboardTab, boolean>>>({});

  const setTabPinned = useCallback((tab: DashboardTab, pinned: boolean) => {
    setTabPinSignals((prev) => {
      const current = Boolean(prev[tab]);
      if (current === pinned) {
        return prev;
      }
      if (!pinned) {
        const next = { ...prev };
        delete next[tab];
        return next;
      }
      return { ...prev, [tab]: true };
    });
  }, []);

  const pinnedTabs = useMemo(() => {
    const pins = new Set<DashboardTab>();
    if (computeAlbumsTabPinned({ isUploadingTracks, replacingTrackId })) {
      pins.add('albums');
    }
    (Object.entries(tabPinSignals) as [DashboardTab, boolean][]).forEach(([tab, pinned]) => {
      if (pinned) {
        pins.add(tab);
      }
    });
    return pins;
  }, [isUploadingTracks, replacingTrackId, tabPinSignals]);

  const { shouldMount } = useDashboardMountedTabs(activeTab, pinnedTabs);
  const collectionMounted = shouldMount('collection');
  const subscriptionMounted = shouldMount('subscription');

  useEffect(() => {
    if (!collectionMounted) {
      setCollectionContentReady(false);
    }
  }, [collectionMounted]);

  useEffect(() => {
    if (!subscriptionMounted) {
      setSubscriptionContentReady(false);
    }
  }, [subscriptionMounted]);

  const onAvatarAlert = useCallback(
    ({ message, variant = 'error' }: { message: string; variant?: 'error' | 'warning' }) => {
      setAlertModal({
        isOpen: true,
        message,
        variant,
      });
    },
    []
  );

  const handleSettingsNotAuthorized = useCallback(() => {
    setAlertModal({
      isOpen: true,
      title: ui?.dashboard?.error ?? 'Error',
      message: ui?.dashboard?.errorNotAuthorized ?? 'Error: you are not authorized. Please log in.',
      variant: 'error',
    });
  }, [ui?.dashboard?.error, ui?.dashboard?.errorNotAuthorized]);

  const handleSettingsSaveError = useCallback((message: string) => {
    toast.show({
      variant: 'error',
      title: message,
      duration: DASHBOARD_ERROR_TOAST_DURATION_MS,
    });
  }, []);

  const deleteAccountCopy = useMemo((): DeleteAccountModalCopy => {
    const d = ui?.dashboard;
    const en = lang !== 'ru';
    return {
      title: d?.deleteAccountConfirmTitle ?? (en ? 'Delete account' : 'Удалить аккаунт'),
      warningDescription:
        d?.deleteAccountWarningDescription ??
        (en ? 'This action cannot be undone.' : 'Это действие нельзя отменить.'),
      passwordLabel: d?.deleteAccountPasswordLabel ?? (en ? 'Current password' : 'Текущий пароль'),
      passwordPlaceholder:
        d?.deleteAccountPasswordPlaceholder ??
        (en ? 'Enter current password' : 'Введите текущий пароль'),
      deleteButton: d?.deleteAccount ?? (en ? 'Delete account' : 'Удалить аккаунт'),
      cancel: d?.cancel ?? (en ? 'Cancel' : 'Отмена'),
      close: d?.close ?? (en ? 'Close' : 'Закрыть'),
      deleting: d?.deleteAccountDeleting ?? (en ? 'Deleting account…' : 'Удаление аккаунта…'),
      deleteFailed:
        d?.deleteAccountFailed ??
        (en ? 'Could not delete account. Please try again.' : 'Не удалось удалить аккаунт.'),
    };
  }, [lang, ui?.dashboard]);

  const handleLogout = useCallback(() => {
    clearAuth();
    if (typeof window !== 'undefined') {
      window.location.replace(buildLocalizedPublicPath(lang, '/'));
      return;
    }
    navigate({ pathname: '/', search: '' }, { replace: true });
  }, [lang, navigate]);

  const handleAccountDeleted = useCallback(() => {
    setIsDeleteAccountModalOpen(false);
    setConfirmationModal(null);
    setAlertModal(null);
    setEditArticleModal(null);
    closeEditAlbumModal();
    clearDashboardModalBackground();
    clearAuth();
    clearAccountDeletedSkipReturn();
    if (typeof window !== 'undefined') {
      window.location.replace('/');
      return;
    }
    navigate({ pathname: '/', search: '' }, { replace: true });
  }, [navigate]);

  const consumeDashboardOpenIntent = useCallback(() => {
    const intent = readDashboardOpenIntent(location.state);
    if (!intent) return;

    const nextState = stripDashboardOpenIntent(intent);
    const replaceState = Object.keys(nextState).length > 0 ? nextState : null;
    let consumed = false;

    if (intent.openEditAlbumModal) {
      if (emailVerified) {
        preloadEditAlbumModal();
        setEditAlbumModal({ isOpen: true });
        consumed = true;
      }
    }

    if (intent.openNewArticleModal) {
      if (emailVerified) {
        preloadEditArticleModal();
        setEditArticleModal({ isOpen: true, article: createNewDraftArticle() });
      }
      consumed = true;
    }

    if (intent.scrollToHeaderImages && !isListener) {
      setScrollSettingsToHeaderImages(true);
      consumed = true;
    }

    if (consumed) {
      navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        { replace: true, state: replaceState }
      );
    }
  }, [
    emailVerified,
    isListener,
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
  ]);

  useEffect(() => {
    consumeDashboardOpenIntent();
  }, [consumeDashboardOpenIntent]);

  const {
    avatarSrc,
    avatarRetinaSrc,
    isUploadingAvatar,
    avatarInputRef,
    handleAvatarClick,
    handleAvatarChange,
    handleAvatarRemove,
  } = useAvatar({
    avatarFileTooLargeMessage: ui?.dashboard?.avatarFileTooLarge,
    onAvatarAlert,
  });

  // В админке artist из query не используется: удаляем его из URL, оставляя только tab.
  useEffect(() => {
    const artistParam = searchParams.get('artist');
    if (!artistParam) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('artist');
    const nextQuery = nextParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextQuery ? `?${nextQuery}` : '',
      },
      { replace: true, state: location.state }
    );
  }, [searchParams, navigate, location.pathname, location.state]);

  useEffect(() => {
    if (editTrackModal?.isOpen) {
      setEditTrackTitleDraft(editTrackModal.trackTitle);
    }
  }, [
    editTrackModal?.isOpen,
    editTrackModal?.albumId,
    editTrackModal?.trackId,
    editTrackModal?.trackTitle,
  ]);

  useLayoutEffect(() => {
    if (!scrollToAlbumUploadId || expandedAlbumId !== scrollToAlbumUploadId) {
      return;
    }

    const uploadSection = trackUploadSectionRefs.current[scrollToAlbumUploadId];
    if (!uploadSection) {
      return;
    }

    uploadSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setScrollToAlbumUploadId(null);
  }, [scrollToAlbumUploadId, expandedAlbumId, albumsData]);

  useLayoutEffect(() => {
    if (!scrollToAlbumId || expandedAlbumId !== scrollToAlbumId) {
      return;
    }

    const albumRow = document.getElementById(`dashboard-album-row-${scrollToAlbumId}`);
    if (!albumRow) {
      return;
    }

    albumRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setScrollToAlbumId(null);
  }, [scrollToAlbumId, expandedAlbumId, albumsData]);

  const clearAlbumNavigationQueryParam = useCallback(
    (paramName: 'uploadTracks' | 'focusAlbum' | 'focusTrack') => {
      if (!searchParams.get(paramName)) {
        return;
      }

      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete(paramName);
      const nextQuery = nextParams.toString();
      navigate(
        {
          pathname: location.pathname,
          search: nextQuery ? `?${nextQuery}` : '',
        },
        { replace: true, state: location.state }
      );
    },
    [searchParams, navigate, location.pathname, location.state]
  );

  const clearUploadTracksQueryParam = useCallback(() => {
    clearAlbumNavigationQueryParam('uploadTracks');
  }, [clearAlbumNavigationQueryParam]);

  const handlePendingTrackUploadHandled = useCallback(() => {
    setPendingTrackUploadAlbumId(null);
    clearUploadTracksQueryParam();
  }, [clearUploadTracksQueryParam]);

  useEffect(() => {
    const uploadTracksParam = searchParams.get('uploadTracks')?.trim();
    if (!uploadTracksParam || albumsData.length === 0 || activeTab !== 'albums') {
      return;
    }

    const album = albumsData.find(
      (entry) => entry.id === uploadTracksParam || entry.albumId === uploadTracksParam
    );
    if (!album) {
      return;
    }

    setExpandedAlbumId(album.id);
    setScrollToAlbumUploadId(album.id);
    setPendingTrackUploadAlbumId(album.id);
  }, [searchParams, albumsData, activeTab]);

  const handlePendingFocusTrackHandled = useCallback(() => {
    setPendingFocusTrackKey(null);
  }, []);

  useEffect(() => {
    const focusAlbumParam = searchParams.get('focusAlbum')?.trim();
    if (!focusAlbumParam || albumsData.length === 0 || activeTab !== 'albums') {
      return;
    }

    const album = albumsData.find(
      (entry) => entry.id === focusAlbumParam || entry.albumId === focusAlbumParam
    );
    if (!album) {
      return;
    }

    setExpandedAlbumId(album.id);
    setScrollToAlbumId(album.id);

    const focusTrackParam = searchParams.get('focusTrack')?.trim();
    if (focusTrackParam) {
      const track = album.tracks.find((entry) => entry.id === focusTrackParam);
      if (track) {
        setPendingFocusTrackKey(`${album.id}:${track.id}`);
      }
      clearAlbumNavigationQueryParam('focusTrack');
    }

    clearAlbumNavigationQueryParam('focusAlbum');
  }, [searchParams, albumsData, activeTab, clearAlbumNavigationQueryParam]);

  // Загрузка альбомов: всегда force при смене аккаунта/языка,
  // чтобы не показывать данные предыдущего пользователя из Redux-кэша.
  // `routeScopeKey`: переход / → дашборд (или публичная страница → дашборд) с тем же userId/lang;
  // без него при /dashboard/.../albums → .../posts не дёргаем fetch — общий `albums` остаётся
  // спокойным для фоновой страницы под модалкой.
  const albumsRouteScopeKey = getAlbumsDashboardRouteScopeKey(location.pathname);
  useEffect(() => {
    if (!isArtist) return;

    dispatch(fetchDashboardAlbums({ force: true, ownerDashboard: true })).catch(
      (error: unknown) => {
        if (isConditionError(error)) {
          return;
        }
        console.error('Error fetching albums:', error);
      }
    );
  }, [dispatch, lang, userId, albumsRouteScopeKey, isArtist]);

  // Статьи для вкладки posts: всегда `force`, иначе после смены аккаунта `fetchArticles.condition`
  // держит `dashboard.status === 'succeeded'` и пропускает запрос со старыми данными в store.
  // (Подписка на сессию — `useAuthSessionUser`, иначе `userId` не обновляется до перезагрузки.)
  useEffect(() => {
    if (activeTab !== 'posts') {
      return;
    }

    dispatch(fetchArticles({ force: true, ownerDashboard: true })).catch((error: unknown) => {
      if (isConditionError(error)) {
        return;
      }
      console.error('Error fetching articles:', error);
    });
  }, [dispatch, lang, userId, activeTab]);

  // Преобразование данных из AlbumEditable[] в AlbumData[] и загрузка статусов треков
  useEffect(() => {
    if (!albumsFromStore || albumsFromStore.length === 0) {
      setAlbumsData([]);
      setIsLoadingTracks(false);
      return;
    }

    // Пока fetchDashboardAlbums в полёте, в store ещё предыдущий снимок; не пересобираем albumsData
    // (вкладка Albums — loader; миксер/модалки сохраняют последний валидный список).
    if (albumsStatus === 'loading') {
      return;
    }

    setIsLoadingTracks(true);
    const abortController = new AbortController();

    (async () => {
      try {
        // Преобразуем альбомы из Redux store в формат для UI
        const transformedAlbums = transformEditableAlbumsToAlbumData(
          albumsFromStore,
          siteArtistDisplayName,
          lang
        );

        // Обновляем локальное состояние из Redux store
        if (!abortController.signal.aborted) {
          setAlbumsData(withDashboardAlbumOwner([...transformedAlbums], userId));
          setIsLoadingTracks(false);
        }
      } catch (error) {
        console.error('Error loading albums data:', error);
        if (!abortController.signal.aborted) {
          setIsLoadingTracks(false);
        }
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [albumsFromStore, albumsStatus, lang, siteArtistDisplayName, userId]);

  const toggleAlbum = (albumId: string) => {
    setExpandedAlbumId((prev) => (prev === albumId ? null : albumId));
  };

  // Обработка завершения перетаскивания трека
  const handleDragEnd = async (event: DragEndEvent, albumId: string) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const album = albumsData.find((a) => a.id === albumId);
    if (!album) return;

    const oldIndex = album.tracks.findIndex((track) => track.id === active.id);
    const newIndex = album.tracks.findIndex((track) => track.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Оптимистичное обновление UI
    const newTracks = arrayMove(album.tracks, oldIndex, newIndex);
    setAlbumsData((prevAlbums) =>
      prevAlbums.map((a) => (a.id === albumId ? { ...a, tracks: newTracks } : a))
    );

    // Сохраняем новый порядок в БД
    try {
      const token = getToken();
      if (!token) {
        setAlertModal({
          isOpen: true,
          title: ui?.dashboard?.error ?? 'Error',
          message:
            ui?.dashboard?.errorNotAuthorized ?? 'Error: you are not authorized. Please log in.',
          variant: 'error',
        });
        // Откатываем изменения
        setAlbumsData((prevAlbums) =>
          prevAlbums.map((a) => (a.id === albumId ? { ...a, tracks: album.tracks } : a))
        );
        return;
      }

      // Порядок в массиве задаёт reorder; сервер пересчитывает order_index шагом 10 и игнорирует orderIndex.
      const trackOrders = newTracks.map((track, index) => ({
        trackId: track.id,
        orderIndex: index,
      }));

      const response = await fetchWithAuthSession('/api/albums', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          albumId: album.albumId,
          lang,
          trackOrders,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(getHttpErrorMessage(errorData, response.status, 'error'));
      }

      // Обновляем данные из БД для синхронизации
      await dispatch(fetchDashboardAlbums({ force: true, ownerDashboard: true })).unwrap();
      notifyPublicSurfaceChanged(
        { type: 'trackContentChanged', albumId: album.albumId },
        { artistSlug: resolvePublicArtistSlugForRefresh() }
      );
    } catch (error) {
      console.error('❌ Error reordering tracks:', error);
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message: `Ошибка при изменении порядка треков: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'error',
      });
      // Откатываем изменения
      setAlbumsData((prevAlbums) =>
        prevAlbums.map((a) => (a.id === albumId ? { ...a, tracks: album.tracks } : a))
      );
    }
  };

  // Удаление трека
  const handleDeleteTrack = async (albumId: string, trackId: string, trackTitle: string) => {
    // Показываем модальное окно подтверждения
    setConfirmationModal({
      isOpen: true,
      title: ui?.dashboard?.confirmAction ?? 'Confirm action',
      message: (
        ui?.dashboard?.confirmDeleteTrack ?? 'Are you sure you want to delete the track "{name}"?'
      ).replace('{name}', trackTitle),
      variant: 'danger',
      onConfirm: async () => {
        setConfirmationModal(null);
        await performDeleteTrack(albumId, trackId, trackTitle);
      },
    });
  };

  // Обновление названия трека
  const handleTrackTitleChange = async (albumId: string, trackId: string, newTitle: string) => {
    try {
      const token = getToken();
      if (!token) {
        setAlertModal({
          isOpen: true,
          title: ui?.dashboard?.error ?? 'Error',
          message:
            ui?.dashboard?.errorNotAuthorized ?? 'Error: you are not authorized. Please log in.',
          variant: 'error',
        });
        return;
      }

      // Вызываем API для обновления названия
      const response = await fetchWithAuthSession('/api/update-track-title', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          albumId,
          trackId,
          lang,
          translations: { [lang]: { title: newTitle } },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(getHttpErrorMessage(errorData, response.status, 'message'));
      }

      // Обновляем локальное состояние
      setAlbumsData((prev) =>
        prev.map((album) =>
          album.albumId === albumId || album.id === albumId
            ? {
                ...album,
                tracks: album.tracks.map((t) => (t.id === trackId ? { ...t, title: newTitle } : t)),
              }
            : album
        )
      );

      notifyPublicSurfaceChanged(
        { type: 'trackContentChanged', albumId },
        { artistSlug: resolvePublicArtistSlugForRefresh() }
      );
    } catch (error) {
      console.error('❌ Error updating track title:', error);
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message: `Ошибка при обновлении названия трека: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'error',
      });
      // Откатываем изменения в локальном состоянии
      await dispatch(fetchDashboardAlbums({ force: true, ownerDashboard: true })).unwrap();
    }
  };

  const handleTrackVisibilityChange = async (
    albumId: string,
    trackId: string,
    visibility: TrackVisibility
  ) => {
    const token = getToken();
    if (!token) {
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message:
          ui?.dashboard?.errorNotAuthorized ?? 'Error: you are not authorized. Please log in.',
        variant: 'error',
      });
      return;
    }

    const album = albumsData.find((a) => a.albumId === albumId || a.id === albumId);
    const previousVisibility = (album?.tracks.find((t) => String(t.id) === String(trackId))
      ?.visibility ?? 'public') as TrackVisibility;

    const applyTrackVisibility = (next: TrackVisibility) => {
      setAlbumsData((prev) =>
        prev.map((a) =>
          a.albumId === albumId || a.id === albumId
            ? {
                ...a,
                tracks: a.tracks.map((t) =>
                  String(t.id) === String(trackId) ? { ...t, visibility: next } : t
                ),
              }
            : a
        )
      );
      dispatch(patchDashboardTrackVisibility({ albumId, trackId, visibility: next }));
    };

    applyTrackVisibility(visibility);
    flashDashboardRow(`dashboard-track-row-${trackId}`, visibility);

    try {
      const response = await fetchWithAuthSession('/api/update-track-visibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ albumId, trackId, visibility }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(getHttpErrorMessage(errorData, response.status, 'message'));
      }

      notifyPublicSurfaceChanged(
        { type: 'trackVisibilityChanged', albumId },
        { artistSlug: resolvePublicArtistSlugForRefresh() }
      );
    } catch (error) {
      console.error('❌ Error updating track visibility:', error);
      applyTrackVisibility(previousVisibility);
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message: `Ошибка при изменении доступа к треку: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'error',
      });
    }
  };

  const handleAlbumVisibilityChange = async (
    albumId: string,
    visibility: Extract<TrackVisibility, 'public' | 'hidden'>
  ) => {
    const token = getToken();
    if (!token) {
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message:
          ui?.dashboard?.errorNotAuthorized ?? 'Error: you are not authorized. Please log in.',
        variant: 'error',
      });
      return;
    }

    const previousIsPublic =
      selectDashboardAlbumsData(getStore().getState()).find((a) => a.albumId === albumId)
        ?.isPublic ?? true;

    dispatch(
      patchDashboardAlbumVisibility({
        albumId,
        isPublic: albumVisibilityToIsPublic(visibility),
      })
    );
    flashDashboardRow(`dashboard-album-row-${albumId}`, visibility);

    try {
      const response = await fetchWithAuthSession('/api/update-album-visibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ albumId, visibility }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as { message?: string })?.message || `HTTP ${response.status}`);
      }

      notifyPublicSurfaceChanged(
        { type: 'albumVisibilityChanged', albumId },
        { artistSlug: resolvePublicArtistSlugForRefresh() }
      );
    } catch (error) {
      console.error('Error updating album visibility:', error);
      dispatch(patchDashboardAlbumVisibility({ albumId, isPublic: previousIsPublic }));
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message: `${ui?.dashboard?.error ?? 'Error'}: ${error instanceof Error ? error.message : 'Unknown'}`,
        variant: 'error',
      });
    }
  };

  const handleArticleVisibilityChange = async (articleId: string, visibility: TrackVisibility) => {
    const token = getToken();
    if (!token) {
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message:
          ui?.dashboard?.errorNotAuthorized ?? 'Error: you are not authorized. Please log in.',
        variant: 'error',
      });
      return;
    }

    const previousVisibility =
      (selectDashboardArticlesDataResolved(getStore().getState()).find(
        (a) => String(a.id) === String(articleId)
      )?.visibility as TrackVisibility | undefined) ?? 'public';

    dispatch(patchDashboardArticleVisibility({ articleId, visibility }));
    flashDashboardRow(`dashboard-article-row-${articleId}`, visibility);

    try {
      const response = await fetchWithAuthSession('/api/update-article-visibility', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ articleId, visibility }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as { message?: string })?.message || `HTTP ${response.status}`);
      }

      notifyPublicSurfaceChanged(
        { type: 'articlePublicChanged' },
        { artistSlug: resolvePublicArtistSlugForRefresh() }
      );
    } catch (error) {
      console.error('Error updating article visibility:', error);
      dispatch(patchDashboardArticleVisibility({ articleId, visibility: previousVisibility }));
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message: `${ui?.dashboard?.error ?? 'Error'}: ${error instanceof Error ? error.message : 'Unknown'}`,
        variant: 'error',
      });
    }
  };

  const performDeleteTrack = async (albumId: string, trackId: string, trackTitle?: string) => {
    const albumBeforeDelete = albumsFromStore.find((a) => a.albumId === albumId);
    const wasPubliclyVisible = albumBeforeDelete
      ? hasPublishedPublicReleases([albumBeforeDelete])
      : false;

    try {
      const token = getToken();
      if (!token) {
        setAlertModal({
          isOpen: true,
          title: ui?.dashboard?.error ?? 'Error',
          message:
            ui?.dashboard?.errorNotAuthorized ?? 'Error: you are not authorized. Please log in.',
          variant: 'error',
        });
        return;
      }

      // Удаляем трек через API
      const response = await fetchWithAuthSession(
        `/api/albums?trackId=${encodeURIComponent(trackId)}&albumId=${encodeURIComponent(albumId)}&lang=${encodeURIComponent(lang)}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(getHttpErrorMessage(errorData, response.status, 'error'));
      }

      // Сразу убираем трек в UI (не ждём повторной загрузки)
      setAlbumsData((prev) =>
        prev.map((a) => {
          if (a.albumId !== albumId && a.id !== albumId) {
            return a;
          }
          const tracks = a.tracks.filter(
            (t) => String(t.id) !== String(trackId) && t.id !== trackId
          );
          return {
            ...a,
            tracks,
            ...(tracks.length === 0 ? { isPublic: false, isPublished: false } : {}),
          };
        })
      );

      try {
        await dispatch(fetchDashboardAlbums({ force: true, ownerDashboard: true })).unwrap();
      } catch (refetchErr: unknown) {
        const name =
          refetchErr && typeof refetchErr === 'object' && 'name' in refetchErr
            ? (refetchErr as { name?: string }).name
            : undefined;
        if (name !== 'ConditionError') {
          console.warn('⚠️ [performDeleteTrack] fetchDashboardAlbums after delete:', refetchErr);
        }
      }

      if (wasPubliclyVisible) {
        notifyPublicSurfaceChanged(
          { type: 'trackDeleted', albumId },
          { artistSlug: resolvePublicArtistSlugForRefresh() }
        );
      }

      toast.show({
        variant: 'success',
        title: formatTrackDeletedSuccessMessage(trackTitle, ui),
        duration: TRACK_DELETED_TOAST_DURATION_MS,
      });
    } catch (error) {
      console.error('❌ Error deleting track:', error);
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message: `Ошибка при удалении трека: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'error',
      });
    }
  };

  const handleDeleteAlbum = async (albumId: string) => {
    // Находим альбом для получения названия
    const album = albumsData.find((a) => a.id === albumId);
    const albumTitle = album?.title || albumId;

    // Показываем модальное окно подтверждения
    setConfirmationModal({
      isOpen: true,
      title: ui?.dashboard?.confirmAction ?? 'Confirm action',
      message: (
        ui?.dashboard?.confirmDeleteAlbum ?? 'Are you sure you want to delete the album "{name}"?'
      ).replace('{name}', albumTitle),
      variant: 'danger',
      onConfirm: async () => {
        setConfirmationModal(null);
        await performDeleteAlbum(albumId);
      },
    });
  };

  const handlePublishAlbum = async (albumId: string) => {
    const albumFromStore = albumsFromStore.find((a) => a.albumId === albumId);
    if (!albumFromStore || !isAlbumReadyToPublish(albumFromStore)) {
      return;
    }

    setPublishingAlbumId(albumId);

    try {
      const token = getToken();
      if (!token) {
        setAlertModal({
          isOpen: true,
          title: ui?.dashboard?.error ?? 'Error',
          message:
            ui?.dashboard?.errorNotAuthorized ?? 'Error: you are not authorized. Please log in.',
          variant: 'error',
        });
        return;
      }

      const response = await fetchWithAuthSession('/api/albums', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          albumId,
          lang,
          publish: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          (errorData as { error?: string })?.error || `HTTP error! status: ${response.status}`
        );
      }

      await dispatch(fetchDashboardAlbums({ force: true, ownerDashboard: true })).unwrap();

      notifyPublicSurfaceChanged(
        { type: 'albumPublished', albumId },
        { artistSlug: resolvePublicArtistSlugForRefresh() }
      );
      const publishedToast = formatAlbumPublishedToastCopy(ui, lang);
      toast.show({
        variant: 'success',
        title: publishedToast.title,
        description: publishedToast.description,
        duration: ALBUM_PUBLISHED_TOAST_DURATION_MS,
      });
    } catch (error) {
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message:
          ui?.dashboard?.publishAlbumFailed ??
          (lang !== 'ru'
            ? `Could not publish album: ${error instanceof Error ? error.message : 'Unknown error'}`
            : `Не удалось опубликовать альбом: ${error instanceof Error ? error.message : 'Unknown error'}`),
        variant: 'error',
      });
    } finally {
      setPublishingAlbumId(null);
    }
  };

  const handleDeleteArticle = async (article: IArticles) => {
    // Показываем модальное окно подтверждения
    setConfirmationModal({
      isOpen: true,
      title: ui?.dashboard?.confirmAction ?? 'Confirm action',
      message: (
        ui?.dashboard?.confirmDeleteArticle ??
        'Are you sure you want to delete the article "{name}"?'
      ).replace('{name}', article.nameArticle || article.articleId),
      variant: 'danger',
      onConfirm: async () => {
        setConfirmationModal(null);
        await performDeleteArticle(article);
      },
    });
  };

  const performDeleteArticle = async (article: IArticles) => {
    const wasPublished = isArticlePublicOnArtistPage(article);

    try {
      const token = getToken();
      if (!token) {
        setAlertModal({
          isOpen: true,
          title: ui?.dashboard?.error ?? 'Error',
          message:
            ui?.dashboard?.errorNotAuthorized ?? 'Error: you are not authorized. Please log in.',
          variant: 'error',
        });
        return;
      }

      // Нужен UUID id статьи для удаления
      if (!article.id) {
        setAlertModal({
          isOpen: true,
          title: ui?.dashboard?.error ?? 'Error',
          message:
            ui?.dashboard?.errorArticleIdNotFound ??
            'Error: could not find article ID for deletion.',
          variant: 'error',
        });
        return;
      }

      // Удаляем статью через API
      const response = await fetchWithAuthSession(
        `/api/articles-api?id=${encodeURIComponent(article.id)}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(getHttpErrorMessage(errorData, response.status, 'error'));
      }

      // Обновляем Redux store
      dispatch(removeArticleFromPublicCatalog({ articleId: article.articleId }));
      await dispatch(fetchArticles({ force: true, ownerDashboard: true })).unwrap();

      handleArticleRemoved({ wasPublished });

      toast.show({
        variant: 'success',
        title: formatArticleDeletedSuccessMessage(article.nameArticle, ui),
        duration: ARTICLE_DELETED_TOAST_DURATION_MS,
      });
    } catch (error) {
      console.error('❌ Error deleting article:', error);
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message: `${ui?.dashboard?.errorDeletingArticle ?? 'Error deleting article'}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'error',
      });
    }
  };

  const performDeleteAlbum = async (albumId: string) => {
    const deletedAlbumTitle = albumsData.find((a) => a.id === albumId)?.title;
    const albumBeforeDelete = albumsFromStore.find((a) => a.albumId === albumId);
    const shouldSyncPublicCatalog = Boolean(albumBeforeDelete);

    try {
      const token = getToken();
      if (!token) {
        setAlertModal({
          isOpen: true,
          title: ui?.dashboard?.error ?? 'Error',
          message:
            ui?.dashboard?.errorNotAuthorized ?? 'Error: you are not authorized. Please log in.',
          variant: 'error',
        });
        return;
      }

      // Удаляем альбом через API
      const response = await fetchWithAuthSession('/api/albums', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          albumId,
          lang,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(getHttpErrorMessage(errorData, response.status, 'error'));
      }

      // Обновляем Redux store
      await dispatch(fetchDashboardAlbums({ force: true, ownerDashboard: true })).unwrap();

      // Удаляем альбом из локального состояния
      setAlbumsData((prev) => prev.filter((a) => a.id !== albumId));

      // Закрываем расширенный вид, если удаленный альбом был открыт
      if (expandedAlbumId === albumId) {
        setExpandedAlbumId(null);
      }

      if (shouldSyncPublicCatalog) {
        notifyPublicSurfaceChanged(
          { type: 'albumDeleted', albumId },
          { artistSlug: resolvePublicArtistSlugForRefresh() }
        );
      }

      toast.show({
        variant: 'success',
        title: formatAlbumDeletedSuccessMessage(deletedAlbumTitle, ui),
        duration: ALBUM_DELETED_TOAST_DURATION_MS,
      });
    } catch (error) {
      console.error('❌ Error deleting album:', error);
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message: `Ошибка при удалении альбома: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'error',
      });
    }
  };

  // Обработка загрузки треков
  const markTrackProcessingPendingLocally = useCallback((albumSlug: string, trackId: string) => {
    setAlbumsData((prev) =>
      prev.map((album) => {
        if (album.albumId !== albumSlug && album.id !== albumSlug) {
          return album;
        }
        return {
          ...album,
          tracks: album.tracks.map((track) =>
            track.id === trackId
              ? { ...track, processingStatus: 'pending' as const, processingError: null }
              : track
          ),
        };
      })
    );
  }, []);

  const handleRetryTrackProcessing = useCallback(
    async (albumSlug: string, trackId: string) => {
      setRetryingTrackProcessingId(trackId);
      try {
        const result = await regenerateTrackAssets(albumSlug, trackId);
        if (!result.success) {
          setAlertModal({
            isOpen: true,
            title: ui?.dashboard?.trackProcessing?.enqueueFailed ?? 'Processing not started',
            message: result.error,
            variant: 'error',
            retryTracks: { albumId: albumSlug, trackIds: [trackId] },
          });
          return;
        }

        markTrackProcessingPendingLocally(albumSlug, trackId);
        try {
          await dispatch(fetchDashboardAlbums({ force: true, ownerDashboard: true })).unwrap();
        } catch (fetchError: unknown) {
          if ((fetchError as { name?: string })?.name !== 'ConditionError') {
            console.error('⚠️ Failed to refresh albums after retry:', fetchError);
          }
        }
      } finally {
        setRetryingTrackProcessingId(null);
      }
    },
    [dispatch, markTrackProcessingPendingLocally, ui?.dashboard?.trackProcessing?.enqueueFailed]
  );

  const handleRetryTracksFromAlert = useCallback(async () => {
    const retryTracks = alertModal?.retryTracks;
    if (!retryTracks) {
      return;
    }

    setRetryingTrackProcessingId(retryTracks.trackIds[0] ?? null);
    try {
      for (const trackId of retryTracks.trackIds) {
        setRetryingTrackProcessingId(trackId);
        const result = await regenerateTrackAssets(retryTracks.albumId, trackId);
        if (!result.success) {
          setAlertModal({
            isOpen: true,
            title: ui?.dashboard?.trackProcessing?.enqueueFailed ?? 'Processing not started',
            message:
              result.error ||
              ui?.dashboard?.trackProcessingRetryAllFailed ||
              'Could not restart audio processing.',
            variant: 'error',
            retryTracks,
          });
          return;
        }
        markTrackProcessingPendingLocally(retryTracks.albumId, trackId);
      }

      setAlertModal(null);
      try {
        await dispatch(fetchDashboardAlbums({ force: true, ownerDashboard: true })).unwrap();
      } catch (fetchError: unknown) {
        if ((fetchError as { name?: string })?.name !== 'ConditionError') {
          console.error('⚠️ Failed to refresh albums after retry:', fetchError);
        }
      }
    } finally {
      setRetryingTrackProcessingId(null);
    }
  }, [
    alertModal?.retryTracks,
    dispatch,
    markTrackProcessingPendingLocally,
    ui?.dashboard?.trackProcessing?.enqueueFailed,
    ui?.dashboard?.trackProcessingRetryAllFailed,
  ]);

  const executeReplaceTrackAudio = useCallback(
    async (albumId: string, trackId: string, trackTitle: string, file: File) => {
      if (isUploadingTracks[albumId] || replacingTrackId) {
        return;
      }

      setReplacingTrackId(trackId);
      setIsUploadingTracks((prev) => ({ ...prev, [albumId]: true }));
      setUploadProgress((prev) => ({ ...prev, [albumId]: 0 }));

      try {
        setUploadProgress((prev) => ({ ...prev, [albumId]: 10 }));

        const trackData = await prepareAndUploadTrack(file, albumId, trackId, {
          lang,
          title: trackTitle,
        });

        setUploadProgress((prev) => ({ ...prev, [albumId]: 80 }));

        const result = await uploadTracks(albumId, lang, [trackData]);

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to replace track audio');
        }

        setUploadProgress((prev) => ({ ...prev, [albumId]: 100 }));

        const entry = result.data[0] as {
          trackId: string;
          processingStatus?: TrackData['processingStatus'];
          processingError?: string;
        };

        const durationLabel = `${Math.floor(trackData.duration / 60)}:${Math.floor(
          trackData.duration % 60
        )
          .toString()
          .padStart(2, '0')}`;

        setAlbumsData((prevAlbums) =>
          prevAlbums.map((album) => {
            if (album.albumId !== albumId && album.id !== albumId) {
              return album;
            }
            return {
              ...album,
              tracks: album.tracks.map((track) =>
                track.id === trackId
                  ? {
                      ...track,
                      duration: durationLabel,
                      processingStatus: entry?.processingStatus ?? 'pending',
                      processingError: entry?.processingError ?? null,
                    }
                  : track
              ),
            };
          })
        );

        setIsUploadingTracks((prev) => {
          const next = { ...prev };
          delete next[albumId];
          return next;
        });
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[albumId];
          return next;
        });

        try {
          await new Promise((resolve) => setTimeout(resolve, 300));
          await dispatch(fetchDashboardAlbums({ force: true, ownerDashboard: true })).unwrap();
        } catch (fetchError: unknown) {
          if ((fetchError as { name?: string })?.name !== 'ConditionError') {
            console.error('⚠️ Failed to refresh albums after replace:', fetchError);
          }
        }

        notifyPublicSurfaceChanged(
          { type: 'trackContentChanged', albumId },
          { artistSlug: resolvePublicArtistSlugForRefresh() }
        );

        if (entry?.processingStatus === 'failed') {
          setAlertModal({
            isOpen: true,
            title: ui?.dashboard?.trackProcessing?.enqueueFailed ?? 'Processing not started',
            message:
              entry.processingError ??
              ui?.dashboard?.trackProcessingFailedAfterUpload ??
              'Tracks were uploaded, but audio processing could not start.',
            variant: 'warning',
            retryTracks: { albumId, trackIds: [trackId] },
          });
        }
      } catch (error) {
        console.error('❌ Error replacing track audio:', error);
        setAlertModal({
          isOpen: true,
          title: ui?.dashboard?.error ?? 'Error',
          message: `Error replacing track audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: 'error',
        });
      } finally {
        setReplacingTrackId(null);
        setIsUploadingTracks((prev) => {
          const next = { ...prev };
          delete next[albumId];
          return next;
        });
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[albumId];
          return next;
        });
      }
    },
    [
      dispatch,
      isUploadingTracks,
      lang,
      replacingTrackId,
      resolvePublicArtistSlugForRefresh,
      ui?.dashboard,
    ]
  );

  const handleReplaceTrackAudioRequest = useCallback(
    (albumId: string, trackId: string, trackTitle: string, file: File) => {
      if (!emailVerified) return;

      setConfirmationModal({
        isOpen: true,
        title: ui?.dashboard?.replaceTrackAudioConfirmTitle ?? "Replace this track's audio?",
        message:
          ui?.dashboard?.replaceTrackAudioConfirmMessage ??
          'After processing completes, the previous master file and all generated versions will be removed automatically.',
        variant: 'warning',
        confirmText: ui?.dashboard?.replaceTrackAudioConfirm ?? 'Replace',
        irreversibleHint: null,
        onConfirm: () => {
          setConfirmationModal(null);
          void executeReplaceTrackAudio(albumId, trackId, trackTitle, file);
        },
      });
    },
    [emailVerified, executeReplaceTrackAudio, ui?.dashboard]
  );

  const handleTrackUpload = async (albumId: string, files: FileList) => {
    if (!emailVerified) return;
    if (isUploadingTracks[albumId]) {
      return;
    }

    const abortController = new AbortController();
    trackUploadAbortControllersRef.current[albumId] = abortController;
    const cancelledMessage = formatTrackUploadCancelledMessage(lang, ui);
    const uploadErrorCopy = resolveTrackUploadErrorCopy(lang, ui);

    setIsUploadingTracks((prev) => ({ ...prev, [albumId]: true }));
    setUploadProgress((prev) => ({ ...prev, [albumId]: 0 }));

    try {
      // Находим альбом в albumsFromStore для получения данных
      const albumFromStore = albumsFromStore.find((a) => a.albumId === albumId);
      if (!albumFromStore) {
        throw new Error(
          ui?.dashboard?.trackUploadAlbumNotFound ??
            (lang === 'ru' ? 'Альбом не найден' : 'Album not found')
        );
      }

      // Загружаем файлы и подготавливаем метаданные для каждого трека
      const tracksData: TrackUploadData[] = [];
      const uploadFailures: TrackUploadFailure[] = [];
      const fileArray = Array.from(files);
      const totalFileCount = fileArray.length;

      // Стабильный track_id (UUID): не зависит от порядка/дыр в нумерации; привязка lyrics/метаданных не «съезжает».
      const newStableTrackId = (): string => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID();
        }
        return `tr-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      };

      for (let i = 0; i < fileArray.length; i++) {
        if (abortController.signal.aborted) {
          break;
        }

        const file = fileArray[i];
        const trackId = newStableTrackId();

        // Обновляем прогресс: загрузка файла (0-80% для всех файлов)
        const fileProgressStart = (i / fileArray.length) * 80;
        const fileProgressEnd = ((i + 1) / fileArray.length) * 80;
        setUploadProgress((prev) => ({ ...prev, [albumId]: fileProgressStart }));

        try {
          const trackData = await prepareAndUploadTrack(file, albumId, trackId, {
            lang,
            signal: abortController.signal,
          });
          tracksData.push(trackData);

          // Обновляем прогресс после успешной загрузки файла
          setUploadProgress((prev) => ({ ...prev, [albumId]: fileProgressEnd }));
        } catch (error) {
          console.error(`❌ [handleTrackUpload] Error uploading track ${trackId}:`, error);
          const isCancelled = abortController.signal.aborted;
          const msg = isCancelled
            ? cancelledMessage
            : resolveTrackUploadFailureReason(error, lang, ui);
          uploadFailures.push({ fileName: file.name, reason: msg });
          if (isCancelled) {
            break;
          }
        }
      }

      // Обновляем прогресс: сохранение метаданных в БД (80-100%)
      setUploadProgress((prev) => ({ ...prev, [albumId]: 90 }));

      if (tracksData.length === 0) {
        if (abortController.signal.aborted) {
          setAlertModal({
            isOpen: true,
            title: cancelledMessage,
            message: formatUploadFailuresMessage(uploadFailures, ui),
            variant: 'info',
          });
          return;
        }

        setAlertModal({
          isOpen: true,
          title: ui?.dashboard?.error ?? (lang === 'ru' ? 'Ошибка' : 'Error'),
          message: formatTrackUploadAllFailedMessage(uploadFailures, ui, lang),
          variant: 'error',
        });
        return;
      }

      // Загружаем треки
      const result = await uploadTracks(albumId, lang, tracksData);

      if (result.success && result.data) {
        const fromResponse = Array.isArray(result.data) ? result.data.length : 0;
        const uploadedCount = fromResponse > 0 ? fromResponse : tracksData.length;

        // Обновляем прогресс: завершение (100%)
        setUploadProgress((prev) => ({ ...prev, [albumId]: 100 }));

        const processingByTrackId = new Map(
          (result.data ?? []).map((entry) => [
            entry.trackId,
            {
              processingStatus: (entry as { processingStatus?: TrackData['processingStatus'] })
                .processingStatus,
              processingError: (entry as { processingError?: string }).processingError,
            },
          ])
        );

        // Оптимистичное обновление: сразу добавляем новые треки в локальное состояние
        setAlbumsData((prevAlbums) => {
          return prevAlbums.map((album) => {
            if (album.albumId === albumId || album.id === albumId) {
              const maxOrder = album.tracks.reduce((m, t) => Math.max(m, t.order_index ?? 0), 0);
              // Оптимистично: тот же шаг, что на сервере (max + 10, +20, …)
              const newTracks: TrackData[] = tracksData.map((trackData, i) => {
                const processing = processingByTrackId.get(trackData.trackId);
                return {
                  id: trackData.trackId,
                  title: trackData.translations[lang]?.title ?? '',
                  order_index: maxOrder + TRACK_ORDER_INDEX_STEP * (i + 1),
                  duration: `${Math.floor(trackData.duration / 60)}:${Math.floor(
                    trackData.duration % 60
                  )
                    .toString()
                    .padStart(2, '0')}`,
                  processingStatus: processing?.processingStatus ?? 'pending',
                  processingError: processing?.processingError,
                  lyrics: {
                    albumId,
                    trackId: trackData.trackId,
                    lang,
                    content: '',
                    syncedLines: null,
                    state: 'empty' as const,
                    syncedAt: null,
                  },
                };
              });

              return {
                ...album,
                tracks: [...album.tracks, ...newTracks],
              };
            }
            return album;
          });
        });

        setIsUploadingTracks((prev) => {
          const next = { ...prev };
          delete next[albumId];
          return next;
        });
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[albumId];
          return next;
        });

        // Обновляем список альбомов из БД для синхронизации
        // useEffect автоматически обновит albumsData когда albumsFromStore изменится
        try {
          // Небольшая задержка для гарантии обновления БД
          await new Promise((resolve) => setTimeout(resolve, 300));
          await dispatch(fetchDashboardAlbums({ force: true, ownerDashboard: true })).unwrap();
        } catch (fetchError: unknown) {
          if (!isConditionError(fetchError)) {
            console.error('⚠️ Failed to refresh albums:', fetchError);
          }
        }

        notifyPublicSurfaceChanged(
          { type: 'trackContentChanged', albumId },
          { artistSlug: resolvePublicArtistSlugForRefresh() }
        );

        const failedProcessingTracks = (result.data ?? []).filter(
          (entry) => (entry as { processingStatus?: string }).processingStatus === 'failed'
        );

        const partialFailuresMessage = formatUploadFailuresMessage(uploadFailures, ui);
        const processingMessage =
          ui?.dashboard?.trackProcessingFailedAfterUpload ??
          'Tracks were uploaded, but audio processing could not start.';

        if (failedProcessingTracks.length > 0) {
          const combinedMessage = [processingMessage, partialFailuresMessage]
            .filter(Boolean)
            .join('\n\n');
          setAlertModal({
            isOpen: true,
            title:
              uploadFailures.length > 0
                ? formatUploadedTracksPartialTitle(uploadedCount, totalFileCount, ui)
                : (ui?.dashboard?.trackProcessing?.enqueueFailed ?? 'Processing not started'),
            message: combinedMessage,
            variant: 'warning',
            retryTracks: {
              albumId,
              trackIds: failedProcessingTracks.map(
                (entry) => (entry as { trackId: string }).trackId
              ),
            },
          });
        } else if (uploadFailures.length > 0) {
          setAlertModal({
            isOpen: true,
            title: formatUploadedTracksPartialTitle(uploadedCount, totalFileCount, ui),
            message: partialFailuresMessage,
            variant: 'warning',
          });
        } else {
          toast.show({
            variant: 'success',
            title: formatUploadedTracksSuccessMessage(uploadedCount, lang, ui),
            duration: TRACKS_UPLOADED_TOAST_DURATION_MS,
          });
        }
      } else {
        throw new Error(result.error || uploadErrorCopy.failedSaveTracks);
      }
    } catch (error) {
      console.error('❌ Error uploading tracks:', error);
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? (lang === 'ru' ? 'Ошибка' : 'Error'),
        message: resolveTrackUploadFailureReason(error, lang, ui),
        variant: 'error',
      });
    } finally {
      delete trackUploadAbortControllersRef.current[albumId];
      setIsUploadingTracks((prev) => {
        const newState = { ...prev };
        delete newState[albumId];
        return newState;
      });
      setUploadProgress((prev) => {
        const newState = { ...prev };
        delete newState[albumId];
        return newState;
      });
    }
  };

  const handleCancelTrackUpload = useCallback((albumId: string) => {
    trackUploadAbortControllersRef.current[albumId]?.abort();
  }, []);

  const resolveDashboardTrackLyrics = useCallback(
    (albumId: string, trackId: string): TrackLyricsBundle => {
      const album = albumsData.find((a) => a.id === albumId || a.albumId === albumId);
      const track = album?.tracks.find((t) => t.id === trackId);
      return resolveTrackLyricsBundle(getStore().getState(), albumId, trackId, track?.lyrics);
    },
    [albumsData]
  );

  const handleLyricsAction = async (
    action: string,
    albumId: string,
    trackId: string,
    trackTitle: string
  ) => {
    preloadLyricsModals();
    if (action === 'sync') {
      preloadSyncLyricsModal();
    }

    const album = albumsData.find((a) => a.id === albumId || a.albumId === albumId);
    const track = album?.tracks.find((t) => t.id === trackId);
    const lyrics = resolveDashboardTrackLyrics(albumId, trackId);

    if (action === 'add') {
      setAddLyricsModal({ isOpen: true, albumId, trackId, trackTitle });
      return;
    }

    if (!track) return;

    if (action === 'edit') {
      setEditLyricsModal({
        isOpen: true,
        albumId,
        trackId,
        trackTitle,
        trackState: lyrics.state,
        hasSyncedLyrics: lyrics.state === 'synced',
        initialLyrics: lyrics.content,
        initialAuthorship: lyrics.authorship ?? track.authorship,
      });
      return;
    }

    if (action === 'prev') {
      if (lyrics.state !== 'synced') {
        return;
      }

      if (track.src?.trim() && !album?.userId) {
        console.error('[BUG] album.userId missing', { albumId, context: 'previewLyricsModal' });
      }

      setPreviewLyricsModal({
        isOpen: true,
        lyrics,
        trackSrc: track.src,
        mediaOwnerUserId: album?.userId,
      });
      return;
    }

    if (action === 'sync') {
      if (track.src?.trim() && !album?.userId) {
        console.error('[BUG] album.userId missing', { albumId, context: 'syncLyricsModal' });
      }
      setSyncLyricsModal({
        isOpen: true,
        albumId,
        trackId,
        trackTitle,
        trackSrc: track.src,
        mediaOwnerUserId: album?.userId,
        trackDurationSeconds: parseTrackDurationToSeconds(track.duration),
        lyricsText: lyrics.content,
        authorship: track.authorship ?? lyrics.authorship,
      });
    }
  };

  const handleAddLyrics = async (lyrics: string, authorship?: string) => {
    if (!addLyricsModal) return;
    if (!lyrics.trim()) return;

    try {
      const bundle = await saveTrackLyricsContentApi({
        albumId: addLyricsModal.albumId,
        trackId: addLyricsModal.trackId,
        lang: lang === 'ru' ? 'ru' : 'en',
        content: lyrics,
        authorship,
        trackTitle: addLyricsModal.trackTitle,
      });
      dispatch(applyTrackLyricsBundle(bundle));
    } catch (error) {
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message:
          error instanceof Error
            ? error.message
            : (ui?.dashboard?.errorSavingText ?? 'Error saving text'),
        variant: 'error',
      });
    }

    setAddLyricsModal(null);
  };

  const handleSaveLyrics = async (lyrics: string, authorship?: string) => {
    if (!editLyricsModal) return;

    try {
      const bundle = await saveTrackLyricsContentApi({
        albumId: editLyricsModal.albumId,
        trackId: editLyricsModal.trackId,
        lang: lang === 'ru' ? 'ru' : 'en',
        content: lyrics,
        authorship,
        trackTitle: editLyricsModal.trackTitle,
      });
      dispatch(applyTrackLyricsBundle(bundle));

      setEditLyricsModal((prev) =>
        prev
          ? {
              ...prev,
              initialLyrics: bundle.content,
              initialAuthorship: authorship ?? '',
              trackState: bundle.state,
              hasSyncedLyrics: bundle.state === 'synced',
            }
          : null
      );
    } catch (error) {
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message:
          error instanceof Error
            ? error.message
            : (ui?.dashboard?.errorSavingText ?? 'Error saving text'),
        variant: 'error',
      });
    }
  };

  const getTrackLyricsText = (albumId: string, trackId: string): string => {
    return resolveDashboardTrackLyrics(albumId, trackId).content || '';
  };

  const getTrackAuthorship = (albumId: string, trackId: string): string | undefined => {
    const lyrics = resolveDashboardTrackLyrics(albumId, trackId);
    if (lyrics.authorship?.trim()) return lyrics.authorship;
    const album = albumsData.find((a) => a.id === albumId || a.albumId === albumId);
    const track = album?.tracks.find((t) => t.id === trackId);
    return track?.authorship;
  };

  const handlePreviewLyrics = async () => {
    if (!editLyricsModal) return;
    const { albumId, trackId } = editLyricsModal;
    const album = albumsData.find((a) => a.id === albumId || a.albumId === albumId);
    const track = album?.tracks.find((t) => t.id === trackId);
    const lyrics = resolveDashboardTrackLyrics(albumId, trackId);
    if (!track || lyrics.state !== 'synced') return;

    if (track.src?.trim() && !album?.userId) {
      console.error('[BUG] album.userId missing', { albumId, context: 'previewLyricsFromEdit' });
    }

    setPreviewLyricsModal({
      isOpen: true,
      lyrics,
      trackSrc: track?.src,
      mediaOwnerUserId: album?.userId,
    });
  };

  const handleSyncLyricsFromEdit = async (currentLyrics: string, currentAuthorship?: string) => {
    if (!editLyricsModal) return;
    preloadSyncLyricsModal();
    const { albumId, trackId, trackTitle } = editLyricsModal;
    // Сначала сохраняем изменения текста
    await handleSaveLyrics(currentLyrics, currentAuthorship);
    // Закрываем модалку редактирования текста
    setEditLyricsModal(null);
    // Открываем модалку синхронизации с сохранённым текстом
    const album = albumsData.find((a) => a.id === albumId);
    const track = album?.tracks.find((t) => t.id === trackId);
    if (track) {
      if (track.src?.trim() && !album?.userId) {
        console.error('[BUG] album.userId missing', { albumId, context: 'syncLyricsFromEdit' });
      }
      const trackDurationSeconds = parseTrackDurationToSeconds(track.duration);
      // Используем переданный текст напрямую (он уже сохранён через handleSaveLyrics)
      setSyncLyricsModal({
        isOpen: true,
        albumId,
        trackId,
        trackTitle,
        trackSrc: track.src,
        mediaOwnerUserId: album?.userId,
        trackDurationSeconds,
        lyricsText: currentLyrics,
        authorship: currentAuthorship,
      });
    }
  };

  const handleEditAlbumNext = useCallback(
    async (
      _formData: AlbumFormData,
      updatedAlbum?: AlbumEditable,
      meta?: { createdNewAlbum?: boolean }
    ) => {
      if (!editAlbumModal) {
        closeEditAlbumModal();
        return;
      }

      const searchAlbumId = updatedAlbum?.albumId || editAlbumModal.albumId;

      try {
        const fetchPayload = await dispatch(
          fetchDashboardAlbums({ force: true, ownerDashboard: true })
        ).unwrap();
        const result = fetchPayload.albums;

        if (result && result.length > 0 && searchAlbumId) {
          const foundAlbum = result.find((a: AlbumEditable) => a.albumId === searchAlbumId);
          if (!foundAlbum) {
            console.warn(
              '⚠️ [UserDashboard] Updated album not found in fetchDashboardAlbums result:',
              {
                searchedAlbumId: searchAlbumId,
                availableIds: result.map((a: AlbumEditable) => a.albumId),
                isNewAlbum: !editAlbumModal.albumId,
              }
            );
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 300));

        if (result && result.length > 0) {
          const transformedAlbums = transformEditableAlbumsToAlbumData(
            result,
            siteArtistDisplayName,
            lang
          );

          setAlbumsData(withDashboardAlbumOwner(transformedAlbums, userId));
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
        closeEditAlbumModal();

        if (meta?.createdNewAlbum) {
          const createdToast = formatAlbumCreatedToastCopy(ui, lang);
          toast.show({
            variant: 'success',
            title: createdToast.title,
            description: createdToast.description,
            duration: ALBUM_CREATED_TOAST_DURATION_MS,
          });
        }

        if (meta?.createdNewAlbum && searchAlbumId) {
          if (activeTab !== 'albums') {
            goDashboard(`${DASHBOARD_PATH}/albums`);
          }
          setExpandedAlbumId(searchAlbumId);
          setScrollToAlbumUploadId(searchAlbumId);
          setPendingTrackUploadAlbumId(searchAlbumId);
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === 'ConditionError') {
          closeEditAlbumModal();
          return;
        }
        closeEditAlbumModal();
      }
    },
    [
      activeTab,
      closeEditAlbumModal,
      dispatch,
      editAlbumModal,
      goDashboard,
      lang,
      siteArtistDisplayName,
      ui,
      userId,
    ]
  );

  const handleSyncLyricsSaved = useCallback(() => {
    const syncSavedToast = formatLyricsSyncSavedToastCopy(ui, lang);
    toast.show({
      variant: 'success',
      title: syncSavedToast.title,
      description: syncSavedToast.description,
      duration: LYRICS_SYNC_SAVED_TOAST_DURATION_MS,
    });
  }, [lang, ui]);

  const editTrackTitleDirty =
    !!editTrackModal?.isOpen && editTrackTitleDraft.trim() !== editTrackModal.trackTitle.trim();

  const finalizeEditTrackModalClose = useCallback(() => {
    setEditTrackModal(null);
  }, []);

  const editTrackPopupRequestCloseRef = useRef<(() => void) | null>(null);
  const closeEditTrackDialog = useCallback(() => {
    editTrackPopupRequestCloseRef.current?.();
  }, []);

  const editTrackCloseGuard = useCloseWithUnsavedConfirmation({
    isOpen: !!editTrackModal?.isOpen,
    hasUnsavedChanges: editTrackTitleDirty,
    closeDialog: closeEditTrackDialog,
  });

  if (tabFromRoute === 'profile' || tabFromRoute === 'social-links') {
    return <Navigate to={`${DASHBOARD_PATH}/settings`} replace state={location.state} />;
  }

  if (tabInvalid || tabDisallowed) {
    return (
      <Navigate
        to={`${DASHBOARD_PATH}/${getDefaultDashboardTab(user)}`}
        replace
        state={location.state}
      />
    );
  }

  if (!isAuthenticated() || !sessionUser) {
    // Session-expired: SessionExpiredRedirectController opens /auth with dashboard
    // backgroundLocation + returnTo. Do not clobber that navigation or unmount the
    // dashboard (which would discard open modals / unsaved editor state).
    if (!sessionReauthSurface) {
      const { returnTo, backgroundLocation } = buildSessionExpiredAuthTarget(location);
      const authParams = new URLSearchParams({ mode: 'login', returnTo });
      return (
        <Navigate
          to={{ pathname: '/auth', search: `?${authParams.toString()}` }}
          replace
          state={{ backgroundLocation }}
        />
      );
    }
  }

  const albumsInitialLoading =
    isArtist && (albumsStatus === 'loading' || albumsStatus === 'idle') && albumsData.length === 0;
  const albumsLoadFailed = albumsStatus === 'failed';
  /** Albums fetch failure must not block settings, collection, posts, etc. */
  const albumsDependentTabs: DashboardTab[] = ['albums', 'mixer'];
  const showAlbumsShellError =
    albumsLoadFailed && isArtist && albumsDependentTabs.includes(activeTab);

  const dashboardHeading = dashboardHeadingForTab(activeTab, ui);

  return (
    <ArtistMonetizationProvider>
      <>
        <Helmet>
          <title>
            {dashboardHeading} — {platformDisplayName(lang)}
          </title>
        </Helmet>

        <Popup
          isActive={true}
          onClose={closeDashboard}
          publicBackdrop
          initialFocusSelector=".user-dashboard__nav-item--active"
        >
          <div className="user-dashboard">
            {/* Main card container */}
            <div className="user-dashboard__card">
              {/* Header with controls */}
              <div className="user-dashboard__header">
                <h2 className="user-dashboard__title">{dashboardHeading}</h2>
                <PopupCloseButton
                  className="user-dashboard__close"
                  aria-label={ui?.dashboard?.close ?? 'Close'}
                >
                  <ModalCloseIcon />
                </PopupCloseButton>
              </div>

              {/* Main body with sidebar and content */}
              <div className="user-dashboard__body">
                <DashboardBillingSync />
                {/* Sidebar navigation */}
                <nav className="user-dashboard__sidebar">
                  {visibleTabs.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={clsx(
                        'user-dashboard__nav-item',
                        activeTab === tab && 'user-dashboard__nav-item--active'
                      )}
                      onClick={() => goDashboard(`${DASHBOARD_PATH}/${tab}`)}
                    >
                      <DashboardNavTabIcon tab={tab} />
                      {dashboardHeadingForTab(tab, ui)}
                    </button>
                  ))}
                </nav>

                {/* Content area: conditional mount; active + previous + pinned tabs stay in DOM (hidden) */}
                <div className="user-dashboard__content user-dashboard__tab-shell">
                  {albumsInitialLoading &&
                  !albumsLoadFailed &&
                  activeTab === 'albums' &&
                  emailVerified ? (
                    <DashboardLoadingState className="user-dashboard__tab-loading" />
                  ) : showAlbumsShellError ? (
                    <div
                      className="user-dashboard__error user-dashboard__error--tab-shell"
                      role="alert"
                    >
                      {ui?.dashboard?.errorLoading ?? 'Error loading:'}{' '}
                      {albumsError ||
                        (ui?.dashboard?.failedToLoadAlbums ?? 'Failed to load albums')}
                    </div>
                  ) : (
                    <>
                      {isArtist && shouldMount('payment-settings') ? (
                        <div
                          className="user-dashboard__tab-panel"
                          hidden={activeTab !== 'payment-settings'}
                          aria-hidden={activeTab !== 'payment-settings'}
                        >
                          {!emailVerified ? (
                            <EmailVerificationOnboarding context="payment-settings" />
                          ) : user?.id ? (
                            <PaymentSettings
                              userId={user.id}
                              active={activeTab === 'payment-settings'}
                              onMountPinChange={(pinned) =>
                                setTabPinned('payment-settings', pinned)
                              }
                            />
                          ) : (
                            <p className="user-dashboard__tab-placeholder">
                              {ui?.dashboard?.errorLoading ?? 'Error loading'}
                            </p>
                          )}
                        </div>
                      ) : null}
                      {shouldMount('my-purchases') ? (
                        <div
                          className="user-dashboard__tab-panel"
                          hidden={activeTab !== 'my-purchases'}
                          aria-hidden={activeTab !== 'my-purchases'}
                        >
                          <MyPurchasesContent
                            active={activeTab === 'my-purchases'}
                            onMountPinChange={(pinned) => setTabPinned('my-purchases', pinned)}
                          />
                        </div>
                      ) : null}
                      {isArtist && shouldMount('mixer') ? (
                        <div
                          className="user-dashboard__tab-panel"
                          hidden={activeTab !== 'mixer'}
                          aria-hidden={activeTab !== 'mixer'}
                        >
                          {!emailVerified ? (
                            <EmailVerificationOnboarding context="mixer" />
                          ) : albumsInitialLoading ? (
                            <DashboardLoadingState className="user-dashboard__tab-loading" />
                          ) : albumsData.length === 0 ? (
                            <MixerEmptyState ui={ui} onCreateAlbum={() => openEditAlbumModal()} />
                          ) : (
                            <MixerAdmin
                              ui={ui || undefined}
                              userId={user?.id || undefined}
                              albums={albumsData}
                              tabActive={activeTab === 'mixer'}
                              onMountPinChange={(pinned) => setTabPinned('mixer', pinned)}
                            />
                          )}
                        </div>
                      ) : null}
                      {collectionMounted ? (
                        <div
                          className="user-dashboard__tab-panel user-dashboard__tab-panel--collection"
                          hidden={activeTab !== 'collection'}
                          aria-hidden={activeTab !== 'collection'}
                        >
                          {activeTab === 'collection' && !collectionContentReady ? (
                            <DashboardLoadingState className="user-dashboard__tab-loading" />
                          ) : null}
                          <div
                            className={clsx(
                              'user-dashboard__collection-content',
                              !collectionContentReady &&
                                'user-dashboard__collection-content--pending'
                            )}
                          >
                            <MyArchiveContent
                              active={activeTab === 'collection'}
                              onContentReady={handleCollectionContentReady}
                              onContentBusy={handleCollectionContentBusy}
                              onMountPinChange={(pinned) => setTabPinned('collection', pinned)}
                            />
                          </div>
                        </div>
                      ) : null}
                      {subscriptionMounted ? (
                        <div
                          className="user-dashboard__tab-panel user-dashboard__tab-panel--subscription"
                          hidden={activeTab !== 'subscription'}
                          aria-hidden={activeTab !== 'subscription'}
                        >
                          {activeTab === 'subscription' && !subscriptionContentReady ? (
                            <DashboardLoadingState className="user-dashboard__tab-loading" />
                          ) : null}
                          <div
                            className={clsx(
                              'user-dashboard__subscription-content',
                              !subscriptionContentReady &&
                                'user-dashboard__subscription-content--pending'
                            )}
                          >
                            <SubscriptionContent
                              active={activeTab === 'subscription'}
                              onContentReady={handleSubscriptionContentReady}
                              onContentBusy={handleSubscriptionContentBusy}
                              onMountPinChange={(pinned) => setTabPinned('subscription', pinned)}
                            />
                          </div>
                        </div>
                      ) : null}
                      {isArtist && shouldMount('albums') ? (
                        <div
                          className="user-dashboard__tab-panel"
                          hidden={activeTab !== 'albums'}
                          aria-hidden={activeTab !== 'albums'}
                        >
                          <AlbumsTabContent
                            emailVerified={emailVerified}
                            initialLoading={albumsInitialLoading}
                            tabActive={activeTab === 'albums'}
                            albumsData={albumsData}
                            albumsFromStore={albumsFromStore}
                            expandedAlbumId={expandedAlbumId}
                            onSetExpandedAlbumId={setExpandedAlbumId}
                            expandedTrackId={expandedTrackId}
                            onSetExpandedTrackId={setExpandedTrackId}
                            albumAccessMenuAlbumId={albumAccessMenuAlbumId}
                            publishingAlbumId={publishingAlbumId}
                            isUploadingTracks={isUploadingTracks}
                            uploadProgress={uploadProgress}
                            dashboardRowFlashes={dashboardRowFlashes}
                            ui={ui}
                            lang={lang}
                            userId={userId}
                            trackUploadSectionRefs={trackUploadSectionRefs}
                            fileInputRefs={fileInputRefs}
                            pendingTrackUploadAlbumId={pendingTrackUploadAlbumId}
                            onPendingTrackUploadHandled={handlePendingTrackUploadHandled}
                            pendingFocusTrackKey={pendingFocusTrackKey}
                            onPendingFocusTrackHandled={handlePendingFocusTrackHandled}
                            onCreateAlbum={() => openEditAlbumModal()}
                            onEditAlbum={(albumId) => openEditAlbumModal(albumId)}
                            onPreloadEditAlbum={preloadEditAlbumModal}
                            onPreloadLyrics={preloadLyricsModals}
                            onToggleAlbum={toggleAlbum}
                            onAlbumAccessMenuChange={setAlbumAccessMenuAlbumId}
                            onAlbumVisibilityChange={(albumId, visibility) =>
                              void handleAlbumVisibilityChange(albumId, visibility)
                            }
                            onTrackUpload={handleTrackUpload}
                            onCancelTrackUpload={handleCancelTrackUpload}
                            onDragEnd={handleDragEnd}
                            onDeleteTrack={handleDeleteTrack}
                            onTrackTitleChange={handleTrackTitleChange}
                            onTrackVisibilityChange={handleTrackVisibilityChange}
                            onDeleteAlbum={handleDeleteAlbum}
                            onPublishAlbum={handlePublishAlbum}
                            onLyricsAction={handleLyricsAction}
                            retryingTrackProcessingId={retryingTrackProcessingId}
                            onRetryTrackProcessing={handleRetryTrackProcessing}
                            replacingTrackId={replacingTrackId}
                            onReplaceTrackAudio={handleReplaceTrackAudioRequest}
                          />
                        </div>
                      ) : null}
                      {isArtist && shouldMount('posts') ? (
                        <div
                          className="user-dashboard__tab-panel"
                          hidden={activeTab !== 'posts'}
                          aria-hidden={activeTab !== 'posts'}
                        >
                          <PostsTabContent
                            emailVerified={emailVerified}
                            articlesStatus={articlesStatus}
                            articlesError={articlesError}
                            articles={articlesFromStore ?? []}
                            articleAccessMenuArticleId={articleAccessMenuArticleId}
                            dashboardRowFlashes={dashboardRowFlashes}
                            ui={ui}
                            lang={lang}
                            onArticleAccessMenuChange={setArticleAccessMenuArticleId}
                            onArticleVisibilityChange={(articleId, visibility) =>
                              void handleArticleVisibilityChange(articleId, visibility)
                            }
                            onEditArticle={(article) => {
                              preloadEditArticleModal();
                              setEditArticleModal({ isOpen: true, article });
                            }}
                            onDeleteArticle={handleDeleteArticle}
                            onCreateArticle={openNewArticleEditor}
                            onPreloadCreateArticle={preloadEditArticleModal}
                          />
                        </div>
                      ) : null}
                      {shouldMount('settings') ? (
                        <div
                          className="user-dashboard__tab-panel"
                          hidden={activeTab !== 'settings'}
                          aria-hidden={activeTab !== 'settings'}
                        >
                          <div className="user-dashboard__settings-tab">
                            <div className="user-dashboard__section">
                              <div className="user-dashboard__settings-content">
                                <SettingsPageContent
                                  enabled={activeTab === 'settings'}
                                  scrollToHeaderImages={scrollSettingsToHeaderImages}
                                  onScrollToHeaderImagesHandled={() =>
                                    setScrollSettingsToHeaderImages(false)
                                  }
                                  userName={user?.name ?? undefined}
                                  userEmail={user?.email}
                                  emailVerified={emailVerified}
                                  isListener={isListener}
                                  isArtistPagePublic={isArtistPagePublic}
                                  isArtistPageVisibilityKnown={isArtistPageVisibilityKnown}
                                  profilePublicSlug={profilePublicSlug ?? ''}
                                  onOpenArtistPage={() => {
                                    if (!profilePublicSlug) return;
                                    openOwnArtistPage(
                                      lang,
                                      profilePublicSlug,
                                      isArtistPagePublic,
                                      navigate
                                    );
                                  }}
                                  onDeleteAccount={() => setIsDeleteAccountModalOpen(true)}
                                  onUpgradeToArtist={() => setIsUpgradeToArtistModalOpen(true)}
                                  onLogout={handleLogout}
                                  avatarSrc={avatarSrc}
                                  avatarRetinaSrc={avatarRetinaSrc ?? undefined}
                                  isUploadingAvatar={isUploadingAvatar}
                                  avatarInputRef={avatarInputRef}
                                  onAvatarUploadClick={handleAvatarClick}
                                  onAvatarChange={handleAvatarChange}
                                  onAvatarRemove={handleAvatarRemove}
                                  getProfileAvatarInitials={getProfileAvatarInitials}
                                  onNotAuthorized={handleSettingsNotAuthorized}
                                  onSaveError={handleSettingsSaveError}
                                  onMountPinChange={(pinned) => setTabPinned('settings', pinned)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Popup>

        <DashboardLazyModals
          addLyricsModal={addLyricsModal}
          editLyricsModal={editLyricsModal}
          previewLyricsModal={previewLyricsModal}
          syncLyricsModal={syncLyricsModal}
          editAlbumModal={editAlbumModal}
          editArticleModal={editArticleModal}
          onCloseAddLyrics={() => setAddLyricsModal(null)}
          onCloseEditLyrics={() => setEditLyricsModal(null)}
          onClosePreviewLyrics={() => setPreviewLyricsModal(null)}
          onCloseSyncLyrics={() => setSyncLyricsModal(null)}
          onCloseEditAlbum={closeEditAlbumModal}
          onCloseEditArticle={() => setEditArticleModal(null)}
          onAddLyricsSave={handleAddLyrics}
          onEditLyricsSave={handleSaveLyrics}
          getTrackLyricsText={getTrackLyricsText}
          getTrackAuthorship={getTrackAuthorship}
          onEditAlbumDiscardRiskChange={handleAlbumEditorDiscardRiskChange}
          onEditAlbumNext={handleEditAlbumNext}
          onSyncLyricsSave={(bundle) => {
            dispatch(applyTrackLyricsBundle(bundle));
          }}
          onSyncLyricsSaved={handleSyncLyricsSaved}
          onArticlePersisted={handleArticlePersisted}
          profilePublicSlug={profilePublicSlug}
        />

        {/* Edit Track Modal */}
        {editTrackModal && (
          <>
            <Popup
              isActive={editTrackModal.isOpen}
              onClose={finalizeEditTrackModalClose}
              onCancelRequest={() => editTrackCloseGuard.requestClose()}
              requestCloseRef={editTrackPopupRequestCloseRef}
              closeBlocked={editTrackCloseGuard.discardDialogOpen}
            >
              <div className="edit-track-modal">
                <div className="edit-track-modal__card">
                  <div className="edit-track-modal__header">
                    <button
                      type="button"
                      className="edit-track-modal__close"
                      onClick={() => editTrackCloseGuard.requestClose()}
                      aria-label={ui?.dashboard?.close ?? 'Close'}
                    >
                      <ModalCloseIcon />
                    </button>
                    <h2 className="edit-track-modal__title">
                      {ui?.dashboard?.editTrack ?? 'Edit Track'}
                    </h2>
                  </div>
                  <div className="edit-track-modal__content">
                    <div className="edit-track-modal__field">
                      <label className="edit-track-modal__label" htmlFor="edit-track-title-input">
                        {ui?.dashboard?.trackTitle ?? 'Track Title'}
                      </label>
                      <input
                        type="text"
                        className="edit-track-modal__input"
                        value={editTrackTitleDraft}
                        onChange={(e) => setEditTrackTitleDraft(e.target.value)}
                        id="edit-track-title-input"
                        autoFocus
                      />
                    </div>
                  </div>
                  <footer className="dashboard-modal-footer edit-track-modal__footer">
                    <DashboardButton
                      variant="outline"
                      onClick={() => editTrackCloseGuard.requestClose()}
                    >
                      {ui?.dashboard?.cancel ?? 'Cancel'}
                    </DashboardButton>
                    <DashboardButton
                      variant="primary"
                      onClick={async () => {
                        const newTitle = editTrackTitleDraft.trim();
                        if (newTitle && newTitle !== editTrackModal.trackTitle) {
                          await handleTrackTitleChange(
                            editTrackModal.albumId,
                            editTrackModal.trackId,
                            newTitle
                          );
                        }
                        setEditTrackModal(null);
                      }}
                    >
                      {ui?.dashboard?.save ?? 'Save'}
                    </DashboardButton>
                  </footer>
                </div>
              </div>
              <InlineEditDiscardDialog
                open={editTrackCloseGuard.discardDialogOpen}
                labels={getCloseDiscardConfirmLabels(ui ?? undefined)}
                titleId={editTrackCloseGuard.discardTitleDomId}
                onStay={editTrackCloseGuard.dismissDiscardDialog}
                onDiscard={editTrackCloseGuard.finalizeCloseWithoutSaving}
              />
            </Popup>
          </>
        )}

        {/* Confirmation Modal */}
        {confirmationModal && (
          <ConfirmationModal
            isOpen={confirmationModal.isOpen}
            title={confirmationModal.title}
            message={confirmationModal.message}
            irreversibleHint={
              confirmationModal.irreversibleHint !== undefined
                ? confirmationModal.irreversibleHint
                : (ui?.dashboard?.confirmActionIrreversible ?? 'This action cannot be undone.')
            }
            variant={confirmationModal.variant}
            cancelText={ui?.dashboard?.cancel ?? 'Cancel'}
            confirmText={
              confirmationModal.confirmText ??
              (confirmationModal.variant === 'danger'
                ? (ui?.dashboard?.confirmationModalConfirmDelete ?? 'Delete')
                : (ui?.dashboard?.confirmationModalConfirm ?? 'Confirm'))
            }
            closeLabel={ui?.dashboard?.close ?? 'Close'}
            onConfirm={confirmationModal.onConfirm}
            onCancel={() => setConfirmationModal(null)}
          />
        )}

        {/* Alert Modal */}
        {alertModal && (
          <AlertModal
            isOpen={alertModal.isOpen}
            title={alertModal.title}
            message={alertModal.message}
            variant={alertModal.variant}
            onClose={() => setAlertModal(null)}
            secondaryButton={
              alertModal.retryTracks
                ? {
                    text:
                      ui?.dashboard?.trackProcessing?.retryProcessing ??
                      ui?.dashboard?.trackProcessing?.retry ??
                      'Retry processing',
                    onClick: () => {
                      void handleRetryTracksFromAlert();
                    },
                    disabled: Boolean(retryingTrackProcessingId),
                  }
                : undefined
            }
          />
        )}

        <UpgradeToArtistModal
          isOpen={isUpgradeToArtistModalOpen}
          onClose={() => setIsUpgradeToArtistModalOpen(false)}
        />

        <DeleteAccountModal
          isOpen={isDeleteAccountModalOpen}
          onClose={() => setIsDeleteAccountModalOpen(false)}
          onDeleted={handleAccountDeleted}
          copy={deleteAccountCopy}
        />

        {albumEditorRouteLeaveBlocker.state === 'blocked' ? (
          <ConfirmationModal
            isOpen
            message={getCloseDiscardConfirmLabels(ui ?? undefined).message}
            cancelText={getCloseDiscardConfirmLabels(ui ?? undefined).stay}
            confirmText={getCloseDiscardConfirmLabels(ui ?? undefined).discard}
            onCancel={() => albumEditorRouteLeaveBlocker.reset?.()}
            onConfirm={() => albumEditorRouteLeaveBlocker.proceed?.()}
            variant="warning"
          />
        ) : null}
      </>
    </ArtistMonetizationProvider>
  );
}

export default UserDashboard;
