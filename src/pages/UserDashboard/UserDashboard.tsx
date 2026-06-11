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
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getAlbumsDashboardRouteScopeKey } from '@shared/lib/albumsRouteScope';
import { formatDate } from '@shared/api/albums';
import { toLocalYYYYMMDD } from '@shared/lib/dateCalendar';
import { Popup } from '@shared/ui/popup';
import { ConfirmationModal } from '@shared/ui/confirmationModal';
import { AlertModal } from '@shared/ui/alertModal';
import { SubscriberContentLockIcon } from '@shared/ui/icons/SubscriberContentLockIcon';
import {
  isAuthenticated,
  getToken,
  isEmailVerified,
  clearAuth,
  getAuthHeader,
} from '@shared/lib/auth';
import { clearAccountDeletedSkipReturn } from '@shared/lib/accountDeletedSession';
import { clearDashboardModalBackground } from '@shared/lib/dashboardModalBackground';
import { readDashboardOpenIntent, stripDashboardOpenIntent } from '@shared/lib/dashboardOpenIntent';
import { EmailVerificationOnboarding } from '@shared/lib/emailVerification';
import { AlbumPublishedToast } from '@shared/ui/albumPublishedToast/AlbumPublishedToast';
import { AlbumCreatedToast } from '@shared/ui/albumCreatedToast/AlbumCreatedToast';
import { TracksUploadedToast } from '@shared/ui/tracksUploadedToast/TracksUploadedToast';
import { AlbumDeletedToast } from '@shared/ui/albumDeletedToast/AlbumDeletedToast';
import { ArticleEditorToast } from '@shared/ui/articleEditorToast';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { buildApiUrl } from '@shared/lib/artistQuery';
import { hasPublishedPublicReleases } from '@entities/album/lib/hasPublishedPublicReleases';
import {
  isAlbumReadyToPublish,
  getAlbumPublishHintKey,
} from '@entities/album/lib/isAlbumReadyToPublish';
import { isAlbumPublished } from '@entities/album/lib/albumPublication';
import { getAlbumLifecycleStatus } from '@entities/album/lib/albumLifecycleStatus';
import { AlbumLifecycleBadge } from './components/albums/AlbumLifecycleBadge';
import { AlbumsEmptyState } from './components/albums/AlbumsEmptyState';
import { ArticlesEmptyState } from './components/articles/ArticlesEmptyState';
import { queueAlbumPublishedToast } from '@shared/lib/albumPublishedToast';
import { queueTracksUploadedToast } from '@shared/lib/tracksUploadedToast';
import { queueAlbumDeletedToast } from '@shared/lib/albumDeletedToast';
import { getArtistSlugFromLocation } from '@shared/lib/albumDeletedRedirect';
import { openOwnArtistPage } from '@shared/lib/ownArtistPage';
import { setPublicArtistSlug } from '@shared/model/currentArtist';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import {
  fetchAlbums,
  selectDashboardAlbumsStatus,
  selectDashboardAlbumsData,
  selectDashboardAlbumsError,
  AlbumCoverImage,
} from '@entities/album';
import {
  fetchArticles,
  patchDashboardArticleVisibility,
  selectDashboardArticlesStatus,
  selectDashboardArticlesError,
  selectDashboardArticlesDataResolved,
  ArticleCoverImage,
  ArticleCoverPlaceholder,
} from '@entities/article';
import { loadTrackTextFromDatabase, saveTrackText } from '@entities/track/lib';
import { uploadFile } from '@shared/api/storage';
import { sanitizeFileName } from '@shared/lib/sanitizeFileName';
import { uniqueUploadFileSuffix } from '@shared/lib/uniqueUploadFileSuffix';
import { loadAuthorshipFromStorage, loadSyncedLyricsFromStorage } from '@features/syncedLyrics/lib';
import { uploadTracks, prepareAndUploadTrack, type TrackUploadData } from '@shared/api/tracks';
import { TRACK_ORDER_INDEX_STEP } from '@shared/lib/tracks/trackOrderIndex';
import { AddLyricsModal } from './components/modals/lyrics/AddLyricsModal';
import { EditLyricsModal } from './components/modals/lyrics/EditLyricsModal';
import { PreviewLyricsModal } from './components/modals/lyrics/PreviewLyricsModal';
import { EditAlbumModal, type AlbumFormData } from './components/modals/album/EditAlbumModal';
import { EditArticleModalV2 } from './components/modals/article/EditArticleModalV2';
import { ArticlesListSkeleton } from './components/articles/ArticlesListSkeleton';
import { ArticleAccessControl } from './components/articles/ArticleAccessControl';
import { DashboardNavTabIcon } from './lib/dashboardNavTabIcon';
import { DashboardExpandChevron } from './lib/dashboardExpandChevron';
import { DashboardTabContentSkeleton } from './components/DashboardTabContentSkeleton';
import { ProfileTabSkeleton } from './components/ProfileTabSkeleton';
import { SyncLyricsModal } from './components/modals/lyrics/SyncLyricsModal';
import { ProfileSettingsModal } from './components/modals/profile/ProfileSettingsModal';
import { UpgradeToArtistModal } from './components/modals/profile/UpgradeToArtistModal';
import {
  DeleteAccountModal,
  type DeleteAccountModalCopy,
} from './components/modals/profile/DeleteAccountModal';
import { PaymentSettings } from '@features/paymentSettings/ui/PaymentSettings';
import { MyPurchasesContent } from './components/purchases/MyPurchasesContent';
import { MixerAdmin } from './components/mixer/MixerAdmin';
import { MixerEmptyState } from './components/mixer/MixerEmptyState';
import { MyArchiveContent } from './components/archive/MyArchiveContent';
import { SocialLinksContent } from './components/social/SocialLinksContent';
import { ProfileEmailVerificationStatus } from './components/ProfileEmailVerificationStatus';
import type { IAlbums, IArticles, IInterface, DashboardTrackVisibilityLabels } from '@models';
import { getCachedAuthorship, setCachedAuthorship } from '@shared/lib/utils/authorshipCache';
import {
  transformAlbumsToAlbumData,
  type AlbumData,
  type TrackData,
} from '@entities/album/lib/transformAlbumData';
import { useAvatar, getProfileAvatarInitials } from '@shared/lib/hooks/useAvatar';
import { isProfileAvatarPlaceholderUrl } from '@shared/lib/avatarUpload';
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
import { createPortal } from 'react-dom';
import {
  TRACK_VISIBILITY_OPTIONS,
  normalizeTrackVisibility,
  type TrackVisibility,
} from '@shared/lib/tracks/trackVisibility';
import { TrackVisibilityIcon } from '@shared/ui/icons/TrackVisibilityIcon';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  ExternalLink as ExternalLinkIcon,
  Pencil as PencilIcon,
  Trash2 as Trash2Icon,
} from 'lucide-react';

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
  lang: SupportedLang,
  ui: IInterface | null | undefined
): string {
  const title = albumTitle?.trim();
  if (title) {
    const template =
      ui?.dashboard?.albumDeletedSuccessToastWithTitle ??
      (lang === 'ru' ? 'Альбом "{name}" удалён' : 'Album "{name}" deleted');
    return template.replace('{name}', title);
  }
  return (
    ui?.dashboard?.albumDeletedSuccessToast ?? (lang === 'ru' ? 'Альбом удалён' : 'Album deleted')
  );
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

// Компонент для сортируемого трека
interface SortableTrackItemProps {
  track: TrackData;
  /** Порядковый номер для UI (1-based), не путать с track.id (UUID) */
  displayIndex: number;
  albumId: string;
  onDelete: (albumId: string, trackId: string, trackTitle: string) => void;
  onEdit?: (albumId: string, trackId: string, trackTitle: string) => void;
  onTitleChange?: (albumId: string, trackId: string, newTitle: string) => Promise<void>;
  onVisibilityChange: (
    albumId: string,
    trackId: string,
    visibility: TrackVisibility
  ) => Promise<void>;
  ui?: IInterface;
}

type DashboardUi = NonNullable<IInterface['dashboard']>;
/** Расширение для полей кабинета, которые могут отсутствовать в устаревших копиях `IInterface`. */
type DashboardUiWithTrackAccess = DashboardUi & {
  trackVisibility?: DashboardTrackVisibilityLabels;
  trackAccessAriaLabel?: string;
};

// Функция для извлечения первых двух строк текста из блоков статьи
function getArticlePreviewText(article: IArticles): string {
  if (!article.details || !Array.isArray(article.details)) {
    return '';
  }

  const textParts: string[] = [];

  for (const block of article.details) {
    if (!block) continue;

    const blockType = (block as any).type;

    // Старый формат: type: 'text' с content
    if (blockType === 'text') {
      const content = (block as any).content;

      // Добавляем content
      if (typeof content === 'string' && content.trim()) {
        textParts.push(content.trim());
      } else if (Array.isArray(content)) {
        const textStr = content.filter((item) => typeof item === 'string' && item.trim()).join(' ');
        if (textStr) {
          textParts.push(textStr);
        }
      }
    }
    // Новый формат: type: 'paragraph', 'quote'
    else if (blockType === 'paragraph' || blockType === 'quote') {
      const text = (block as any).text;
      if (typeof text === 'string' && text.trim()) {
        // Убираем markdown разметку для превью
        const cleanText = text
          .replace(/\*\*(.*?)\*\*/g, '$1') // Убираем **bold**
          .replace(/~~(.*?)~~/g, '$1') // Убираем ~~strikethrough~~
          .replace(/_(.*?)_/g, '$1') // Убираем _italic_
          .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Убираем [link](url)
          .trim();
        if (cleanText) {
          textParts.push(cleanText);
        }
      }
    }
    // Списки
    else if (blockType === 'list') {
      const items = (block as any).items;
      if (Array.isArray(items)) {
        const listText = items.filter((item) => typeof item === 'string' && item.trim()).join(' ');
        if (listText) {
          textParts.push(listText);
        }
      }
    }

    // Если уже набрали достаточно текста (примерно 2 строки = 150-200 символов)
    const combinedText = textParts.join(' ');
    if (combinedText.length >= 150) {
      break;
    }
  }

  const fullText = textParts.join(' ');

  if (!fullText) {
    return '';
  }

  // Берем первые ~150 символов или до конца, если меньше
  let preview = fullText.substring(0, 150);

  // Обрезаем по последнему пробелу, чтобы не обрезать слово
  const lastSpace = preview.lastIndexOf(' ');
  if (lastSpace > 100 && fullText.length > 150) {
    preview = preview.substring(0, lastSpace);
  }

  // Добавляем троеточие, если текст был обрезан
  if (fullText.length > preview.length) {
    preview += '...';
  }

  return preview;
}

function SortableTrackItem({
  track,
  displayIndex,
  albumId,
  onDelete,
  onEdit,
  onTitleChange,
  onVisibilityChange,
  ui,
}: SortableTrackItemProps) {
  const { lang } = useLang();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(track.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [accessMenuOpen, setAccessMenuOpen] = useState(false);
  const accessBtnRef = useRef<HTMLButtonElement>(null);
  const accessMenuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const trackVisibility = normalizeTrackVisibility(track.visibility);

  const trackVisibilityMenuOptions = useMemo(() => {
    const d = ui?.dashboard as DashboardUiWithTrackAccess | undefined;
    const t = d?.trackVisibility;
    const en = lang === 'en';
    const fallbacks = {
      public: {
        title: en ? 'Open to everyone' : 'Открыт для всех',
        description: en ? 'Track is available to all visitors' : 'Трек доступен всем посетителям',
      },
      subscribersOnly: {
        title: en ? 'Subscribers only' : 'Только для подписчиков',
        description: en
          ? 'Playback after purchasing the album'
          : 'Воспроизведение после покупки альбома',
      },
      hidden: {
        title: en ? 'Hidden' : 'Скрыт',
        description: en
          ? 'Not shown in the tracklist on the site'
          : 'Не отображается в треклисте на сайте',
      },
    } as const;

    return TRACK_VISIBILITY_OPTIONS.map((opt) => {
      const block =
        opt.value === 'public'
          ? t?.public
          : opt.value === 'hidden'
            ? t?.hidden
            : t?.subscribersOnly;
      const fb =
        opt.value === 'public'
          ? fallbacks.public
          : opt.value === 'hidden'
            ? fallbacks.hidden
            : fallbacks.subscribersOnly;
      return {
        value: opt.value,
        label: block?.title ?? fb.title,
        description: block?.description ?? fb.description,
      };
    });
  }, [lang, ui?.dashboard]);

  const trackAccessAria =
    (ui?.dashboard as DashboardUiWithTrackAccess | undefined)?.trackAccessAriaLabel ??
    (lang === 'en' ? 'Track access' : 'Доступ к треку');

  // Синхронизируем editedTitle с track.title при изменении track
  useEffect(() => {
    if (!isEditing) {
      setEditedTitle(track.title);
    }
  }, [track.title, isEditing]);

  const handleEdit = useCallback(
    (e: React.MouseEvent | React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setEditedTitle(track.title);
      setIsEditing(true);
    },
    [track.title]
  );

  // Фокус на input при открытии редактирования
  useEffect(() => {
    if (isEditing && inputRef.current) {
      // Используем setTimeout для гарантии, что DOM обновлен
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isEditing]);

  const handleTitleBlur = async () => {
    if (editedTitle.trim() !== track.title && editedTitle.trim() !== '' && onTitleChange) {
      // Сохраняем изменения
      await onTitleChange(albumId, track.id, editedTitle.trim());
    } else if (editedTitle.trim() === '') {
      // Если поле пустое, возвращаем исходное значение
      setEditedTitle(track.title);
    }
    setIsEditing(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setEditedTitle(track.title);
      setIsEditing(false);
    }
  };

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(albumId, track.id, track.title);
    },
    [albumId, track.id, track.title, onDelete]
  );

  const updateAccessMenuPosition = useCallback(() => {
    const el = accessBtnRef.current;
    if (!el || !accessMenuOpen) return;
    const r = el.getBoundingClientRect();
    const menuWidth = 268;
    setMenuPos({
      top: r.bottom + 4,
      left: Math.min(r.left, window.innerWidth - menuWidth - 8),
    });
  }, [accessMenuOpen]);

  const closeAccessMenu = useCallback(() => {
    setAccessMenuOpen(false);
    setMenuPos(null);
  }, []);

  useLayoutEffect(() => {
    if (!accessMenuOpen) return;
    updateAccessMenuPosition();
  }, [accessMenuOpen, updateAccessMenuPosition]);

  useEffect(() => {
    if (!accessMenuOpen) return;
    window.addEventListener('scroll', updateAccessMenuPosition, true);
    window.addEventListener('resize', updateAccessMenuPosition);
    return () => {
      window.removeEventListener('scroll', updateAccessMenuPosition, true);
      window.removeEventListener('resize', updateAccessMenuPosition);
    };
  }, [accessMenuOpen, updateAccessMenuPosition]);

  useEffect(() => {
    if (!accessMenuOpen) return;
    let detached: (() => void) | null = null;
    let cancelled = false;

    const scheduleId = window.setTimeout(() => {
      if (cancelled) return;
      const onDown = (e: MouseEvent | TouchEvent) => {
        const target = e.target as Node;
        if (accessBtnRef.current?.contains(target)) return;
        if (accessMenuRef.current?.contains(target)) return;
        closeAccessMenu();
      };
      document.addEventListener('mousedown', onDown);
      document.addEventListener('touchstart', onDown);
      detached = () => {
        document.removeEventListener('mousedown', onDown);
        document.removeEventListener('touchstart', onDown);
      };
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(scheduleId);
      detached?.();
    };
  }, [accessMenuOpen, closeAccessMenu]);

  useEffect(() => {
    if (!accessMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAccessMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [accessMenuOpen, closeAccessMenu]);

  const toggleAccessMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    setAccessMenuOpen((wasOpen) => {
      if (wasOpen) {
        setMenuPos(null);
        return false;
      }
      const el = accessBtnRef.current;
      const menuWidth = 268;
      const pos =
        el != null
          ? {
              top: el.getBoundingClientRect().bottom + 4,
              left: Math.min(el.getBoundingClientRect().left, window.innerWidth - menuWidth - 8),
            }
          : { top: 120, left: 24 };
      setMenuPos(pos);
      return true;
    });
  }, []);

  const pickVisibility = useCallback(
    async (v: TrackVisibility) => {
      if (v === trackVisibility) {
        closeAccessMenu();
        return;
      }
      await onVisibilityChange(albumId, track.id, v);
      closeAccessMenu();
    },
    [albumId, track.id, trackVisibility, onVisibilityChange, closeAccessMenu]
  );

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Объединяем refs для setNodeRef и containerRef
  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      // Используем type assertion для обновления ref
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [setNodeRef]
  );

  let trackAccessPortalMount: HTMLElement | null = null;
  if (typeof document !== 'undefined') {
    trackAccessPortalMount =
      (containerRef.current?.closest?.('dialog.popup') as HTMLElement | null) ??
      (containerRef.current?.closest?.('dialog') as HTMLElement | null) ??
      document.body;
  }

  return (
    <>
      <div
        ref={combinedRef}
        style={style}
        className={clsx('user-dashboard__track-item-wrapper', {
          'user-dashboard__track-item-wrapper--dragging': isDragging,
        })}
      >
        <div className="user-dashboard__track-item-content">
          <div
            className={clsx('user-dashboard__track-item', {
              'user-dashboard__track-item--dragging': isDragging,
              'user-dashboard__track-item--access-menu-open': accessMenuOpen,
            })}
          >
            <div className="user-dashboard__track-cell user-dashboard__track-cell--track">
              <div
                {...attributes}
                {...listeners}
                className="user-dashboard__track-drag-handle"
                title={ui?.dashboard?.dragToReorder ?? 'Drag to reorder'}
                aria-label={ui?.dashboard?.dragToReorder ?? 'Drag to reorder'}
              >
                <span className="user-dashboard__track-drag-icon">⋮⋮</span>
              </div>
              <div className="user-dashboard__track-number" aria-hidden>
                {displayIndex}.
              </div>
              {isEditing ? (
                <input
                  key={`edit-${track.id}-${isEditing}`}
                  ref={inputRef}
                  type="text"
                  className="user-dashboard__track-title-input"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onBlur={handleTitleBlur}
                  onKeyDown={handleTitleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="user-dashboard__track-title-text">{track.title}</span>
              )}
            </div>

            <div className="user-dashboard__track-cell user-dashboard__track-cell--duration">
              <span className="user-dashboard__track-duration">{track.duration}</span>
            </div>

            {!isEditing ? (
              <div className="user-dashboard__track-cell user-dashboard__track-cell--actions">
                <button
                  ref={accessBtnRef}
                  type="button"
                  className="user-dashboard__track-access-button"
                  onClick={toggleAccessMenu}
                  aria-expanded={accessMenuOpen}
                  aria-haspopup="menu"
                  aria-label={trackAccessAria}
                >
                  <span className="user-dashboard__track-access-button-icon" aria-hidden>
                    <TrackVisibilityIcon visibility={trackVisibility} size={18} />
                  </span>
                </button>
                <button
                  type="button"
                  className="user-dashboard__track-edit-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(e);
                  }}
                  aria-label={ui?.dashboard?.editTrack ?? 'Edit track'}
                >
                  <PencilIcon {...dashboardActionIconProps()} />
                </button>
                <button
                  type="button"
                  className="user-dashboard__track-delete-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(e);
                  }}
                  aria-label={ui?.dashboard?.deleteTrack ?? 'Delete track'}
                >
                  <Trash2Icon {...dashboardActionIconProps()} />
                </button>
              </div>
            ) : (
              <div
                className="user-dashboard__track-cell user-dashboard__track-cell--actions"
                aria-hidden
              />
            )}
          </div>
        </div>
      </div>
      {accessMenuOpen &&
        typeof document !== 'undefined' &&
        trackAccessPortalMount != null &&
        createPortal(
          <div
            ref={accessMenuRef}
            className="user-dashboard__track-access-menu"
            style={{
              position: 'fixed',
              top: (menuPos ?? { top: 120, left: 24 }).top,
              left: (menuPos ?? { top: 120, left: 24 }).left,
              zIndex: 10050,
              minWidth: 240,
              maxWidth: 280,
            }}
            role="menu"
          >
            {trackVisibilityMenuOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="menuitem"
                className={clsx('user-dashboard__track-access-menu-item', {
                  'user-dashboard__track-access-menu-item--active': opt.value === trackVisibility,
                })}
                onClick={() => void pickVisibility(opt.value)}
              >
                <span className="user-dashboard__track-access-menu-item-icon" aria-hidden>
                  <TrackVisibilityIcon visibility={opt.value} size={18} />
                </span>
                <span className="user-dashboard__track-access-menu-item-text">
                  <span className="user-dashboard__track-access-menu-item-title">{opt.label}</span>
                  <span className="user-dashboard__track-access-menu-item-desc">
                    {opt.description}
                  </span>
                </span>
                {opt.value === trackVisibility ? (
                  <span className="user-dashboard__track-access-menu-check" aria-hidden>
                    ✓
                  </span>
                ) : (
                  <span className="user-dashboard__track-access-menu-check-spacer" aria-hidden />
                )}
              </button>
            ))}
          </div>,
          trackAccessPortalMount
        )}
    </>
  );
}

