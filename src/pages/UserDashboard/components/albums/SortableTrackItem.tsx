import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  DASHBOARD_ROW_STATE_FLASH_CLASS,
  DASHBOARD_ROW_FLASH_RGB_VAR,
  getDashboardRowStateFlashRgb,
  type DashboardRowFlash,
} from '../../lib/dashboardRowStateFlash';

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
  onDelete: (albumId: string, trackId: string, trackTitle: string) => void;
  onEdit?: (albumId: string, trackId: string, trackTitle: string) => void;
  onTitleChange?: (albumId: string, trackId: string, newTitle: string) => Promise<void>;
  onVisibilityChange: (
    albumId: string,
    trackId: string,
    visibility: TrackVisibility
  ) => Promise<void>;
  rowFlash?: DashboardRowFlash;
  ui?: IInterface;
};

export function SortableTrackItem({
  track,
  displayIndex,
  albumId,
  onDelete,
  onEdit,
  onTitleChange,
  onVisibilityChange,
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

  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
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
        className={clsx('user-dashboard__track-item-wrapper', 'dashboard-track-row', {
          'user-dashboard__track-item-wrapper--dragging': isDragging,
        })}
      >
        <div className="user-dashboard__track-item-content">
          <div
            id={`dashboard-track-row-${track.id}`}
            className={clsx('user-dashboard__track-item', trackRowFlashProps.className, {
              'user-dashboard__track-item--dragging': isDragging,
              'user-dashboard__track-item--access-menu-open': accessMenuOpen,
            })}
            style={trackRowFlashProps.style}
            data-visibility-flash={trackRowFlashProps['data-visibility-flash']}
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
