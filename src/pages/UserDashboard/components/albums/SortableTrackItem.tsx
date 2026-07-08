import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pencil as PencilIcon, Trash2 as Trash2Icon } from 'lucide-react';

import type { TrackData } from '@entities/album/lib/transformAlbumData';
import type { IInterface, DashboardTrackVisibilityLabels } from '@models';
import { useLang } from '@app/providers/lang';
import {
  TRACK_VISIBILITY_OPTIONS,
  normalizeTrackVisibility,
  type TrackVisibility,
} from '@shared/lib/tracks/trackVisibility';
import { TrackVisibilityIcon } from '@shared/ui/icons/TrackVisibilityIcon';
import { DashboardCard, DashboardIconButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  DASHBOARD_ROW_STATE_FLASH_CLASS,
  DASHBOARD_ROW_FLASH_RGB_VAR,
  getDashboardRowStateFlashRgb,
  type DashboardRowFlash,
} from '../../lib/dashboardRowStateFlash';
import {
  DashboardAccessMenuPortal,
  resolveDashboardAccessMenuPortalFromElement,
  useDashboardAccessMenu,
} from '../../lib/useDashboardAccessMenu';
import { DashboardExpandChevron } from '../../lib/dashboardExpandChevron';
import { TrackLyricsPanel } from './TrackLyricsPanel';
import type { LyricsAction } from './trackLyricsHelpers';

type DashboardUi = NonNullable<IInterface['dashboard']>;
type DashboardUiWithTrackAccess = DashboardUi & {
  trackVisibility?: DashboardTrackVisibilityLabels;
  trackAccessAriaLabel?: string;
};

export type SortableTrackItemProps = {
  track: TrackData;
  /** Порядковый номер для UI (1-based), не путать с track.id (UUID) */
  displayIndex: number;
  albumId: string;
  lyricsAlbumId: string;
  isOpen: boolean;
  onToggle: () => void;
  onDelete: (albumId: string, trackId: string, trackTitle: string) => void;
  onEdit?: (albumId: string, trackId: string, trackTitle: string) => void;
  onTitleChange?: (albumId: string, trackId: string, newTitle: string) => Promise<void>;
  onVisibilityChange: (
    albumId: string,
    trackId: string,
    visibility: TrackVisibility
  ) => Promise<void>;
  onLyricsAction: (
    action: LyricsAction,
    albumId: string,
    trackId: string,
    trackTitle: string
  ) => void;
  rowFlash?: DashboardRowFlash;
  ui?: IInterface;
};