/** URL segment under `/dashboard-new/:tab` — источник истины для активной вкладки. */
export type { DashboardTab } from '@shared/lib/accountType';

function dashboardHeadingForTab(tab: DashboardTab, ui: IInterface | null): string {
  const d = ui?.dashboard;
  switch (tab) {
    case 'profile':
      return d?.profile ?? 'Profile';
    case 'social-links':
      return d?.tabs?.socialLinks ?? d?.socialLinks?.title ?? 'Social Links';
    case 'albums':
      return d?.tabs?.albums ?? 'Albums';
    case 'posts':
      return d?.tabs?.posts ?? 'Articles';
    case 'mixer':
      return d?.tabs?.mixer ?? 'Mixer';
    case 'archive':
      return d?.archive?.title ?? d?.tabs?.archive ?? 'Archive';
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
  const isArtistPagePublic = useMemo(
    () => hasPublishedPublicReleases(albumsFromStore),
    [albumsFromStore]
  );
  const articlesStatus = useAppSelector(selectDashboardArticlesStatus);
  const articlesError = useAppSelector(selectDashboardArticlesError);
  const articlesFromStore = useAppSelector((state) => selectDashboardArticlesDataResolved(state));
  const user = useAuthSessionUser();
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

  const [isProfileSettingsModalOpen, setIsProfileSettingsModalOpen] = useState(false);
  const [isUpgradeToArtistModalOpen, setIsUpgradeToArtistModalOpen] = useState(false);
  const [profileSettingsInitialTab, setProfileSettingsInitialTab] = useState<
    'general' | 'profile' | 'security'
  >('general');
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
  const avatarMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const [profilePublicSlug, setProfilePublicSlug] = useState<string | null>(null);
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);
  const [scrollToAlbumUploadId, setScrollToAlbumUploadId] = useState<string | null>(null);
  const [publishingAlbumId, setPublishingAlbumId] = useState<string | null>(null);
  const [publishedToastTrigger, setPublishedToastTrigger] = useState(0);
  const [tracksUploadToastTrigger, setTracksUploadToastTrigger] = useState(0);
  const [albumDeletedToastTrigger, setAlbumDeletedToastTrigger] = useState(0);
  const [articleEditorToastTrigger, setArticleEditorToastTrigger] = useState(0);
  const trackUploadSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null);
  const [articleAccessMenuArticleId, setArticleAccessMenuArticleId] = useState<string | null>(null);
  const [albumsData, setAlbumsData] = useState<AlbumData[]>([]);
  const catalogNeedsRefreshRef = useRef(false);
  const articlesNeedsRefreshRef = useRef(false);

  const markPublicCatalogDirty = useCallback(() => {
    catalogNeedsRefreshRef.current = true;
  }, []);

  const markPublicArticlesDirty = useCallback(() => {
    articlesNeedsRefreshRef.current = true;
  }, []);

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
        void dispatch(fetchAlbums({ force: true }));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('artist:updated'));
        }
      }
      if (articlesDirty) {
        void dispatch(fetchArticles({ force: true, publicArtistSlug: artistSlug }));
      }
    },
    [dispatch]
  );

  const closeDashboard = useCallback(() => {
    if (!backgroundLocation) {
      navigate('/');
      return;
    }

    clearDashboardModalBackground();

    const backgroundArtistSlug = getArtistSlugFromLocation(backgroundLocation);
    const artistSlugForRefresh = backgroundArtistSlug ?? profilePublicSlug?.trim() ?? null;

    navigate(
      {
        pathname: backgroundLocation.pathname,
        search: backgroundLocation.search,
        hash: backgroundLocation.hash ?? '',
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
    trackStatus: TrackData['lyricsStatus'];
    hasSyncedLyrics?: boolean; // Есть ли синхронизированный текст
    initialLyrics?: string;
    initialAuthorship?: string;
  } | null>(null);
  const [previewLyricsModal, setPreviewLyricsModal] = useState<{
    isOpen: boolean;
    lyrics: string;
    syncedLyrics?: { text: string; startTime: number; endTime?: number }[];
    authorship?: string;
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
      title: d?.deleteAccountConfirmTitle ?? (en ? 'Delete account?' : 'Удалить аккаунт?'),
      warningDescription:
        d?.deleteAccountWarningDescription ??
        (en
          ? 'This action cannot be undone. All your data will be permanently deleted.'
          : 'Это действие нельзя отменить. Все ваши данные будут удалены безвозвратно.'),
      impactTitle: (() => {
        const fromApi = d?.deleteAccountWarningIntro?.trim();
        const short = en ? 'This will permanently delete:' : 'Будут удалены безвозвратно:';
        if (!fromApi) return short;
        if (
          fromApi.includes('не подлежат восстановлению') ||
          fromApi.includes('cannot be recovered') ||
          fromApi.length > 48
        ) {
          return short;
        }
        return fromApi;
      })(),
      warningItems: [
        d?.deleteAccountWarningProfile ?? (en ? 'Profile' : 'Профиль'),
        d?.deleteAccountWarningAlbums ?? (en ? 'Albums' : 'Альбомы'),
        d?.deleteAccountWarningTracks ?? (en ? 'Tracks' : 'Треки'),
        d?.deleteAccountWarningArticles ?? (en ? 'Articles' : 'Статьи'),
        d?.deleteAccountWarningPurchases ?? (en ? 'Purchases' : 'Покупки'),
        d?.deleteAccountWarningArchive ?? (en ? 'Archive' : 'Архив'),
        d?.deleteAccountWarningPremium ?? (en ? 'Premium access' : 'Premium-доступ'),
      ],
      passwordLabel: d?.deleteAccountPasswordLabel ?? (en ? 'Current password' : 'Текущий пароль'),
      passwordPlaceholder:
        d?.deleteAccountPasswordPlaceholder ??
        (en ? 'Enter current password' : 'Введите текущий пароль'),
      passwordHelper:
        d?.deleteAccountPasswordHelper ??
        (en
          ? 'For your security, please enter your current password to continue.'
          : 'Для безопасности введите текущий пароль, чтобы продолжить.'),
      finalWarning:
        d?.deleteAccountFinalWarning ??
        (en ? 'This action cannot be undone.' : 'Это действие нельзя отменить.'),
      deleteButton: d?.deleteAccount ?? (en ? 'Delete account' : 'Удалить аккаунт'),
      cancel: d?.cancel ?? (en ? 'Cancel' : 'Отмена'),
      close: d?.close ?? (en ? 'Close' : 'Закрыть'),
      deleting: d?.deleteAccountDeleting ?? (en ? 'Deleting account…' : 'Удаление аккаунта…'),
      passwordRequired: en ? 'Enter your password' : 'Укажите пароль',
      deleteFailed:
        d?.deleteAccountFailed ??
        (en ? 'Could not delete account. Please try again.' : 'Не удалось удалить аккаунт.'),
    };
  }, [lang, ui?.dashboard]);

  const handleAccountDeleted = useCallback(() => {
    setIsDeleteAccountModalOpen(false);
    setIsProfileSettingsModalOpen(false);
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

    if (intent.openProfileSettingsModal) {
      setProfileSettingsInitialTab(intent.profileSettingsTab ?? 'profile');
      setIsProfileSettingsModalOpen(true);
      consumed = true;
    }

    if (intent.openNewArticleModal) {
      if (emailVerified) {
        setEditArticleModal({ isOpen: true, article: createNewDraftArticle() });
      }
      consumed = true;
    }

    if (consumed) {
      navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        { replace: true, state: replaceState }
      );
    }
  }, [emailVerified, location.hash, location.pathname, location.search, location.state, navigate]);

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

  // Состояние для загрузки обложки статьи
  const [articleCoverUpload, setArticleCoverUpload] = useState<{
    [articleId: string]: {
      preview: string | null;
      status: 'idle' | 'uploading' | 'uploaded' | 'error';
      progress: number;
      error: string | null;
      dragActive: boolean;
    };
  }>({});
  const articleCoverLocalPreviewRefs = useRef<{ [articleId: string]: string | null }>({});

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

  // Функции для загрузки обложки статьи
  const handleArticleCoverDrag = (articleId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setArticleCoverUpload((prev) => ({
        ...prev,
        [articleId]: {
          ...(prev[articleId] || {
            preview: null,
            status: 'idle',
            progress: 0,
            error: null,
            dragActive: false,
          }),
          dragActive: true,
        },
      }));
    }
    if (e.type === 'dragleave') {
      setArticleCoverUpload((prev) => ({
        ...prev,
        [articleId]: {
          ...(prev[articleId] || {
            preview: null,
            status: 'idle',
            progress: 0,
            error: null,
            dragActive: false,
          }),
          dragActive: false,
        },
      }));
    }
  };

  const handleArticleCoverDrop = async (articleId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setArticleCoverUpload((prev) => ({
      ...prev,
      [articleId]: {
        ...(prev[articleId] || {
          preview: null,
          status: 'idle',
          progress: 0,
          error: null,
          dragActive: false,
        }),
        dragActive: false,
      },
    }));

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await handleArticleCoverFileUpload(articleId, file);
    }
  };

  const handleArticleCoverFileInput = async (
    articleId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await handleArticleCoverFileUpload(articleId, file);
    }
    e.target.value = '';
  };

  const handleArticleCoverFileUpload = async (articleId: string, file: File) => {
    if (!emailVerified) return;
    if (!file.type.startsWith('image/')) {
      setArticleCoverUpload((prev) => ({
        ...prev,
        [articleId]: {
          ...(prev[articleId] || {
            preview: null,
            status: 'idle',
            progress: 0,
            error: null,
            dragActive: false,
          }),
          status: 'error',
          error: ui?.dashboard?.pleaseSelectImageFile ?? 'Please select an image file',
        },
      }));
      return;
    }

    try {
      // Сброс
      setArticleCoverUpload((prev) => ({
        ...prev,
        [articleId]: {
          preview: null,
          status: 'uploading',
          progress: 0,
          error: null,
          dragActive: false,
        },
      }));

      // Локальное превью
      if (articleCoverLocalPreviewRefs.current[articleId]) {
        URL.revokeObjectURL(articleCoverLocalPreviewRefs.current[articleId]!);
      }
      articleCoverLocalPreviewRefs.current[articleId] = URL.createObjectURL(file);
      setArticleCoverUpload((prev) => ({
        ...prev,
        [articleId]: {
          ...(prev[articleId] || {
            preview: null,
            status: 'idle',
            progress: 0,
            error: null,
            dragActive: false,
          }),
          preview: articleCoverLocalPreviewRefs.current[articleId],
        },
      }));

      const fileExtension = file.name.split('.').pop() || 'jpg';
      const baseFileName = file.name.replace(/\.[^/.]+$/, '');
      const rawFileName = `article_cover_${uniqueUploadFileSuffix()}_${baseFileName}.${fileExtension}`;
      /** Совпадает с ключом в Storage после upload-file (sanitizeUploadFileName). */
      const finalImageKey = sanitizeFileName(rawFileName);

      setArticleCoverUpload((prev) => ({
        ...prev,
        [articleId]: {
          ...(prev[articleId] || {
            preview: null,
            status: 'idle',
            progress: 0,
            error: null,
            dragActive: false,
          }),
          progress: 30,
        },
      }));

      const existingArticle = articlesFromStore.find((a) => a.articleId === articleId);
      const previousCoverKey =
        existingArticle?.img && existingArticle.img.startsWith('article_cover_')
          ? existingArticle.img
          : undefined;

      const url = await uploadFile({
        file,
        category: 'articles',
        fileName: rawFileName,
        ...(previousCoverKey ? { previousImageKey: previousCoverKey } : {}),
      });

      setArticleCoverUpload((prev) => ({
        ...prev,
        [articleId]: {
          ...(prev[articleId] || {
            preview: null,
            status: 'idle',
            progress: 0,
            error: null,
            dragActive: false,
          }),
          progress: 90,
        },
      }));

      if (url) {
        const token = getToken();
        if (!token) {
          if (articleCoverLocalPreviewRefs.current[articleId]) {
            URL.revokeObjectURL(articleCoverLocalPreviewRefs.current[articleId]!);
            articleCoverLocalPreviewRefs.current[articleId] = null;
          }
          setArticleCoverUpload((prev) => ({
            ...prev,
            [articleId]: {
              ...(prev[articleId] || {
                preview: null,
                status: 'idle',
                progress: 0,
                error: null,
                dragActive: false,
              }),
              status: 'error',
              error: ui?.dashboard?.failedToUploadCover ?? 'Failed to upload cover image',
            },
          }));
          return;
        }

        const article = articlesFromStore.find((a) => a.articleId === articleId);
        if (!article) {
          if (articleCoverLocalPreviewRefs.current[articleId]) {
            URL.revokeObjectURL(articleCoverLocalPreviewRefs.current[articleId]!);
            articleCoverLocalPreviewRefs.current[articleId] = null;
          }
          setArticleCoverUpload((prev) => ({
            ...prev,
            [articleId]: {
              ...(prev[articleId] || {
                preview: null,
                status: 'idle',
                progress: 0,
                error: null,
                dragActive: false,
              }),
              status: 'error',
              error: 'Article not found',
            },
          }));
          return;
        }

        // API поддерживает id=UUID и id=article_id (без UUID в Redux — всё равно сохраняем обложку).
        const idParam = article.id ?? article.articleId;
        // Обновляем только img (shared metadata), без translations — иначе 400 при пустом nameArticle в UI-локали.
        const response = await fetchWithAuthSession(
          `/api/articles-api?id=${encodeURIComponent(idParam)}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              articleId: article.articleId,
              lang,
              img: finalImageKey,
            }),
          }
        );

        if (!response.ok) {
          if (articleCoverLocalPreviewRefs.current[articleId]) {
            URL.revokeObjectURL(articleCoverLocalPreviewRefs.current[articleId]!);
            articleCoverLocalPreviewRefs.current[articleId] = null;
          }
          setArticleCoverUpload((prev) => ({
            ...prev,
            [articleId]: {
              ...(prev[articleId] || {
                preview: null,
                status: 'idle',
                progress: 0,
                error: null,
                dragActive: false,
              }),
              status: 'error',
              error: ui?.dashboard?.failedToUploadCover ?? 'Failed to save cover',
            },
          }));
          return;
        }

        await dispatch(fetchArticles({ force: true, ownerDashboard: true }));

        if (articleCoverLocalPreviewRefs.current[articleId]) {
          URL.revokeObjectURL(articleCoverLocalPreviewRefs.current[articleId]!);
          articleCoverLocalPreviewRefs.current[articleId] = null;
        }

        setArticleCoverUpload((prev) => ({
          ...prev,
          [articleId]: {
            preview: url,
            status: 'uploaded',
            progress: 100,
            error: null,
            dragActive: false,
          },
        }));
      } else {
        setArticleCoverUpload((prev) => ({
          ...prev,
          [articleId]: {
            ...(prev[articleId] || {
              preview: null,
              status: 'idle',
              progress: 0,
              error: null,
              dragActive: false,
            }),
            status: 'error',
            error: ui?.dashboard?.failedToUploadCover ?? 'Failed to upload cover image',
          },
        }));
      }
    } catch (error) {
      console.error('Error uploading article cover:', error);
      setArticleCoverUpload((prev) => ({
        ...prev,
        [articleId]: {
          ...(prev[articleId] || {
            preview: null,
            status: 'idle',
            progress: 0,
            error: null,
            dragActive: false,
          }),
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }));
    }
  };

  useEffect(() => {
    if (!isAvatarMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        avatarMenuContainerRef.current &&
        !avatarMenuContainerRef.current.contains(e.target as Node)
      ) {
        setIsAvatarMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAvatarMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isAvatarMenuOpen]);

  useEffect(() => {
    if (!userId) {
      setProfilePublicSlug(null);
      return;
    }

    let cancelled = false;

    const loadProfileSlug = async () => {
      try {
        const response = await fetchWithAuthSession(
          buildApiUrl('/api/user-profile', { lang }, { includeArtist: false }),
          {
            cache: 'no-cache',
            headers: {
              'Cache-Control': 'no-cache',
              ...getAuthHeader(),
            },
          }
        );
        if (cancelled || !response.ok) return;

        const result = (await response.json()) as {
          success?: boolean;
          data?: { publicSlug?: string | null };
        };
        if (result.success) {
          setProfilePublicSlug(result.data?.publicSlug?.trim() || null);
        }
      } catch {
        if (!cancelled) setProfilePublicSlug(null);
      }
    };

    void loadProfileSlug();

    const onProfileUpdated = () => {
      void loadProfileSlug();
    };
    window.addEventListener('profile-name-updated', onProfileUpdated);
    window.addEventListener('artist:updated', onProfileUpdated);

    return () => {
      cancelled = true;
      window.removeEventListener('profile-name-updated', onProfileUpdated);
      window.removeEventListener('artist:updated', onProfileUpdated);
    };
  }, [userId, lang]);

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
    // (вкладка Albums — skeleton; миксер/модалки сохраняют последний валидный список).
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

        // Добавляем authorship из кеша для каждого трека
        transformedAlbums.forEach((album) => {
          album.tracks.forEach((track) => {
            if (!track.authorship) {
              const cachedAuthorship = getCachedAuthorship(album.albumId, track.id, lang);
              if (cachedAuthorship) {
                track.authorship = cachedAuthorship;
              }
            }
          });
        });

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

  // Настройка сенсоров для drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Минимальное расстояние для начала перетаскивания (в пикселях)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

      setAlbumsData((prev) =>
        prev.map((album) =>
          album.albumId === albumId || album.id === albumId
            ? {
                ...album,
                tracks: album.tracks.map((t) => (t.id === trackId ? { ...t, visibility } : t)),
              }
            : album
        )
      );
      markPublicCatalogDirty();
    } catch (error) {
      console.error('❌ Error updating track visibility:', error);
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message: `Ошибка при изменении доступа к треку: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: 'error',
      });
      await dispatch(fetchAlbums({ force: true, ownerDashboard: true })).unwrap();
    }
  };

  const handleArticleVisibilityChange = async (articleId: string, visibility: TrackVisibility) => {
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

      dispatch(patchDashboardArticleVisibility({ articleId, visibility }));
      markPublicArticlesDirty();
    } catch (error) {
      console.error('Error updating article visibility:', error);
      setAlertModal({
        isOpen: true,
        title: ui?.dashboard?.error ?? 'Error',
        message: `${ui?.dashboard?.error ?? 'Error'}: ${error instanceof Error ? error.message : 'Unknown'}`,
        variant: 'error',
      });
      await dispatch(fetchArticles({ force: true, ownerDashboard: true })).unwrap();
    }
  };

  const performDeleteTrack = async (albumId: string, trackId: string) => {
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

      markPublicCatalogDirty();
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
      await dispatch(fetchArticles({ force: true, ownerDashboard: true })).unwrap();

      // Закрываем расширенный вид, если удаленная статья была открыта
      if (expandedArticleId === article.articleId) {
        setExpandedArticleId(null);
      }

      console.log('✅ Article deleted successfully:', article.articleId);
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
    const artistSlugForCatalog =
      (backgroundLocation ? getArtistSlugFromLocation(backgroundLocation) : null) ??
      profilePublicSlug?.trim() ??
      null;

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

      if (artistSlugForCatalog) {
        dispatch(setPublicArtistSlug(artistSlugForCatalog));
        try {
          await dispatch(fetchAlbums({ force: true })).unwrap();
        } catch {
          /* публичный каталог под ?artist= — best-effort */
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('artist:updated'));
      }

      catalogNeedsRefreshRef.current = false;

      queueAlbumDeletedToast(formatAlbumDeletedSuccessMessage(deletedAlbumTitle, lang, ui));
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
                lyricsStatus: 'empty' as const,
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

  const getLyricsStatusText = (status: TrackData['lyricsStatus']) => {
    switch (status) {
      case 'synced':
        return ui?.dashboard?.addedSynced ?? 'Added, synced';
      case 'text-only':
        return ui?.dashboard?.addedNoSync ?? 'Added, no sync';
      case 'empty':
        return ui?.dashboard?.noLyrics ?? 'No lyrics';
      default:
        return '';
    }
  };

  const getLyricsActions = (
    status: TrackData['lyricsStatus'],
    hasSyncedLyrics: boolean = false
  ) => {
    switch (status) {
      case 'synced': {
        const actions = [{ label: ui?.dashboard?.edit ?? 'Edit', action: 'edit' }];
        // Показываем Prev только если есть синхронизированный текст
        if (hasSyncedLyrics) {
          actions.push({ label: ui?.dashboard?.prev ?? 'Prev', action: 'prev' });
        }
        actions.push({ label: ui?.dashboard?.sync ?? 'Sync', action: 'sync' });
        return actions;
      }
      case 'text-only':
        return [
          { label: ui?.dashboard?.edit ?? 'Edit', action: 'edit' },
          { label: ui?.dashboard?.sync ?? 'Sync', action: 'sync' },
        ];
      case 'empty':
        return [{ label: ui?.dashboard?.add ?? 'Add', action: 'add' }];
      default:
        return [];
    }
  };

  const handleLyricsAction = async (
    action: string,
    albumId: string,
    trackId: string,
    trackTitle: string
  ) => {
    if (action === 'add') {
      setAddLyricsModal({ isOpen: true, albumId, trackId, trackTitle });
    } else if (action === 'edit') {
      const album = albumsData.find((a) => a.id === albumId);
      const track = album?.tracks.find((t) => t.id === trackId);
      if (track) {
        // Загружаем текст, authorship и syncedLyrics из БД для отображения в модальном окне
        const [storedText, storedAuthorship, storedSyncedLyrics] = await Promise.all([
          loadTrackTextFromDatabase(albumId, trackId, lang).catch(() => null),
          loadAuthorshipFromStorage(albumId, trackId, lang).catch(() => null),
          loadSyncedLyricsFromStorage(albumId, trackId, lang).catch(() => null),
        ]);

        const cachedAuthorship = getCachedAuthorship(albumId, trackId, lang);
        // Как на сайте: авторство из merge (resolveAlbumForDisplay). Ответ synced-lyrics может отдать
        // authorship с «чужой» локали, если синхра выбрана через fallback — не перекрываем merged-трек.
        const mergedAuthorship =
          (track.authorship && track.authorship.trim()) || cachedAuthorship?.trim() || '';
        const fallbackText = track.lyricsText || '';

        const finalText = storedText !== null ? storedText : fallbackText;

        if (process.env.NODE_ENV === 'development') {
          console.log('[UserDashboard] Opening edit lyrics modal:', {
            albumId,
            trackId,
            storedTextLength: storedText?.length || 0,
            fallbackTextLength: fallbackText.length,
            finalTextLength: finalText.length,
            loadedFromDb: !!storedText,
            hasStoredSyncedLyrics: !!storedSyncedLyrics,
            storedSyncedLyricsLength: storedSyncedLyrics?.length || 0,
          });
        }

        // Проверяем наличие синхронизированного текста
        // Используем загруженные данные из БД, если они есть, иначе используем данные из track
        const syncedLyrics = storedSyncedLyrics || track.syncedLyrics; // Проверяем наличие синхронизированного текста
        // Текст считается синхронизированным только если есть хотя бы одна строка с startTime > 0
        // (строки с startTime === 0 считаются несинхронизированными)
        const hasSyncedLyrics =
          Array.isArray(syncedLyrics) &&
          syncedLyrics.length > 0 &&
          syncedLyrics.some((line) => line.startTime > 0);
        setEditLyricsModal({
          isOpen: true,
          albumId,
          trackId,
          trackTitle,
          trackStatus: track.lyricsStatus,
          hasSyncedLyrics,
          initialLyrics: finalText,
          initialAuthorship: mergedAuthorship || storedAuthorship || undefined,
        });
      }
    } else if (action === 'prev') {
      const lyrics = getTrackLyricsText(albumId, trackId);

      // Загружаем синхронизированные тексты из БД
      const syncedLyrics = await loadSyncedLyricsFromStorage(albumId, trackId, lang).catch(
        () => null
      );

      const storedPrevAuthorship = await loadAuthorshipFromStorage(albumId, trackId, lang).catch(
        () => null
      );

      const album = albumsData.find((a) => a.id === albumId);
      const track = album?.tracks.find((t) => t.id === trackId);
      const cachedPrev = getCachedAuthorship(albumId, trackId, lang);
      const mergedPrev = (track?.authorship && track.authorship.trim()) || cachedPrev?.trim() || '';

      console.log('[UserDashboard] Opening Preview Lyrics:', {
        albumId,
        trackId,
        trackSrc: track?.src,
        hasTrack: !!track,
        albumTracks: album?.tracks.map((t) => ({ id: t.id, src: t.src })),
        syncedLyricsCount: syncedLyrics?.length || 0,
      });

      if (track?.src?.trim() && !album?.userId) {
        console.error('[BUG] album.userId missing', { albumId, context: 'previewLyricsModal' });
      }

      setPreviewLyricsModal({
        isOpen: true,
        lyrics,
        syncedLyrics: syncedLyrics || undefined,
        authorship: mergedPrev || storedPrevAuthorship || undefined,
        trackSrc: track?.src,
        mediaOwnerUserId: album?.userId,
      });
    } else if (action === 'sync') {
      const album = albumsData.find((a) => a.id === albumId);
      const track = album?.tracks.find((t) => t.id === trackId);
      if (track) {
        if (track.src?.trim() && !album?.userId) {
          console.error('[BUG] album.userId missing', { albumId, context: 'syncLyricsModal' });
        }
        const lyricsText = getTrackLyricsText(albumId, trackId);
        const trackDurationSeconds = parseTrackDurationToSeconds(track.duration);
        setSyncLyricsModal({
          isOpen: true,
          albumId,
          trackId,
          trackTitle,
          trackSrc: track.src,
          mediaOwnerUserId: album?.userId,
          trackDurationSeconds,
          lyricsText,
          authorship: track.authorship,
        });
      }
    }
  };

  const handleAddLyrics = async (lyrics: string, authorship?: string) => {
    if (!addLyricsModal) return;
    if (!lyrics.trim()) return;

    // Сохраняем текст и авторство в БД
    const album = albumsData.find((a) => a.id === addLyricsModal.albumId);
    if (album) {
      const result = await saveTrackText({
        albumId: addLyricsModal.albumId,
        trackId: addLyricsModal.trackId,
        lang,
        translations: { [lang]: { content: lyrics, authorship } },
        trackTitle: addLyricsModal.trackTitle,
      });

      if (result.success) {
        setCachedAuthorship(addLyricsModal.albumId, addLyricsModal.trackId, lang, authorship);
        void dispatch(fetchAlbums({ force: true, ownerDashboard: true }));
        setAlbumsData((prev) =>
          prev.map((a) => {
            if (a.id === addLyricsModal.albumId) {
              return {
                ...a,
                tracks: a.tracks.map((track) =>
                  track.id === addLyricsModal.trackId
                    ? {
                        ...track,
                        lyricsStatus: 'text-only' as const,
                        lyricsText: lyrics,
                        authorship,
                      }
                    : track
                ),
              };
            }
            return a;
          })
        );
      } else {
        setAlertModal({
          isOpen: true,
          title: ui?.dashboard?.error ?? 'Error',
          message: result.message || (ui?.dashboard?.errorSavingText ?? 'Error saving text'),
          variant: 'error',
        });
      }
    }

    setAddLyricsModal(null);
  };

  const handleSaveLyrics = async (lyrics: string, authorship?: string) => {
    if (!editLyricsModal) return;

    // Сохраняем текст и авторство в БД
    const album = albumsData.find((a) => a.id === editLyricsModal.albumId);
    if (album) {
      const result = await saveTrackText({
        albumId: editLyricsModal.albumId,
        trackId: editLyricsModal.trackId,
        lang,
        translations: { [lang]: { content: lyrics, authorship } },
        trackTitle: editLyricsModal.trackTitle,
      });

      if (result.success) {
        setCachedAuthorship(editLyricsModal.albumId, editLyricsModal.trackId, lang, authorship);

        // Перезагружаем текст из БД, чтобы убедиться, что он сохранен корректно
        const savedText = await loadTrackTextFromDatabase(
          editLyricsModal.albumId,
          editLyricsModal.trackId,
          lang
        ).catch(() => null);

        // Используем ответ БД, включая пустую строку после очистки текста
        const finalText = savedText !== null ? savedText : lyrics;

        const normalizeLyricsFingerprint = (s: string | undefined) =>
          (s || '')
            .replace(/\r\n/g, '\n')
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0)
            .join('\n');

        const prevTrack = album.tracks.find((t) => t.id === editLyricsModal.trackId);
        const lyricsChanged =
          normalizeLyricsFingerprint(finalText) !==
          normalizeLyricsFingerprint(prevTrack?.lyricsText);

        let nextLyricsStatus: TrackData['lyricsStatus'];
        if (!finalText.trim()) {
          nextLyricsStatus = 'empty';
        } else if (!lyricsChanged) {
          nextLyricsStatus = prevTrack?.lyricsStatus ?? 'text-only';
        } else {
          nextLyricsStatus = 'text-only';
        }

        // Обновляем albumsData с сохраненным текстом
        setAlbumsData((prev) =>
          prev.map((a) => {
            if (a.id === editLyricsModal.albumId) {
              return {
                ...a,
                tracks: a.tracks.map((track) =>
                  track.id === editLyricsModal.trackId
                    ? {
                        ...track,
                        lyricsText: finalText,
                        authorship,
                        lyricsStatus: nextLyricsStatus,
                        syncedLyrics: lyricsChanged ? undefined : track.syncedLyrics,
                      }
                    : track
                ),
              };
            }
            return a;
          })
        );

        // Обновляем initialLyrics в состоянии модального окна ДО закрытия, чтобы изменения сразу отобразились
        // Это важно, если модалка остается открытой (хотя обычно она закрывается)
        setEditLyricsModal((prev) =>
          prev
            ? {
                ...prev,
                initialLyrics: finalText,
                initialAuthorship: authorship ?? '',
              }
            : null
        );

        void dispatch(fetchAlbums({ force: true, ownerDashboard: true }));

        console.log('✅ Lyrics saved and albumsData updated:', {
          albumId: editLyricsModal.albumId,
          trackId: editLyricsModal.trackId,
          lyricsLength: finalText.length,
          loadedFromDb: !!savedText,
          finalText: finalText.substring(0, 50) + '...',
        });
      } else {
        setAlertModal({
          isOpen: true,
          title: ui?.dashboard?.error ?? 'Error',
          message: result.message || (ui?.dashboard?.errorSavingText ?? 'Error saving text'),
          variant: 'error',
        });
      }
    }
  };

  const getTrackLyricsText = (albumId: string, trackId: string): string => {
    const album = albumsData.find((a) => a.id === albumId);
    const track = album?.tracks.find((t) => t.id === trackId);
    return track?.lyricsText || '';
  };

  const getTrackAuthorship = (albumId: string, trackId: string): string | undefined => {
    const album = albumsData.find((a) => a.id === albumId);
    const track = album?.tracks.find((t) => t.id === trackId);
    return track?.authorship;
  };

  const handlePreviewLyrics = async () => {
    if (!editLyricsModal) return;
    const { albumId, trackId } = editLyricsModal;
    const lyrics = getTrackLyricsText(albumId, trackId);

    // Загружаем синхронизированные тексты из БД
    const syncedLyrics = await loadSyncedLyricsFromStorage(albumId, trackId, lang).catch(
      () => null
    );

    const storedAuthorshipPreview = await loadAuthorshipFromStorage(albumId, trackId, lang).catch(
      () => null
    );

    const album = albumsData.find((a) => a.id === albumId);
    const track = album?.tracks.find((t) => t.id === trackId);
    const cached = getCachedAuthorship(albumId, trackId, lang);
    const mergedPreview = (track?.authorship && track.authorship.trim()) || cached?.trim() || '';

    if (track?.src?.trim() && !album?.userId) {
      console.error('[BUG] album.userId missing', { albumId, context: 'previewLyricsFromEdit' });
    }

    setPreviewLyricsModal({
      isOpen: true,
      lyrics,
      syncedLyrics: syncedLyrics || undefined,
      authorship: mergedPreview || storedAuthorshipPreview || undefined,
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

  const editTrackCloseGuard = useCloseWithUnsavedConfirmation({
    isOpen: !!editTrackModal?.isOpen,
    hasUnsavedChanges: editTrackTitleDirty,
    onClose: finalizeEditTrackModalClose,
  });

  if (tabInvalid || tabDisallowed) {
    return (
      <Navigate
        to={`/dashboard-new/${getDefaultDashboardTab(user)}`}
        replace
        state={location.state}
      />
    );
  }

  if (!isAuthenticated() || !user) {
    return (
      <Navigate
        to="/auth"
        replace
        state={dashboardNavState ? { ...dashboardNavState, from: location } : { from: location }}
      />
    );
  }

  const albumsInitialLoading =
    isArtist && (albumsStatus === 'loading' || albumsStatus === 'idle') && albumsData.length === 0;
  const albumsLoadFailed = albumsStatus === 'failed';

  const dashboardHeading = dashboardHeadingForTab(activeTab, ui);

  return (
    <>
      <Helmet>
        <title>{dashboardHeading} — Смоляное Чучелко</title>
      </Helmet>

      <Popup isActive={true} onClose={closeDashboard}>
        <AlbumPublishedToast triggerKey={publishedToastTrigger} />
        <AlbumCreatedToast triggerKey={editAlbumModal} />
        <TracksUploadedToast triggerKey={tracksUploadToastTrigger} />
        <AlbumDeletedToast triggerKey={albumDeletedToastTrigger} />
        <ArticleEditorToast triggerKey={articleEditorToastTrigger} />
        <div className="user-dashboard">
          {/* Main card container */}
          <div className="user-dashboard__card">
            {/* Header with controls */}
            <div className="user-dashboard__header">
              <h2 className="user-dashboard__title">{dashboardHeading}</h2>
              <button
                type="button"
                className="user-dashboard__close"
                onClick={closeDashboard}
                aria-label={ui?.dashboard?.close ?? 'Close'}
              >
                ×
              </button>
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
                {/* На первой загрузке альбомов: свой скелетон под активную вкладку */}
                {albumsInitialLoading &&
                !albumsLoadFailed &&
                activeTab === 'albums' &&
                emailVerified ? (
                  <DashboardTabContentSkeleton />
                ) : albumsInitialLoading && !albumsLoadFailed && activeTab === 'profile' ? (
                  <ProfileTabSkeleton />
                ) : albumsLoadFailed ? (
                  <div
                    className="user-dashboard__error user-dashboard__error--tab-shell"
                    role="alert"
                  >
                    {ui?.dashboard?.errorLoading ?? 'Error loading:'}{' '}
                    {albumsError || (ui?.dashboard?.failedToLoadAlbums ?? 'Failed to load albums')}
                  </div>
                ) : (
                  <>
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
                    <div
                      className="user-dashboard__tab-panel"
                      hidden={activeTab !== 'my-purchases'}
                      aria-hidden={activeTab !== 'my-purchases'}
                    >
                      <MyPurchasesContent />
                    </div>
                    <div
                      className="user-dashboard__tab-panel"
                      hidden={activeTab !== 'social-links'}
                      aria-hidden={activeTab !== 'social-links'}
                    >
                      <SocialLinksContent active={activeTab === 'social-links'} />
                    </div>
                    <div
                      className="user-dashboard__tab-panel"
                      hidden={activeTab !== 'mixer'}
                      aria-hidden={activeTab !== 'mixer'}
                    >
                      {!emailVerified ? (
                        <EmailVerificationOnboarding context="mixer" />
                      ) : albumsData.length === 0 ? (
                        <MixerEmptyState
                          ui={ui}
                          onCreateAlbum={() => setEditAlbumModal({ isOpen: true })}
                        />
                      ) : (
                        <div className="user-dashboard__section">
                          <MixerAdmin
                            ui={ui || undefined}
                            userId={user?.id || undefined}
                            albums={albumsData}
                          />
                        </div>
                      )}
                    </div>
                    <div
                      className="user-dashboard__tab-panel"
                      hidden={activeTab !== 'archive'}
                      aria-hidden={activeTab !== 'archive'}
                    >
                      <MyArchiveContent active={activeTab === 'archive'} />
                    </div>
                    <div
                      className="user-dashboard__tab-panel"
                      hidden={activeTab !== 'albums'}
                      aria-hidden={activeTab !== 'albums'}
                    >
                      {!emailVerified ? (
                        <EmailVerificationOnboarding context="albums" />
                      ) : albumsInitialLoading ? (
                        <div className="user-dashboard__section">
                          <ArticlesListSkeleton count={4} />
                        </div>
                      ) : albumsData.length === 0 ? (
                        <AlbumsEmptyState
                          ui={ui}
                          onCreateAlbum={() => setEditAlbumModal({ isOpen: true })}
                        />
                      ) : (
                        <div className="user-dashboard__section">
                          <div className="user-dashboard__albums-list">
                            {albumsData.map((album, index) => {
                              const isExpanded = expandedAlbumId === album.id;
                              const albumFromStore = albumsFromStore.find(
                                (a) => a.albumId === album.id || a.albumId === album.albumId
                              );
                              const lifecycleStatus = albumFromStore
                                ? getAlbumLifecycleStatus({
                                    ...albumFromStore,
                                    tracks:
                                      album.tracks.length === 0
                                        ? []
                                        : (albumFromStore.tracks ?? []).slice(
                                            0,
                                            album.tracks.length
                                          ),
                                  })
                                : isAlbumPublished({
                                      isPublished: album.isPublished,
                                      isPublic: album.isPublic,
                                    })
                                  ? album.isPublic === false
                                    ? 'hidden'
                                    : 'published'
                                  : 'draft';
                              const publishHintKey = albumFromStore
                                ? getAlbumPublishHintKey(albumFromStore)
                                : 'fields';
                              const canPublishAlbum =
                                publishHintKey === 'ready' && Boolean(albumFromStore);
                              const isPublishingAlbum = publishingAlbumId === album.id;
                              const showPublishControls = albumFromStore
                                ? !isAlbumPublished(albumFromStore)
                                : !isAlbumPublished({
                                    isPublished: album.isPublished,
                                    isPublic: album.isPublic,
                                  });
                              return (
                                <React.Fragment key={album.id}>
                                  <div
                                    className={`user-dashboard__album-item ${isExpanded ? 'user-dashboard__album-item--expanded' : ''}`}
                                    onClick={() => toggleAlbum(album.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        toggleAlbum(album.id);
                                      }
                                    }}
                                    aria-label={isExpanded ? 'Collapse album' : 'Expand album'}
                                  >
                                    <div className="user-dashboard__album-thumbnail">
                                      {album.cover ? (
                                        <AlbumCoverImage
                                          cover={album.cover}
                                          userId={album.userId ?? userId ?? undefined}
                                          alt={album.title}
                                          contextAlbumId={album.id}
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      ) : (
                                        <img
                                          src="/images/album-placeholder.png"
                                          alt={album.title}
                                        />
                                      )}
                                    </div>
                                    <div className="user-dashboard__album-info">
                                      <div className="user-dashboard__album-title-row">
                                        <div className="user-dashboard__album-title">
                                          {album.title}
                                        </div>
                                        <AlbumLifecycleBadge
                                          status={lifecycleStatus}
                                          ui={ui ?? undefined}
                                          lang={lang}
                                        />
                                      </div>
                                      {lifecycleStatus === 'hidden' ? (
                                        <p className="user-dashboard__album-status-hint">
                                          {ui?.dashboard?.albumStatusHiddenHint ??
                                            (lang !== 'ru'
                                              ? 'The album is published but hidden from visitors.'
                                              : 'Альбом опубликован, но скрыт от посетителей.')}
                                        </p>
                                      ) : null}
                                      {album.releaseDate ? (
                                        <div className="user-dashboard__album-date">
                                          {album.releaseDate}
                                        </div>
                                      ) : (
                                        <div className="user-dashboard__album-year">
                                          {album.year}
                                        </div>
                                      )}
                                    </div>
                                    <div className="user-dashboard__album-arrow">
                                      <DashboardExpandChevron expanded={isExpanded} />
                                    </div>
                                  </div>

                                  {isExpanded && (
                                    <div className="user-dashboard__album-expanded">
                                      {/* Edit Album button */}
                                      <button
                                        type="button"
                                        className="user-dashboard__edit-album-button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const fromStore = albumsFromStore.find(
                                            (a) =>
                                              a.albumId === album.id || a.albumId === album.albumId
                                          );
                                          setEditAlbumModal({
                                            isOpen: true,
                                            albumId:
                                              fromStore?.albumId ?? album.albumId ?? album.id,
                                          });
                                        }}
                                      >
                                        {ui?.dashboard?.editAlbum ?? 'Edit Album'}
                                      </button>

                                      {/* Track upload section */}
                                      <div
                                        ref={(el) => {
                                          trackUploadSectionRefs.current[album.id] = el;
                                        }}
                                        className="user-dashboard__track-upload"
                                        onDrop={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const files = e.dataTransfer.files;
                                          if (files.length > 0) {
                                            handleTrackUpload(album.id, files);
                                          }
                                        }}
                                        onDragOver={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                        }}
                                        onDragEnter={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                        }}
                                      >
                                        {isUploadingTracks[album.id] ? (
                                          <div className="user-dashboard__track-upload-progress">
                                            <div className="user-dashboard__track-upload-text">
                                              {ui?.dashboard?.uploadingTracks ??
                                                'Uploading tracks…'}{' '}
                                              {Math.round(uploadProgress[album.id] || 0)}%
                                            </div>
                                            <div className="user-dashboard__track-upload-progress-bar">
                                              <div
                                                className="user-dashboard__track-upload-progress-fill"
                                                style={{
                                                  width: `${uploadProgress[album.id] || 0}%`,
                                                  transition: 'width 0.3s ease',
                                                }}
                                              />
                                            </div>
                                          </div>
                                        ) : (
                                          <>
                                            <div className="user-dashboard__track-upload-text">
                                              {ui?.dashboard?.dropTracksHere ??
                                                'Drop tracks here or'}
                                            </div>
                                            <input
                                              ref={(el) => {
                                                fileInputRefs.current[album.id] = el;
                                              }}
                                              type="file"
                                              multiple
                                              accept="audio/*"
                                              style={{ display: 'none' }}
                                              onChange={(e) => {
                                                const files = e.target.files;
                                                if (files && files.length > 0) {
                                                  handleTrackUpload(album.id, files);
                                                }
                                                // Сбрасываем input, чтобы можно было загрузить те же файлы снова
                                                if (e.target) {
                                                  e.target.value = '';
                                                }
                                              }}
                                            />
                                            <button
                                              type="button"
                                              className="user-dashboard__choose-files-button"
                                              disabled={isUploadingTracks[album.id]}
                                              onClick={() => {
                                                const input = fileInputRefs.current[album.id];
                                                if (input) {
                                                  input.click();
                                                }
                                              }}
                                            >
                                              {ui?.dashboard?.chooseFiles ?? 'Choose files'}
                                            </button>
                                          </>
                                        )}
                                      </div>

                                      {album.tracks.length > 0 ? (
                                        <>
                                          {/* Tracks list with drag-and-drop */}
                                          <DndContext
                                            sensors={sensors}
                                            collisionDetection={closestCenter}
                                            onDragEnd={(event) => handleDragEnd(event, album.id)}
                                          >
                                            <SortableContext
                                              items={album.tracks.map((track) => track.id)}
                                              strategy={verticalListSortingStrategy}
                                            >
                                              <div className="user-dashboard__tracks-table">
                                                <div
                                                  className="user-dashboard__tracks-header"
                                                  aria-hidden
                                                >
                                                  <div className="user-dashboard__tracks-header-cell user-dashboard__tracks-header-cell--track">
                                                    {ui?.dashboard?.track ?? 'Track'}
                                                  </div>
                                                  <div className="user-dashboard__tracks-header-cell user-dashboard__tracks-header-cell--duration">
                                                    {ui?.dashboard?.duration ?? 'Duration'}
                                                  </div>
                                                  <div className="user-dashboard__tracks-header-cell user-dashboard__tracks-header-cell--actions">
                                                    {ui?.dashboard?.actions ?? 'Actions'}
                                                  </div>
                                                </div>
                                                <div className="user-dashboard__tracks-list">
                                                  {album.tracks.map((track, trackIndex) => (
                                                    <SortableTrackItem
                                                      key={track.id}
                                                      track={track}
                                                      displayIndex={trackIndex + 1}
                                                      albumId={album.albumId}
                                                      onDelete={handleDeleteTrack}
                                                      onTitleChange={handleTrackTitleChange}
                                                      onVisibilityChange={
                                                        handleTrackVisibilityChange
                                                      }
                                                      ui={ui ?? undefined}
                                                    />
                                                  ))}
                                                </div>
                                              </div>
                                            </SortableContext>
                                          </DndContext>

                                          {/* Lyrics section */}
                                          <div className="user-dashboard__lyrics-section">
                                            <h4 className="user-dashboard__lyrics-title">
                                              {ui?.dashboard?.lyrics ?? 'Lyrics'}
                                            </h4>
                                            <div className="user-dashboard__lyrics-table">
                                              <div className="user-dashboard__lyrics-header">
                                                <div className="user-dashboard__lyrics-header-cell user-dashboard__lyrics-header-cell--track">
                                                  {ui?.dashboard?.track ?? 'Track'}
                                                </div>
                                                <div className="user-dashboard__lyrics-header-cell user-dashboard__lyrics-header-cell--status">
                                                  {ui?.dashboard?.status ?? 'Status'}
                                                </div>
                                                <div className="user-dashboard__lyrics-header-cell user-dashboard__lyrics-header-cell--actions">
                                                  {ui?.dashboard?.actions ?? 'Actions'}
                                                </div>
                                              </div>
                                              {album.tracks.map((track) => (
                                                <div
                                                  key={track.id}
                                                  className="user-dashboard__lyrics-row"
                                                >
                                                  <div
                                                    className="user-dashboard__lyrics-cell"
                                                    data-label={ui?.dashboard?.track ?? 'Track'}
                                                  >
                                                    {track.title}
                                                  </div>
                                                  <div
                                                    className="user-dashboard__lyrics-cell"
                                                    data-label={ui?.dashboard?.status ?? 'Status'}
                                                  >
                                                    {getLyricsStatusText(track.lyricsStatus)}
                                                  </div>
                                                  <div
                                                    className="user-dashboard__lyrics-cell user-dashboard__lyrics-cell--actions"
                                                    data-label={ui?.dashboard?.actions ?? 'Actions'}
                                                  >
                                                    <div className="user-dashboard__lyrics-actions-row">
                                                      {(() => {
                                                        // Вычисляем hasSyncedLyrics для логирования
                                                        const hasSyncedLyrics =
                                                          Array.isArray(track.syncedLyrics) &&
                                                          track.syncedLyrics.length > 0 &&
                                                          track.syncedLyrics.some(
                                                            (line) => line.startTime > 0
                                                          );
                                                        return getLyricsActions(
                                                          track.lyricsStatus,
                                                          hasSyncedLyrics
                                                        );
                                                      })().map((action, idx) => (
                                                        <button
                                                          key={idx}
                                                          type="button"
                                                          className="user-dashboard__lyrics-action-button"
                                                          onClick={() =>
                                                            handleLyricsAction(
                                                              action.action,
                                                              album.id,
                                                              track.id,
                                                              track.title
                                                            )
                                                          }
                                                        >
                                                          {action.label}
                                                        </button>
                                                      ))}
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        </>
                                      ) : null}

                                      {/* Delete album / Upload / Publish actions */}
                                      <div className="user-dashboard__album-footer-actions">
                                        <button
                                          type="button"
                                          className="user-dashboard__delete-album-button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteAlbum(album.id);
                                          }}
                                          title={ui?.dashboard?.deleteAlbum ?? 'Delete album'}
                                          aria-label={ui?.dashboard?.deleteAlbum ?? 'Delete album'}
                                        >
                                          {ui?.dashboard?.deleteAlbum ?? 'Delete album'}
                                        </button>
                                        <div className="user-dashboard__album-footer-actions-right">
                                          {showPublishControls ? (
                                            <div className="user-dashboard__publish-album-wrap">
                                              <button
                                                type="button"
                                                className="user-dashboard__publish-album-button"
                                                disabled={!canPublishAlbum || isPublishingAlbum}
                                                title={
                                                  isPublishingAlbum
                                                    ? (ui?.dashboard?.editAlbumModal?.buttons
                                                        ?.saving ?? 'Saving...')
                                                    : (ui?.dashboard?.editAlbumModal?.buttons
                                                        ?.publishAlbum ?? 'Publish album')
                                                }
                                                aria-label={
                                                  isPublishingAlbum
                                                    ? (ui?.dashboard?.editAlbumModal?.buttons
                                                        ?.saving ?? 'Saving...')
                                                    : (ui?.dashboard?.editAlbumModal?.buttons
                                                        ?.publishAlbum ?? 'Publish album')
                                                }
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  if (!canPublishAlbum || isPublishingAlbum) {
                                                    return;
                                                  }
                                                  void handlePublishAlbum(album.id);
                                                }}
                                              >
                                                {isPublishingAlbum ? (
                                                  (ui?.dashboard?.editAlbumModal?.buttons?.saving ??
                                                  'Saving...')
                                                ) : (
                                                  <>
                                                    {!canPublishAlbum ? (
                                                      <SubscriberContentLockIcon size={18} />
                                                    ) : null}
                                                    {ui?.dashboard?.editAlbumModal?.buttons
                                                      ?.publishAlbum ?? 'Publish album'}
                                                  </>
                                                )}
                                              </button>
                                              <p className="user-dashboard__publish-album-hint">
                                                {publishHintKey === 'ready'
                                                  ? (ui?.dashboard?.albumPublishHintReady ??
                                                    (lang !== 'ru'
                                                      ? 'This album is ready for publication.'
                                                      : 'Альбом готов к публикации.'))
                                                  : publishHintKey === 'cover'
                                                    ? (ui?.dashboard?.albumPublishHintNeedsCover ??
                                                      (lang !== 'ru'
                                                        ? 'Upload album cover art to publish this album.'
                                                        : 'Загрузите обложку альбома для публикации.'))
                                                    : publishHintKey === 'tracks'
                                                      ? (ui?.dashboard
                                                          ?.albumPublishHintNeedsTracks ??
                                                        (lang !== 'ru'
                                                          ? 'Upload at least one track to publish this album.'
                                                          : 'Загрузите хотя бы один трек для публикации альбома.'))
                                                      : (ui?.dashboard
                                                          ?.albumPublishHintNeedsFields ??
                                                        (lang !== 'ru'
                                                          ? 'Complete all required album fields to publish.'
                                                          : 'Заполните все обязательные поля альбома для публикации.'))}
                                              </p>
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {index < albumsData.length - 1 && (
                                    <div className="user-dashboard__album-divider"></div>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>

                          <div className="user-dashboard__albums-upload-divider" aria-hidden />

                          <div className="user-dashboard__upload-action">
                            <button
                              type="button"
                              className="user-dashboard__upload-button"
                              onClick={() => setEditAlbumModal({ isOpen: true })}
                            >
                              {ui?.dashboard?.uploadNewAlbum ?? 'Upload New Album'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div
                      className="user-dashboard__tab-panel"
                      hidden={activeTab !== 'posts'}
                      aria-hidden={activeTab !== 'posts'}
                    >
                      {!emailVerified ? (
                        <EmailVerificationOnboarding context="posts" />
                      ) : articlesStatus === 'loading' ? (
                        <div className="user-dashboard__section">
                          <ArticlesListSkeleton count={4} />
                        </div>
                      ) : articlesError ? (
                        <div className="user-dashboard__section">
                          <div className="user-dashboard__error">
                            {ui?.dashboard?.errorLoadingArticles ?? 'Error loading articles'}:{' '}
                            {articlesError}
                          </div>
                        </div>
                      ) : articlesFromStore && articlesFromStore.length > 0 ? (
                        <div className="user-dashboard__section">
                          <div className="user-dashboard__albums-list">
                            {articlesFromStore.map((article, index) => {
                              const isExpanded = expandedArticleId === article.articleId;
                              const articleVisibility = normalizeTrackVisibility(
                                article.visibility
                              );
                              if (article.img && !article.userId) {
                                console.error('[BUG] article.userId missing', {
                                  articleId: article.articleId,
                                  context: 'articlesList',
                                });
                              }
                              const articleOwnerId = article.userId;
                              return (
                                <React.Fragment key={article.articleId}>
                                  <div
                                    id={`dashboard-article-row-${article.articleId}`}
                                    className={clsx('user-dashboard__album-item', {
                                      'user-dashboard__album-item--expanded': isExpanded,
                                      'user-dashboard__album-item--access-menu-open':
                                        articleAccessMenuArticleId === article.articleId,
                                    })}
                                    onClick={() =>
                                      setExpandedArticleId(isExpanded ? null : article.articleId)
                                    }
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setExpandedArticleId(isExpanded ? null : article.articleId);
                                      }
                                    }}
                                    aria-label={isExpanded ? 'Collapse article' : 'Expand article'}
                                  >
                                    <div className="user-dashboard__album-thumbnail user-dashboard__album-thumbnail--article">
                                      {article.img ? (
                                        articleOwnerId ? (
                                          <ArticleCoverImage
                                            img={article.img}
                                            userId={articleOwnerId}
                                            role="admin"
                                            alt={article.nameArticle}
                                            loading="lazy"
                                            decoding="async"
                                            debugLabel={`UserDashboard:articleThumb:${article.articleId}`}
                                          />
                                        ) : (
                                          <ArticleCoverPlaceholder
                                            alt={article.nameArticle}
                                            loading="lazy"
                                            decoding="async"
                                          />
                                        )
                                      ) : (
                                        <ArticleCoverPlaceholder
                                          alt={article.nameArticle}
                                          loading="lazy"
                                          decoding="async"
                                        />
                                      )}
                                    </div>
                                    <div className="user-dashboard__album-info">
                                      <div className="user-dashboard__album-title">
                                        {article.nameArticle}
                                      </div>
                                      {article.date ? (
                                        <div className="user-dashboard__album-date">
                                          {formatDate(article.date)}
                                        </div>
                                      ) : null}
                                    </div>
                                    <div
                                      className="user-dashboard__album-item-actions"
                                      onClick={(e) => e.stopPropagation()}
                                      onMouseDown={(e) => e.stopPropagation()}
                                    >
                                      <ArticleAccessControl
                                        articleId={article.articleId}
                                        visibility={articleVisibility}
                                        ui={ui ?? undefined}
                                        lang={lang}
                                        menuOpen={articleAccessMenuArticleId === article.articleId}
                                        onMenuOpenChange={(open) =>
                                          setArticleAccessMenuArticleId(
                                            open ? article.articleId : null
                                          )
                                        }
                                        onPickVisibility={(v) =>
                                          void handleArticleVisibilityChange(article.articleId, v)
                                        }
                                        getRowElement={() =>
                                          document.getElementById(
                                            `dashboard-article-row-${article.articleId}`
                                          )
                                        }
                                      />
                                      <div className="user-dashboard__album-arrow">
                                        <DashboardExpandChevron expanded={isExpanded} />
                                      </div>
                                    </div>
                                  </div>

                                  {isExpanded && (
                                    <div className="user-dashboard__album-expanded user-dashboard__album-expanded--article">
                                      {/* Article Cover Upload */}
                                      <div className="user-dashboard__article-cover-section">
                                        <label className="user-dashboard__article-cover-label">
                                          {ui?.dashboard?.articleCover ?? 'Article Cover'}
                                        </label>

                                        <input
                                          type="file"
                                          id={`article-cover-input-${article.articleId}`}
                                          accept="image/*"
                                          className="user-dashboard__article-cover-file-input"
                                          onChange={(e) =>
                                            handleArticleCoverFileInput(article.articleId, e)
                                          }
                                        />

                                        {(() => {
                                          const coverState = articleCoverUpload[article.articleId];
                                          const hasCover = article.img || coverState?.preview;

                                          if (hasCover) {
                                            return (
                                              <div className="user-dashboard__article-cover-wrap">
                                                <div className="user-dashboard__article-cover-preview-shell">
                                                  <div className="user-dashboard__article-cover-preview">
                                                    {coverState?.preview ? (
                                                      <img
                                                        src={coverState.preview}
                                                        alt="Article cover preview"
                                                        className="user-dashboard__article-cover-image"
                                                      />
                                                    ) : article.img && articleOwnerId ? (
                                                      <ArticleCoverImage
                                                        img={article.img}
                                                        userId={articleOwnerId}
                                                        role="admin"
                                                        alt="Article cover preview"
                                                        className="user-dashboard__article-cover-image"
                                                        debugLabel={`UserDashboard:articleCoverPreview:${article.articleId}`}
                                                      />
                                                    ) : (
                                                      <ArticleCoverPlaceholder
                                                        alt="Article cover preview"
                                                        className="user-dashboard__article-cover-image"
                                                      />
                                                    )}
                                                  </div>
                                                </div>

                                                <div className="user-dashboard__article-cover-actions">
                                                  <div className="user-dashboard__article-cover-buttons">
                                                    <label
                                                      htmlFor={`article-cover-input-${article.articleId}`}
                                                      className="user-dashboard__article-cover-button"
                                                    >
                                                      {ui?.dashboard?.replace ?? 'Replace'}
                                                    </label>
                                                  </div>

                                                  {coverState?.status === 'uploading' && (
                                                    <div className="user-dashboard__article-cover-status">
                                                      <div className="user-dashboard__article-cover-progress">
                                                        <div
                                                          className="user-dashboard__article-cover-progress-bar"
                                                          style={{
                                                            width: `${coverState.progress}%`,
                                                          }}
                                                        />
                                                      </div>
                                                      <span className="user-dashboard__article-cover-status-text">
                                                        {ui?.dashboard?.uploading ?? 'Uploading...'}
                                                      </span>
                                                    </div>
                                                  )}

                                                  {coverState?.status === 'uploaded' && (
                                                    <div className="user-dashboard__article-cover-status">
                                                      <span className="user-dashboard__article-cover-status-text user-dashboard__article-cover-status-text--success">
                                                        {ui?.dashboard?.uploaded ?? 'Uploaded'}
                                                      </span>
                                                    </div>
                                                  )}

                                                  {coverState?.status === 'error' &&
                                                    coverState.error && (
                                                      <div className="user-dashboard__article-cover-status">
                                                        <span className="user-dashboard__article-cover-status-text user-dashboard__article-cover-status-text--error">
                                                          {ui?.dashboard?.error ?? 'Error'}:{' '}
                                                          {coverState.error}
                                                        </span>
                                                      </div>
                                                    )}
                                                </div>
                                              </div>
                                            );
                                          }

                                          return (
                                            <div
                                              className={`user-dashboard__article-cover-dropzone ${coverState?.dragActive ? 'user-dashboard__article-cover-dropzone--active' : ''}`}
                                              onDragEnter={(e) =>
                                                handleArticleCoverDrag(article.articleId, e)
                                              }
                                              onDragLeave={(e) =>
                                                handleArticleCoverDrag(article.articleId, e)
                                              }
                                              onDragOver={(e) =>
                                                handleArticleCoverDrag(article.articleId, e)
                                              }
                                              onDrop={(e) =>
                                                handleArticleCoverDrop(article.articleId, e)
                                              }
                                            >
                                              <div className="user-dashboard__article-cover-dropzone-text">
                                                {ui?.dashboard?.dragImageHereOr ??
                                                  'Drag image here or'}
                                              </div>
                                              <label
                                                htmlFor={`article-cover-input-${article.articleId}`}
                                                className="user-dashboard__article-cover-file-label"
                                              >
                                                {ui?.dashboard?.chooseFile ?? 'Choose file'}
                                              </label>
                                            </div>
                                          );
                                        })()}
                                      </div>

                                      {(() => {
                                        const previewText = getArticlePreviewText(article);
                                        return previewText ? (
                                          <div className="user-dashboard__article-description">
                                            {previewText}
                                          </div>
                                        ) : null;
                                      })()}
                                      <div className="user-dashboard__article-actions">
                                        <button
                                          type="button"
                                          className="user-dashboard__edit-button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditArticleModal({
                                              isOpen: true,
                                              article: article,
                                            });
                                          }}
                                        >
                                          {ui?.dashboard?.editArticle ?? 'Edit Article'}
                                        </button>
                                        <button
                                          type="button"
                                          className="user-dashboard__delete-article-button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteArticle(article);
                                          }}
                                          title={ui?.dashboard?.deleteArticle ?? 'Delete article'}
                                          aria-label={
                                            ui?.dashboard?.deleteArticle ?? 'Delete article'
                                          }
                                        >
                                          {ui?.dashboard?.deleteArticle ?? 'Delete article'}
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {index < articlesFromStore.length - 1 && (
                                    <div className="user-dashboard__album-divider"></div>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>

                          <div className="user-dashboard__upload-action">
                            <button
                              type="button"
                              className="user-dashboard__upload-button"
                              onClick={openNewArticleEditor}
                            >
                              {ui?.dashboard?.uploadNewArticle ?? 'Upload New Article'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <ArticlesEmptyState ui={ui} onCreateArticle={openNewArticleEditor} />
                      )}
                    </div>
                    <div
                      className="user-dashboard__tab-panel"
                      hidden={activeTab !== 'profile'}
                      aria-hidden={activeTab !== 'profile'}
                    >
                      <div className="user-dashboard__profile-tab">
                        <div className="user-dashboard__section">
                          <div className="user-dashboard__profile-content">
                            <div
                              className={clsx('user-dashboard__profile-hero', {
                                'user-dashboard__profile-hero--public': isArtistPagePublic,
                                'user-dashboard__profile-hero--private': !isArtistPagePublic,
                              })}
                            >
                              <div className="user-dashboard__profile-hero-avatar-wrap">
                                <div className="user-dashboard__avatar-img">
                                  {isProfileAvatarPlaceholderUrl(avatarSrc) ? (
                                    <span
                                      className="user-dashboard__avatar-placeholder"
                                      aria-hidden="true"
                                    >
                                      {getProfileAvatarInitials()}
                                    </span>
                                  ) : (
                                    <img
                                      src={avatarSrc}
                                      srcSet={avatarRetinaSrc ? `${avatarRetinaSrc} 2x` : undefined}
                                      alt={ui?.dashboard?.profile ?? 'Profile'}
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                  )}
                                  {isUploadingAvatar && (
                                    <div
                                      className="user-dashboard__avatar-loader"
                                      aria-live="polite"
                                      aria-busy="true"
                                    >
                                      <div className="user-dashboard__avatar-spinner"></div>
                                    </div>
                                  )}
                                </div>
                                <div
                                  className="user-dashboard__avatar-actions"
                                  ref={avatarMenuContainerRef}
                                >
                                  <button
                                    type="button"
                                    className="user-dashboard__avatar-edit-floating"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setIsAvatarMenuOpen((open) => !open);
                                    }}
                                    disabled={isUploadingAvatar}
                                    aria-label={ui?.dashboard?.changeAvatar ?? 'Change avatar'}
                                    aria-haspopup="menu"
                                    aria-expanded={isAvatarMenuOpen}
                                    id="user-dashboard-avatar-edit-button"
                                  >
                                    <span
                                      className="user-dashboard__avatar-edit-icon"
                                      aria-hidden={true}
                                    >
                                      <PencilIcon {...dashboardActionIconProps({ size: 16 })} />
                                    </span>
                                  </button>
                                  {isAvatarMenuOpen && (
                                    <div
                                      className="user-dashboard__avatar-menu"
                                      role="menu"
                                      aria-labelledby="user-dashboard-avatar-edit-button"
                                    >
                                      <button
                                        type="button"
                                        role="menuitem"
                                        className="user-dashboard__avatar-menu-item"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setIsAvatarMenuOpen(false);
                                          handleAvatarClick();
                                        }}
                                        disabled={isUploadingAvatar}
                                      >
                                        {ui?.dashboard?.uploadAvatarPhoto ?? 'Upload the photo...'}
                                      </button>
                                      {!isProfileAvatarPlaceholderUrl(avatarSrc) ? (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          className="user-dashboard__avatar-menu-item"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setIsAvatarMenuOpen(false);
                                            void handleAvatarRemove();
                                          }}
                                          disabled={isUploadingAvatar}
                                        >
                                          {ui?.dashboard?.removeAvatarPhoto ?? 'Remove photo'}
                                        </button>
                                      ) : null}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <h2 className="user-dashboard__profile-hero-name">
                                <span>{user?.name?.trim() || '…'}</span>
                              </h2>

                              {isArtist ? (
                                <>
                                  <p
                                    className={clsx('user-dashboard__profile-hero-status', {
                                      'user-dashboard__profile-hero-status--public':
                                        isArtistPagePublic,
                                      'user-dashboard__profile-hero-status--private':
                                        !isArtistPagePublic,
                                    })}
                                  >
                                    <span
                                      className="user-dashboard__profile-hero-status-dot"
                                      aria-hidden="true"
                                    />
                                    {isArtistPagePublic
                                      ? (ui?.dashboard?.profileHero?.pagePublic ?? 'Page is public')
                                      : (ui?.dashboard?.profileHero?.pagePrivate ??
                                        'Page is private')}
                                  </p>

                                  <p className="user-dashboard__profile-hero-description">
                                    {isArtistPagePublic
                                      ? (ui?.dashboard?.profileHero?.publicDescription ??
                                        'Your artist page is now public\nand visible to everyone.')
                                      : (ui?.dashboard?.profileHero?.privateDescription ??
                                        'Only you can see your artist page right now.')}
                                  </p>
                                </>
                              ) : null}

                              {profilePublicSlug ? (
                                <button
                                  type="button"
                                  className="user-dashboard__profile-hero-open"
                                  onClick={() =>
                                    openOwnArtistPage(
                                      profilePublicSlug,
                                      isArtistPagePublic,
                                      navigate
                                    )
                                  }
                                >
                                  <span
                                    className="user-dashboard__profile-hero-open-icon"
                                    aria-hidden={true}
                                  >
                                    <ExternalLinkIcon {...dashboardActionIconProps()} />
                                  </span>
                                  {ui?.dashboard?.profileHero?.openArtistPage ?? 'Open artist page'}
                                </button>
                              ) : null}

                              <input
                                ref={avatarInputRef}
                                type="file"
                                accept="image/*"
                                style={{
                                  position: 'absolute',
                                  width: '1px',
                                  height: '1px',
                                  opacity: 0,
                                  pointerEvents: 'none',
                                }}
                                onChange={handleAvatarChange}
                              />
                            </div>

                            <div className="user-dashboard__profile-fields">
                              <div className="user-dashboard__field">
                                <label htmlFor="name">
                                  {ui?.dashboard?.profileFields?.name ?? 'Name'}
                                </label>
                                <input
                                  id="name"
                                  type="text"
                                  value={user?.name || ''}
                                  disabled
                                  readOnly
                                />
                              </div>

                              <div className="user-dashboard__field">
                                <label htmlFor="email">
                                  {ui?.dashboard?.profileFields?.email ?? 'Email'}
                                </label>
                                <input
                                  id="email"
                                  type="email"
                                  value={user?.email || ''}
                                  disabled
                                  readOnly
                                />
                                <ProfileEmailVerificationStatus verified={emailVerified} />
                              </div>
                            </div>

                            {isListener ? (
                              <p className="user-dashboard__profile-upgrade">
                                <span className="user-dashboard__profile-upgrade-lead">
                                  {ui?.dashboard?.becomeArtistLead ??
                                    (lang === 'en'
                                      ? 'Want to publish music?'
                                      : 'Хотите публиковать музыку?')}
                                </span>{' '}
                                <button
                                  type="button"
                                  className="user-dashboard__profile-upgrade-link"
                                  onClick={() => setIsUpgradeToArtistModalOpen(true)}
                                >
                                  {ui?.dashboard?.becomeArtist ??
                                    (lang === 'en'
                                      ? 'Upgrade to artist account'
                                      : 'Перейти на аккаунт артиста')}
                                </button>
                              </p>
                            ) : null}

                            <div className="user-dashboard__profile-actions">
                              <button
                                type="button"
                                className="user-dashboard__profile-settings-button"
                                onClick={() => setIsProfileSettingsModalOpen(true)}
                              >
                                {ui?.dashboard?.profileSettings ?? 'Настройки профиля'}
                              </button>
                              <button
                                type="button"
                                className="user-dashboard__delete-account-button"
                                onClick={() => setIsDeleteAccountModalOpen(true)}
                              >
                                {ui?.dashboard?.deleteAccount ?? 'Delete account'}
                              </button>
                            </div>
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
          syncedLyrics={previewLyricsModal.syncedLyrics}
          authorship={previewLyricsModal.authorship}
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
          onSave={async () => {
            // Перезагружаем альбомы из БД, чтобы получить актуальные синхронизированные тексты
            try {
              await dispatch(fetchAlbums({ force: true, ownerDashboard: true })).unwrap();
            } catch (error) {
              console.error('❌ Error reloading albums after sync save:', error);
            }
          }}
        />
      )}

      {/* Edit Track Modal */}
      {editTrackModal && (
        <>
          <Popup
            isActive={editTrackModal.isOpen}
            onClose={() => editTrackCloseGuard.requestClose()}
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
                    ×
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
                <div className="edit-track-modal__footer">
                  <button
                    type="button"
                    className="edit-track-modal__cancel"
                    onClick={() => editTrackCloseGuard.requestClose()}
                  >
                    {ui?.dashboard?.cancel ?? 'Cancel'}
                  </button>
                  <button
                    type="button"
                    className="edit-track-modal__save"
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
                  </button>
                </div>
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
                // Добавляем authorship из кеша
                transformedAlbums.forEach((album) => {
                  album.tracks.forEach((track) => {
                    if (!track.authorship) {
                      const cachedAuthorship = getCachedAuthorship(album.albumId, track.id, lang);
                      if (cachedAuthorship) {
                        track.authorship = cachedAuthorship;
                      }
                    }
                  });
                });

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
        />
      )}

      {/* Profile Settings Modal */}
      <ProfileSettingsModal
        isOpen={isProfileSettingsModalOpen}
        onClose={() => setIsProfileSettingsModalOpen(false)}
        userName={user?.name ?? undefined}
        userEmail={user?.email}
        emailVerified={emailVerified}
        initialTab={profileSettingsInitialTab}
        showBecomeArtist={isListener}
        onBecomeArtist={() => {
          setIsProfileSettingsModalOpen(false);
          setIsUpgradeToArtistModalOpen(true);
        }}
      />

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
  );
}

export default UserDashboard;
