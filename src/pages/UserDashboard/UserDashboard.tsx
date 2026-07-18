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
  resolveDashboardModalCloseTarget,
} from '@shared/lib/dashboardModalBackground';
import { readDashboardOpenIntent, stripDashboardOpenIntent } from '@shared/lib/dashboardOpenIntent';
import { EmailVerificationOnboarding } from '@shared/lib/emailVerification';
import { AlbumPublishedToast } from '@shared/ui/albumPublishedToast/AlbumPublishedToast';
import { AlbumCreatedToast } from '@shared/ui/albumCreatedToast/AlbumCreatedToast';
import { TracksUploadedToast } from '@shared/ui/tracksUploadedToast/TracksUploadedToast';
import { AlbumDeletedToast } from '@shared/ui/albumDeletedToast/AlbumDeletedToast';
import { ArticleDeletedToast } from '@shared/ui/articleDeletedToast/ArticleDeletedToast';
import { ArticleEditorToast } from '@shared/ui/articleEditorToast';
import { LyricsSyncSavedToast } from '@shared/ui/lyricsSyncSavedToast/LyricsSyncSavedToast';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { buildApiUrl } from '@shared/lib/artistQuery';
import { isAlbumReadyToPublish } from '@entities/album/lib/isAlbumReadyToPublish';
import { hasPublishedPublicReleases } from '@entities/album/lib/hasPublishedPublicReleases';
import { albumVisibilityToIsPublic } from './components/albums/albumVisibilityOptions';
import { AlbumsTabContent } from './components/albums/AlbumsTabContent';
import { PostsTabContent } from './components/articles/PostsTabContent';
import { queueAlbumPublishedToast } from '@shared/lib/albumPublishedToast';
import { queueTracksUploadedToast } from '@shared/lib/tracksUploadedToast';
import { queueAlbumDeletedToast } from '@shared/lib/albumDeletedToast';
import { queueArticleDeletedToast } from '@shared/lib/articleDeletedToast';
import { queueLyricsSyncSavedToast } from '@shared/lib/lyricsSyncSavedToast';
import { getArtistSlugFromLocation } from '@shared/lib/albumDeletedRedirect';
import { isAuthOverlayPathname } from '@shared/lib/publicArtistContext';
import {
  buildSessionExpiredAuthTarget,
  isSessionExpiredHandlingPending,
} from '@shared/lib/sessionExpired';
import { openOwnArtistPage } from '@shared/lib/ownArtistPage';
import {
  artistHasPublicPageContent,
  isArticlePublicOnArtistPage,
} from '@shared/lib/artistPageContent';
import { useOwnArtistPageSummary } from '@shared/lib/hooks/useOwnArtistPageSummary';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { ArtistMonetizationProvider } from '@shared/lib/payment/ArtistMonetizationContext';
import {
  fetchAlbums,
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
  applyTrackLyricsBundle,
  resolveTrackLyricsBundle,
  saveTrackLyricsContentApi,
} from '@entities/lyrics';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';
import { getStore } from '@shared/model/appStore';
import { uploadTracks, prepareAndUploadTrack, type TrackUploadData } from '@shared/api/tracks';
import { TRACK_ORDER_INDEX_STEP } from '@shared/lib/tracks/trackOrderIndex';
import { AddLyricsModal } from './components/modals/lyrics/AddLyricsModal';
import { EditLyricsModal } from './components/modals/lyrics/EditLyricsModal';
import { PreviewLyricsModal } from './components/modals/lyrics/PreviewLyricsModal';
import { EditAlbumModal, type AlbumFormData } from './components/modals/album/EditAlbumModal';
import { EditArticleModalV2 } from './components/modals/article/EditArticleModalV2';
import { DashboardNavTabIcon } from './lib/dashboardNavTabIcon';
import { useDashboardRowFlash } from './lib/dashboardRowStateFlash';
import { SyncLyricsModal } from './components/modals/lyrics/SyncLyricsModal';
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
import { SocialLinksContent } from './components/social/SocialLinksContent';
import type { IAlbums, IArticles, IInterface, DashboardTrackVisibilityLabels } from '@models';
import {
  transformAlbumsToAlbumData,
  type AlbumData,
  type TrackData,
} from '@entities/album/lib/transformAlbumData';
import { useAvatar, getProfileAvatarInitials } from '@shared/lib/hooks/useAvatar';
import { useSiteArtistDisplayName } from '@shared/lib/hooks/useSiteArtistDisplayName';
import {
  type DashboardTab,
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
import {
  InlineEditDiscardDialog,
  getCloseDiscardConfirmLabels,
} from './components/shared/EditableCardField';
import type { SupportedLang } from '@shared/model/lang';
import './UserDashboard.style.scss';
import { normalizeTrackVisibility, type TrackVisibility } from '@shared/lib/tracks/trackVisibility';
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

/** URL segment under `/dashboard-new/:tab` — источник истины для активной вкладки. */
export type { DashboardTab } from '@shared/lib/accountType';

function dashboardHeadingForTab(tab: DashboardTab, ui: IInterface | null): string {
  const d = ui?.dashboard;
  switch (tab) {
    case 'settings':
      return d?.settings ?? 'Settings';
    case 'social-links':
      return d?.tabs?.socialLinks ?? d?.socialLinks?.title ?? 'Social Links';
    case 'albums':
      return d?.tabs?.albums ?? 'Albums';
    case 'posts':
      return d?.tabs?.posts ?? 'Articles';
    case 'mixer':
      return d?.tabs?.mixer ?? 'Mixer';
    case 'archive':
      return d?.archive?.title ?? d?.tabs?.archive ?? 'Your Collection';
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
  const { profileIsEmpty } = useOwnArtistPageSummary();
  const isArtistPagePublic = useMemo(
    () =>
      artistHasPublicPageContent({
        albums: albumsFromStore,
        articles: articlesFromStore,
        profileHasPublicBody: !profileIsEmpty,
      }),
    [albumsFromStore, articlesFromStore, profileIsEmpty]
  );
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
  const archiveTabEverVisitedRef = useRef(activeTab === 'archive');
  const [archiveContentReady, setArchiveContentReady] = useState(false);
  if (activeTab === 'archive') {
    archiveTabEverVisitedRef.current = true;
  }
  const handleArchiveContentReady = useCallback(() => {
    setArchiveContentReady(true);
  }, []);
  const handleArchiveContentBusy = useCallback(() => {
    setArchiveContentReady(false);
  }, []);

  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const { data: publicProfilePreview } = usePublicProfilePreview(userId, lang);
  const profilePublicSlug = publicProfilePreview.publicSlug;
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);
  const [scrollToAlbumUploadId, setScrollToAlbumUploadId] = useState<string | null>(null);
  const [publishingAlbumId, setPublishingAlbumId] = useState<string | null>(null);
  const [publishedToastTrigger, setPublishedToastTrigger] = useState(0);
  const [tracksUploadToastTrigger, setTracksUploadToastTrigger] = useState(0);
  const [albumDeletedToastTrigger, setAlbumDeletedToastTrigger] = useState(0);
  const [articleDeletedToastTrigger, setArticleDeletedToastTrigger] = useState(0);
  const [articleEditorToastTrigger, setArticleEditorToastTrigger] = useState(0);
  const [lyricsSyncSavedToastTrigger, setLyricsSyncSavedToastTrigger] = useState(0);
  const trackUploadSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [articleAccessMenuArticleId, setArticleAccessMenuArticleId] = useState<string | null>(null);
  const [albumAccessMenuAlbumId, setAlbumAccessMenuAlbumId] = useState<string | null>(null);
  const [albumsData, setAlbumsData] = useState<AlbumData[]>([]);
  const { flashes: dashboardRowFlashes, flashRow: flashDashboardRow } = useDashboardRowFlash();
  const catalogNeedsRefreshRef = useRef(false);
  const articlesNeedsRefreshRef = useRef(false);

  const markPublicCatalogDirty = useCallback(() => {
    catalogNeedsRefreshRef.current = true;
  }, []);

  const markPublicArticlesDirty = useCallback(() => {
    articlesNeedsRefreshRef.current = true;
  }, []);

  const resolvePublicArtistSlugForRefresh = useCallback((): string | null => {
    const fromBackground = backgroundLocation
      ? getArtistSlugFromLocation(backgroundLocation)
      : null;
    return fromBackground ?? profilePublicSlug?.trim() ?? null;
  }, [backgroundLocation, profilePublicSlug]);

  const refreshPublicCatalogNow = useCallback(
    (artistSlug: string | null) => {
      const slug = artistSlug?.trim();
      if (!slug) return;
      void dispatch(
        fetchAlbums({
          force: true,
          forcePublicCatalog: true,
          publicArtistSlug: slug,
        })
      );
    },
    [dispatch]
  );

  const refreshPublicArticlesNow = useCallback(
    (artistSlug: string | null) => {
      const slug = artistSlug?.trim();
      if (!slug) return;
      void dispatch(
        fetchArticles({
          force: true,
          forcePublicCatalog: true,
          publicArtistSlug: slug,
        })
      );
    },
    [dispatch]
  );

  const syncPublicArticlesAfterChange = useCallback(
    (options?: { refreshNow?: boolean; broadcast?: boolean }) => {
      if (options?.broadcast !== false && typeof window !== 'undefined') {
        window.dispatchEvent(new Event('artist:updated'));
      }
      markPublicArticlesDirty();
      if (options?.refreshNow !== false) {
        refreshPublicArticlesNow(resolvePublicArtistSlugForRefresh());
      }
    },
    [markPublicArticlesDirty, refreshPublicArticlesNow, resolvePublicArtistSlugForRefresh]
  );

  const handleArticlePersisted = useCallback(
    ({ published }: { published: boolean }) => {
      if (!published) return;
      syncPublicArticlesAfterChange();
    },
    [syncPublicArticlesAfterChange]
  );

  const handleArticleRemoved = useCallback(
    ({ wasPublished }: { wasPublished: boolean }) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('artist:updated'));
      }
      if (wasPublished) {
        markPublicArticlesDirty();
        refreshPublicArticlesNow(resolvePublicArtistSlugForRefresh());
      }
    },
    [markPublicArticlesDirty, refreshPublicArticlesNow, resolvePublicArtistSlugForRefresh]
  );

  const handleCatalogChanged = useCallback(
    ({ wasPubliclyVisible }: { wasPubliclyVisible: boolean }) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('artist:updated'));
      }
      if (wasPubliclyVisible) {
        markPublicCatalogDirty();
      }
    },
    [markPublicCatalogDirty]
  );

  const syncPublicSurfaceAfterDashboardClose = useCallback(
    (artistSlug: string | null) => {
      if (!artistSlug) return;

      const catalogDirty = catalogNeedsRefreshRef.current;
      const articlesDirty = articlesNeedsRefreshRef.current;
      if (!catalogDirty && !articlesDirty) return;

      catalogNeedsRefreshRef.current = false;
      articlesNeedsRefreshRef.current = false;

      // Не вызываем setPublicArtistSlug: при совпадении slug он no-op, при рассинхроне
      // сбрасывает catalog в idle/stale без loader re-run (surface уже смонтирована под модалкой).
      // Slug синхронизирует CurrentArtistSync из URL после navigate.
      if (catalogDirty) {
        void dispatch(
          fetchAlbums({
            force: true,
            forcePublicCatalog: true,
            publicArtistSlug: artistSlug,
          })
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('artist:updated'));
        }
      }
      if (articlesDirty) {
        void dispatch(
          fetchArticles({
            force: true,
            forcePublicCatalog: true,
            publicArtistSlug: artistSlug,
          })
        );
        if (!catalogDirty && typeof window !== 'undefined') {
          window.dispatchEvent(new Event('artist:updated'));
        }
      }
    },
    [dispatch]
  );

  const closeDashboard = useCallback(() => {
    const closeTarget = resolveDashboardModalCloseTarget({ backgroundLocation });
    if (!closeTarget) {
      navigate('/');
      return;
    }

    clearDashboardModalBackground();

    const backgroundArtistSlug = getArtistSlugFromLocation(closeTarget);
    const artistSlugForRefresh = backgroundArtistSlug ?? profilePublicSlug?.trim() ?? null;

    navigate(
      {
        pathname: closeTarget.pathname,
        search: closeTarget.search,
        hash: closeTarget.hash ?? '',
      },
      { replace: true }
    );

    syncPublicSurfaceAfterDashboardClose(artistSlugForRefresh);
  }, [backgroundLocation, navigate, profilePublicSlug, syncPublicSurfaceAfterDashboardClose]);
  const [editArticleModal, setEditArticleModal] = useState<{
    isOpen: boolean;
    article: IArticles | null;
  } | null>(null);
  const openNewArticleEditor = useCallback(() => {
    setEditArticleModal({ isOpen: true, article: createNewDraftArticle() });
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
  } | null>(null);

  const onAvatarFileTooLarge = useCallback((message: string) => {
    setAlertModal({
      isOpen: true,
      message,
      variant: 'warning',
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
    navigate({ pathname: '/', search: '' }, { replace: true });
  }, [navigate]);

  const handleAccountDeleted = useCallback(() => {
    setIsDeleteAccountModalOpen(false);
    setConfirmationModal(null);
    setAlertModal(null);
    setEditAlbumModal(null);
    setEditArticleModal(null);
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
        setEditAlbumModal({ isOpen: true });
      }
      consumed = true;
    }

    if (intent.openNewArticleModal) {
      if (emailVerified) {
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
    onAvatarFileTooLarge,
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

  // Загрузка альбомов: всегда force при смене аккаунта/языка,
  // чтобы не показывать данные предыдущего пользователя из Redux-кэша.
  // `routeScopeKey`: переход / → дашборд (или публичная страница → дашборд) с тем же userId/lang;
  // без него при /dashboard/.../albums → .../posts не дёргаем fetch — общий `albums` остаётся
  // спокойным для фоновой страницы под модалкой.
  const albumsRouteScopeKey = getAlbumsDashboardRouteScopeKey(location.pathname);
  useEffect(() => {
    if (!isArtist) return;

    dispatch(fetchAlbums({ force: true, ownerDashboard: true })).catch((error: any) => {
      // ConditionError - это нормально, condition отменил запрос
      if (error?.name === 'ConditionError') {
        return;
      }
      console.error('Error fetching albums:', error);
    });
  }, [dispatch, lang, userId, albumsRouteScopeKey, isArtist]);

  // Статьи для вкладки posts: всегда `force`, иначе после смены аккаунта `fetchArticles.condition`
  // держит `dashboard.status === 'succeeded'` и пропускает запрос со старыми данными в store.
  // (Подписка на сессию — `useAuthSessionUser`, иначе `userId` не обновляется до перезагрузки.)
  useEffect(() => {
    if (activeTab !== 'posts') {
      return;
    }

    dispatch(fetchArticles({ force: true, ownerDashboard: true })).catch((error: any) => {
      if (error?.name === 'ConditionError') {
        return;
      }
      console.error('Error fetching articles:', error);
    });
  }, [dispatch, lang, userId, activeTab]);

  // Преобразование данных из IAlbums[] в AlbumData[] и загрузка статусов треков
  useEffect(() => {
    if (!albumsFromStore || albumsFromStore.length === 0) {
      setAlbumsData([]);
      setIsLoadingTracks(false);
      return;
    }

    // Пока fetchAlbums в полёте, в store ещё предыдущий снимок; не пересобираем albumsData
    // (вкладка Albums — loader; миксер/модалки сохраняют последний валидный список).
    if (albumsStatus === 'loading') {
      return;
    }

    setIsLoadingTracks(true);
    const abortController = new AbortController();

    (async () => {
      try {
        // Преобразуем альбомы из Redux store в формат для UI
        const transformedAlbums = transformAlbumsToAlbumData(
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
        throw new Error((errorData as any)?.error || `HTTP error! status: ${response.status}`);
      }

      // Обновляем данные из БД для синхронизации
      await dispatch(fetchAlbums({ force: true, ownerDashboard: true })).unwrap();
      console.log('✅ Tracks reordered successfully');
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
        await performDeleteTrack(albumId, trackId);
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
        throw new Error((errorData as any)?.message || `HTTP error! status: ${response.status}`);
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

      console.log('✅ Track title updated successfully');
    } catch (error) {
      console.error('❌ Error updating track title:', error);
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message: `Ошибка при обновлении названия трека: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'error',
      });
      // Откатываем изменения в локальном состоянии
      await dispatch(fetchAlbums({ force: true, ownerDashboard: true })).unwrap();
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
    markPublicCatalogDirty();

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
        throw new Error((errorData as any)?.message || `HTTP error! status: ${response.status}`);
      }

      refreshPublicCatalogNow(resolvePublicArtistSlugForRefresh());
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
    markPublicCatalogDirty();

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

      refreshPublicCatalogNow(resolvePublicArtistSlugForRefresh());
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
    markPublicArticlesDirty();

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

      syncPublicArticlesAfterChange({ broadcast: false });
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

  const performDeleteTrack = async (albumId: string, trackId: string) => {
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
        throw new Error((errorData as any)?.error || `HTTP error! status: ${response.status}`);
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
        await dispatch(fetchAlbums({ force: true, ownerDashboard: true })).unwrap();
      } catch (refetchErr: unknown) {
        const name =
          refetchErr && typeof refetchErr === 'object' && 'name' in refetchErr
            ? (refetchErr as { name?: string }).name
            : undefined;
        if (name !== 'ConditionError') {
          console.warn('⚠️ [performDeleteTrack] fetchAlbums after delete:', refetchErr);
        }
      }

      handleCatalogChanged({ wasPubliclyVisible });

      console.log('✅ Track deleted successfully:', { albumId, trackId });
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

      await dispatch(fetchAlbums({ force: true, ownerDashboard: true })).unwrap();

      handleCatalogChanged({ wasPubliclyVisible: true });
      refreshPublicCatalogNow(resolvePublicArtistSlugForRefresh());
      queueAlbumPublishedToast();
      setPublishedToastTrigger((value) => value + 1);
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
        throw new Error((errorData as any)?.error || `HTTP error! status: ${response.status}`);
      }

      // Обновляем Redux store
      dispatch(removeArticleFromPublicCatalog({ articleId: article.articleId }));
      await dispatch(fetchArticles({ force: true, ownerDashboard: true })).unwrap();

      handleArticleRemoved({ wasPublished });

      queueArticleDeletedToast(formatArticleDeletedSuccessMessage(article.nameArticle, ui));
      setArticleDeletedToastTrigger((value) => value + 1);
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
        throw new Error((errorData as any)?.error || `HTTP error! status: ${response.status}`);
      }

      // Обновляем Redux store
      await dispatch(fetchAlbums({ force: true, ownerDashboard: true })).unwrap();

      // Удаляем альбом из локального состояния
      setAlbumsData((prev) => prev.filter((a) => a.id !== albumId));

      // Закрываем расширенный вид, если удаленный альбом был открыт
      if (expandedAlbumId === albumId) {
        setExpandedAlbumId(null);
      }

      handleCatalogChanged({ wasPubliclyVisible: shouldSyncPublicCatalog });

      queueAlbumDeletedToast(formatAlbumDeletedSuccessMessage(deletedAlbumTitle, ui));
      setAlbumDeletedToastTrigger((n) => n + 1);

      console.log('✅ Album deleted successfully:', albumId);
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
  const handleTrackUpload = async (albumId: string, files: FileList) => {
    if (!emailVerified) return;
    if (isUploadingTracks[albumId]) {
      return;
    }

    setIsUploadingTracks((prev) => ({ ...prev, [albumId]: true }));
    setUploadProgress((prev) => ({ ...prev, [albumId]: 0 }));

    try {
      // Находим альбом в albumsFromStore для получения данных
      const albumFromStore = albumsFromStore.find((a) => a.albumId === albumId);
      if (!albumFromStore) {
        throw new Error('Album not found');
      }

      // Загружаем файлы и подготавливаем метаданные для каждого трека
      const tracksData: TrackUploadData[] = [];
      const uploadErrors: string[] = [];
      const fileArray = Array.from(files);

      // Стабильный track_id (UUID): не зависит от порядка/дыр в нумерации; привязка lyrics/метаданных не «съезжает».
      const newStableTrackId = (): string => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID();
        }
        return `tr-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
      };

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const trackId = newStableTrackId();

        // Обновляем прогресс: загрузка файла (0-80% для всех файлов)
        const fileProgressStart = (i / fileArray.length) * 80;
        const fileProgressEnd = ((i + 1) / fileArray.length) * 80;
        setUploadProgress((prev) => ({ ...prev, [albumId]: fileProgressStart }));

        try {
          const trackData = await prepareAndUploadTrack(file, albumId, trackId, { lang });
          tracksData.push(trackData);

          // Обновляем прогресс после успешной загрузки файла
          setUploadProgress((prev) => ({ ...prev, [albumId]: fileProgressEnd }));
        } catch (error) {
          console.error(`❌ [handleTrackUpload] Error uploading track ${trackId}:`, error);
          const msg =
            error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown';
          uploadErrors.push(`${file.name}: ${msg}`);
          // Продолжаем загрузку остальных треков, но не обновляем прогресс при ошибке
        }
      }

      // Обновляем прогресс: сохранение метаданных в БД (80-100%)
      setUploadProgress((prev) => ({ ...prev, [albumId]: 90 }));

      if (tracksData.length === 0) {
        const detail = uploadErrors.length > 0 ? ` ${uploadErrors.join(' | ')}` : '';
        throw new Error(`Failed to upload any tracks.${detail}`);
      }

      // Загружаем треки
      const result = await uploadTracks(albumId, lang, tracksData);

      if (result.success && result.data) {
        const fromResponse = Array.isArray(result.data) ? result.data.length : 0;
        const uploadedCount = fromResponse > 0 ? fromResponse : tracksData.length;

        // Обновляем прогресс: завершение (100%)
        setUploadProgress((prev) => ({ ...prev, [albumId]: 100 }));

        // Оптимистичное обновление: сразу добавляем новые треки в локальное состояние
        setAlbumsData((prevAlbums) => {
          return prevAlbums.map((album) => {
            if (album.albumId === albumId || album.id === albumId) {
              const maxOrder = album.tracks.reduce((m, t) => Math.max(m, t.order_index ?? 0), 0);
              // Оптимистично: тот же шаг, что на сервере (max + 10, +20, …)
              const newTracks: TrackData[] = tracksData.map((trackData, i) => ({
                id: trackData.trackId,
                title: trackData.translations[lang]?.title ?? '',
                order_index: maxOrder + TRACK_ORDER_INDEX_STEP * (i + 1),
                duration: `${Math.floor(trackData.duration / 60)}:${Math.floor(
                  trackData.duration % 60
                )
                  .toString()
                  .padStart(2, '0')}`,
                lyrics: {
                  albumId,
                  trackId: trackData.trackId,
                  lang,
                  content: '',
                  syncedLines: null,
                  state: 'empty' as const,
                  syncedAt: null,
                },
              }));

              return {
                ...album,
                tracks: [...album.tracks, ...newTracks],
              };
            }
            return album;
          });
        });

        // Обновляем список альбомов из БД для синхронизации
        // useEffect автоматически обновит albumsData когда albumsFromStore изменится
        try {
          // Небольшая задержка для гарантии обновления БД
          await new Promise((resolve) => setTimeout(resolve, 300));
          await dispatch(fetchAlbums({ force: true, ownerDashboard: true })).unwrap();
          console.log('✅ [handleTrackUpload] Albums refreshed from database');
        } catch (fetchError: any) {
          // ConditionError - это нормально, condition отменил запрос
          if (fetchError?.name !== 'ConditionError') {
            console.error('⚠️ Failed to refresh albums:', fetchError);
          }
        }

        queueTracksUploadedToast(formatUploadedTracksSuccessMessage(uploadedCount, lang, ui));
        setTracksUploadToastTrigger((n) => n + 1);
      } else {
        throw new Error(result.error || 'Failed to upload tracks');
      }
    } catch (error) {
      console.error('❌ Error uploading tracks:', error);
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message: `Error uploading tracks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'error',
      });
    } finally {
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

  if (tabFromRoute === 'profile') {
    return <Navigate to="/dashboard-new/settings" replace state={location.state} />;
  }

  if (tabInvalid || tabDisallowed) {
    return (
      <Navigate
        to={`/dashboard-new/${getDefaultDashboardTab(user)}`}
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

  const dashboardHeading = dashboardHeadingForTab(activeTab, ui);

  return (
    <ArtistMonetizationProvider>
      <>
        <Helmet>
          <title>{dashboardHeading} — Смоляное Чучелко</title>
        </Helmet>

        <Popup isActive={true} onClose={closeDashboard}>
          <AlbumPublishedToast triggerKey={publishedToastTrigger} />
          <AlbumCreatedToast triggerKey={editAlbumModal} />
          <TracksUploadedToast triggerKey={tracksUploadToastTrigger} />
          <AlbumDeletedToast triggerKey={albumDeletedToastTrigger} />
          <ArticleDeletedToast triggerKey={articleDeletedToastTrigger} />
          <ArticleEditorToast triggerKey={articleEditorToastTrigger} />
          <LyricsSyncSavedToast triggerKey={lyricsSyncSavedToastTrigger} />
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
                      onClick={() => goDashboard(`/dashboard-new/${tab}`)}
                    >
                      <DashboardNavTabIcon tab={tab} />
                      {dashboardHeadingForTab(tab, ui)}
                    </button>
                  ))}
                </nav>

                {/* Content area: стабильная оболочка; вкладки скрыты через hidden, не размонтируются */}
                <div className="user-dashboard__content user-dashboard__tab-shell">
                  {albumsInitialLoading &&
                  !albumsLoadFailed &&
                  activeTab === 'albums' &&
                  emailVerified ? (
                    <DashboardLoadingState className="user-dashboard__tab-loading" />
                  ) : albumsLoadFailed ? (
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
                      {isArtist ? (
                        <div
                          className="user-dashboard__tab-panel"
                          hidden={activeTab !== 'payment-settings'}
                          aria-hidden={activeTab !== 'payment-settings'}
                        >
                          {!emailVerified ? (
                            <EmailVerificationOnboarding context="payment-settings" />
                          ) : user?.id ? (
                            <PaymentSettings userId={user.id} />
                          ) : (
                            <p className="user-dashboard__tab-placeholder">
                              {ui?.dashboard?.errorLoading ?? 'Error loading'}
                            </p>
                          )}
                        </div>
                      ) : null}
                      <div
                        className="user-dashboard__tab-panel"
                        hidden={activeTab !== 'my-purchases'}
                        aria-hidden={activeTab !== 'my-purchases'}
                      >
                        <MyPurchasesContent />
                      </div>
                      {isArtist ? (
                        <div
                          className="user-dashboard__tab-panel"
                          hidden={activeTab !== 'social-links'}
                          aria-hidden={activeTab !== 'social-links'}
                        >
                          <SocialLinksContent active={activeTab === 'social-links'} />
                        </div>
                      ) : null}
                      {isArtist ? (
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
                            <MixerEmptyState
                              ui={ui}
                              onCreateAlbum={() => setEditAlbumModal({ isOpen: true })}
                            />
                          ) : (
                            <MixerAdmin
                              ui={ui || undefined}
                              userId={user?.id || undefined}
                              albums={albumsData}
                              tabActive={activeTab === 'mixer'}
                            />
                          )}
                        </div>
                      ) : null}
                      <div
                        className="user-dashboard__tab-panel user-dashboard__tab-panel--archive"
                        hidden={activeTab !== 'archive'}
                        aria-hidden={activeTab !== 'archive'}
                      >
                        {activeTab === 'archive' && !archiveContentReady ? (
                          <DashboardLoadingState className="user-dashboard__tab-loading" />
                        ) : null}
                        {archiveTabEverVisitedRef.current ? (
                          <div
                            className={clsx(
                              'user-dashboard__archive-content',
                              !archiveContentReady && 'user-dashboard__archive-content--pending'
                            )}
                          >
                            <MyArchiveContent
                              active={activeTab === 'archive'}
                              onContentReady={handleArchiveContentReady}
                              onContentBusy={handleArchiveContentBusy}
                            />
                          </div>
                        ) : null}
                      </div>
                      {isArtist ? (
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
                            onCreateAlbum={() => setEditAlbumModal({ isOpen: true })}
                            onEditAlbum={(albumId) => setEditAlbumModal({ isOpen: true, albumId })}
                            onToggleAlbum={toggleAlbum}
                            onAlbumAccessMenuChange={setAlbumAccessMenuAlbumId}
                            onAlbumVisibilityChange={(albumId, visibility) =>
                              void handleAlbumVisibilityChange(albumId, visibility)
                            }
                            onTrackUpload={handleTrackUpload}
                            onDragEnd={handleDragEnd}
                            onDeleteTrack={handleDeleteTrack}
                            onTrackTitleChange={handleTrackTitleChange}
                            onTrackVisibilityChange={handleTrackVisibilityChange}
                            onDeleteAlbum={handleDeleteAlbum}
                            onPublishAlbum={handlePublishAlbum}
                            onLyricsAction={handleLyricsAction}
                          />
                        </div>
                      ) : null}
                      {isArtist ? (
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
                            onEditArticle={(article) =>
                              setEditArticleModal({ isOpen: true, article })
                            }
                            onDeleteArticle={handleDeleteArticle}
                            onCreateArticle={openNewArticleEditor}
                          />
                        </div>
                      ) : null}
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
                                profilePublicSlug={profilePublicSlug ?? ''}
                                onOpenArtistPage={() => {
                                  if (!profilePublicSlug) return;
                                  openOwnArtistPage(
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
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Popup>

        {/* Add Lyrics Modal */}
        {addLyricsModal && (
          <AddLyricsModal
            isOpen={addLyricsModal.isOpen}
            trackTitle={addLyricsModal.trackTitle}
            onClose={() => setAddLyricsModal(null)}
            onSave={handleAddLyrics}
          />
        )}

        {/* Edit Lyrics Modal */}
        {editLyricsModal && (
          <EditLyricsModal
            isOpen={editLyricsModal.isOpen}
            initialLyrics={
              editLyricsModal.initialLyrics ??
              getTrackLyricsText(editLyricsModal.albumId, editLyricsModal.trackId)
            }
            initialAuthorship={
              editLyricsModal.initialAuthorship ||
              getTrackAuthorship(editLyricsModal.albumId, editLyricsModal.trackId)
            }
            onClose={() => setEditLyricsModal(null)}
            onSave={handleSaveLyrics}
          />
        )}

        {/* Preview Lyrics Modal */}
        {previewLyricsModal && (
          <PreviewLyricsModal
            isOpen={previewLyricsModal.isOpen}
            lyrics={previewLyricsModal.lyrics}
            trackSrc={previewLyricsModal.trackSrc}
            mediaOwnerUserId={previewLyricsModal.mediaOwnerUserId}
            onClose={() => setPreviewLyricsModal(null)}
          />
        )}

        {/* Sync Lyrics Modal */}
        {syncLyricsModal && (
          <SyncLyricsModal
            isOpen={syncLyricsModal.isOpen}
            albumId={syncLyricsModal.albumId}
            trackId={syncLyricsModal.trackId}
            trackTitle={syncLyricsModal.trackTitle}
            trackSrc={syncLyricsModal.trackSrc}
            mediaOwnerUserId={syncLyricsModal.mediaOwnerUserId}
            trackDurationSeconds={syncLyricsModal.trackDurationSeconds}
            initialLyricsText={syncLyricsModal.lyricsText}
            authorship={syncLyricsModal.authorship}
            onClose={() => setSyncLyricsModal(null)}
            onSave={(bundle) => {
              dispatch(applyTrackLyricsBundle(bundle));
            }}
            onSyncSaved={() => {
              queueLyricsSyncSavedToast();
              setLyricsSyncSavedToastTrigger((value) => value + 1);
            }}
          />
        )}

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

        {/* Edit Album Modal */}
        {editAlbumModal && (
          <EditAlbumModal
            key={editAlbumModal.albumId ?? 'new-album'}
            isOpen={editAlbumModal.isOpen}
            albumId={editAlbumModal.albumId}
            onClose={() => setEditAlbumModal(null)}
            onNext={async (formData, updatedAlbum, meta) => {
              if (!editAlbumModal) {
                setEditAlbumModal(null);
                return;
              }

              const searchAlbumId = updatedAlbum?.albumId || editAlbumModal.albumId;

              // Обновляем Redux store из БД
              try {
                console.log('🔄 [UserDashboard] Fetching albums after save...', {
                  originalAlbumId: editAlbumModal.albumId,
                  updatedAlbumId: updatedAlbum?.albumId,
                  isNewAlbum: !editAlbumModal.albumId,
                });
                const fetchPayload = await dispatch(
                  fetchAlbums({ force: true, ownerDashboard: true })
                ).unwrap();
                const result = fetchPayload.albums;
                console.log('✅ [UserDashboard] Albums fetched:', {
                  count: result?.length || 0,
                  albumIds: result?.map((a: IAlbums) => a.albumId) || [],
                });

                // Проверяем, что обновленный альбом действительно пришел с новыми данными
                // Для новых альбомов используем albumId из updatedAlbum, для существующих - из editAlbumModal
                if (result && result.length > 0 && searchAlbumId) {
                  const foundAlbum = result.find((a: IAlbums) => a.albumId === searchAlbumId);
                  if (foundAlbum) {
                    console.log('🔍 [UserDashboard] Updated album from fetchAlbums:', {
                      albumId: foundAlbum.albumId,
                      album: foundAlbum.album,
                      artist: foundAlbum.artist,
                      description: foundAlbum.description?.substring(0, 50) || '',
                      cover: foundAlbum.cover,
                      isNewAlbum: !editAlbumModal.albumId,
                    });
                  } else {
                    console.warn(
                      '⚠️ [UserDashboard] Updated album not found in fetchAlbums result:',
                      {
                        searchedAlbumId: searchAlbumId,
                        availableIds: result.map((a: IAlbums) => a.albumId),
                        isNewAlbum: !editAlbumModal.albumId,
                      }
                    );
                  }
                }

                // Небольшая задержка для гарантии обновления Redux store
                await new Promise((resolve) => setTimeout(resolve, 300));

                // Принудительно обновляем albumsData из результата fetchAlbums
                if (result && result.length > 0) {
                  console.log('🔄 [UserDashboard] Updating albumsData from fetchAlbums result...');

                  const transformedAlbums = transformAlbumsToAlbumData(
                    result,
                    siteArtistDisplayName,
                    lang
                  );

                  setAlbumsData(withDashboardAlbumOwner(transformedAlbums, userId));
                  console.log('✅ [UserDashboard] albumsData updated:', {
                    count: transformedAlbums.length,
                    albumIds: transformedAlbums.map((a) => a.id),
                  });
                }

                // Закрываем модальное окно после обновления
                // Небольшая задержка для гарантии обновления UI
                await new Promise((resolve) => setTimeout(resolve, 200));
                setEditAlbumModal(null);

                if (meta?.createdNewAlbum && searchAlbumId) {
                  if (activeTab !== 'albums') {
                    goDashboard('/dashboard-new/albums');
                  }
                  setExpandedAlbumId(searchAlbumId);
                  setScrollToAlbumUploadId(searchAlbumId);
                }
              } catch (error: any) {
                // ConditionError - это нормально, condition отменил запрос
                if (error?.name === 'ConditionError') {
                  setEditAlbumModal(null);
                  return;
                }
                setEditAlbumModal(null);
              }
            }}
          />
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
          />
        )}

        {/* Edit Article Modal */}
        {editArticleModal && editArticleModal.article && (
          <EditArticleModalV2
            isOpen={editArticleModal.isOpen}
            article={editArticleModal.article}
            onClose={() => setEditArticleModal(null)}
            publicArtistSlug={profilePublicSlug}
            onArticleEditorToast={() => setArticleEditorToastTrigger((value) => value + 1)}
            onArticlePersisted={handleArticlePersisted}
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
      </>
    </ArtistMonetizationProvider>
  );
}

export default UserDashboard;