export function SortableTrackItem({
  track,
  displayIndex,
  albumId,
  lyricsAlbumId,
  isOpen,
  onToggle,
  onDelete,
  onEdit,
  onTitleChange,
  onVisibilityChange,
  onLyricsAction,
  rowFlash,
  ui,
}: SortableTrackItemProps) {
  const { lang } = useLang();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.id,
  });

  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(track.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const {
    triggerRef: accessBtnRef,
    menuRef: accessMenuRef,
    menuOpen: accessMenuOpen,
    menuStyle,
    portalMount: trackAccessPortalMount,
    toggleMenu: toggleAccessMenu,
    closeMenu: closeAccessMenu,
  } = useDashboardAccessMenu({
    getPortalRoot: (_trigger) => resolveDashboardAccessMenuPortalFromElement(containerRef.current),
  });
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

  useEffect(() => {
    if (isEditing && inputRef.current) {
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
      await onTitleChange(albumId, track.id, editedTitle.trim());
    } else if (editedTitle.trim() === '') {
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

  const handleHeaderClick = () => {
    if (isEditing) {
      return;
    }
    onToggle();
  };

  const handleHeaderKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleHeaderClick();
    }
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [setNodeRef]
  );

  const trackRowFlashProps = rowFlash
    ? {
        className: DASHBOARD_ROW_STATE_FLASH_CLASS,
        style: {
          [DASHBOARD_ROW_FLASH_RGB_VAR]: getDashboardRowStateFlashRgb(rowFlash.visibility),
        } as React.CSSProperties,
        'data-visibility-flash': rowFlash.visibility,
      }
    : {};

  return (
    <>
      <div
        ref={combinedRef}
        style={style}
        className={clsx('albums-tab__track-row', 'dashboard-track-row', {
          'albums-tab__track-row--dragging': isDragging,
          [trackRowFlashProps.className ?? '']: Boolean(trackRowFlashProps.className),
        })}
        id={`dashboard-track-row-${track.id}`}
        data-visibility-flash={trackRowFlashProps['data-visibility-flash']}
      >
        <DashboardCard
          as="article"
          interactive
          className={clsx('albums-tab__track-card', isOpen && 'albums-tab__track-card--expanded')}
          style={trackRowFlashProps.style}
        >
          <div
            className={clsx('albums-tab__track-header', {
              'albums-tab__track-header--access-menu-open': accessMenuOpen,
            })}
            role="button"
            tabIndex={0}
            aria-expanded={isOpen}
            onClick={handleHeaderClick}
            onKeyDown={handleHeaderKeyDown}
          >
            <div
              {...attributes}
              {...listeners}
              className="albums-tab__track-drag-handle user-dashboard__track-drag-handle"
              title={ui?.dashboard?.dragToReorder ?? 'Drag to reorder'}
              aria-label={ui?.dashboard?.dragToReorder ?? 'Drag to reorder'}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <span className="user-dashboard__track-drag-icon">⋮⋮</span>
            </div>

            <span className="albums-tab__track-chevron" aria-hidden>
              <DashboardExpandChevron expanded={isOpen} />
            </span>

            <span className="albums-tab__track-number">
              {String(displayIndex).padStart(2, '0')}
            </span>

            {isEditing ? (
              <input
                key={`edit-${track.id}-${isEditing}`}
                ref={inputRef}
                type="text"
                className="user-dashboard__track-title-input albums-tab__track-title-input"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={handleTitleKeyDown}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="albums-tab__track-title">{track.title}</span>
            )}

            {!isEditing ? (
              <>
                <span className="albums-tab__track-duration">{track.duration}</span>

                <button
                  ref={accessBtnRef}
                  type="button"
                  className="albums-tab__track-access-button user-dashboard__track-access-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAccessMenu(e);
                  }}
                  aria-expanded={accessMenuOpen}
                  aria-haspopup="menu"
                  aria-label={trackAccessAria}
                >
                  <span className="user-dashboard__track-access-button-icon" aria-hidden>
                    <TrackVisibilityIcon visibility={trackVisibility} size={18} />
                  </span>
                </button>

                <div className="albums-tab__track-actions">
                  <DashboardIconButton
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(e);
                    }}
                    aria-label={ui?.dashboard?.editTrack ?? 'Edit track'}
                  >
                    <PencilIcon {...dashboardActionIconProps()} />
                  </DashboardIconButton>
                  <DashboardIconButton
                    destructive
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(e);
                    }}
                    aria-label={ui?.dashboard?.deleteTrack ?? 'Delete track'}
                  >
                    <Trash2Icon {...dashboardActionIconProps()} />
                  </DashboardIconButton>
                </div>
              </>
            ) : (
              <span className="albums-tab__track-duration">{track.duration}</span>
            )}
          </div>

          {isOpen ? (
            <div className="albums-tab__track-body">
              <TrackLyricsPanel
                track={track}
                albumId={lyricsAlbumId}
                ui={ui ?? null}
                lang={lang}
                onLyricsAction={onLyricsAction}
              />
            </div>
          ) : null}
        </DashboardCard>
      </div>

      <DashboardAccessMenuPortal
        menuRef={accessMenuRef}
        open={accessMenuOpen}
        portalMount={trackAccessPortalMount}
        menuStyle={menuStyle}
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
              <span className="user-dashboard__track-access-menu-item-desc">{opt.description}</span>
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
      </DashboardAccessMenuPortal>
    </>
  );
}
