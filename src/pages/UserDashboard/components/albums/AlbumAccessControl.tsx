import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { TrackVisibilityIcon } from '@shared/ui/icons/TrackVisibilityIcon';
import { buildAlbumVisibilityMenuOptions } from './albumVisibilityOptions';

type DashboardUi = NonNullable<IInterface['dashboard']> & {
  albumAccessAriaLabel?: string;
};

export type AlbumAccessControlProps = {
  albumId: string;
  visibility: Extract<TrackVisibility, 'public' | 'hidden'>;
  ui: IInterface | undefined;
  lang: SupportedLang;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onPickVisibility: (v: Extract<TrackVisibility, 'public' | 'hidden'>) => void | Promise<void>;
  getRowElement: () => HTMLElement | null;
  buttonClassName?: string;
};

export function AlbumAccessControl({
  albumId,
  visibility,
  ui,
  lang,
  menuOpen,
  onMenuOpenChange,
  onPickVisibility,
  getRowElement,
  buttonClassName,
}: AlbumAccessControlProps) {
  const accessBtnRef = useRef<HTMLButtonElement>(null);
  const accessMenuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const albumAccessAria =
    (ui?.dashboard as DashboardUi | undefined)?.albumAccessAriaLabel ??
    (lang === 'en' ? 'Album visibility' : 'Видимость альбома');

  const menuOptions = useMemo(
    () => buildAlbumVisibilityMenuOptions(ui, lang),
    [ui?.dashboard, lang]
  );

  const updateAccessMenuPosition = useCallback(() => {
    const el = accessBtnRef.current;
    if (!el || !menuOpen) return;
    const r = el.getBoundingClientRect();
    const menuWidth = 268;
    setMenuPos({
      top: r.bottom + 4,
      left: Math.min(r.left, window.innerWidth - menuWidth - 8),
    });
  }, [menuOpen]);

  const closeAccessMenu = useCallback(() => {
    onMenuOpenChange(false);
    setMenuPos(null);
  }, [onMenuOpenChange]);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    updateAccessMenuPosition();
  }, [menuOpen, updateAccessMenuPosition, albumId]);

  useEffect(() => {
    if (!menuOpen) return;
    window.addEventListener('scroll', updateAccessMenuPosition, true);
    window.addEventListener('resize', updateAccessMenuPosition);
    return () => {
      window.removeEventListener('scroll', updateAccessMenuPosition, true);
      window.removeEventListener('resize', updateAccessMenuPosition);
    };
  }, [menuOpen, updateAccessMenuPosition]);

  useEffect(() => {
    if (!menuOpen) return;
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
  }, [menuOpen, closeAccessMenu]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAccessMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, closeAccessMenu]);

  const toggleAccessMenu = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (menuOpen) {
        closeAccessMenu();
        return;
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
      onMenuOpenChange(true);
    },
    [menuOpen, closeAccessMenu, onMenuOpenChange]
  );

  const pickVisibility = useCallback(
    async (v: Extract<TrackVisibility, 'public' | 'hidden'>) => {
      if (v === visibility) {
        closeAccessMenu();
        return;
      }
      await onPickVisibility(v);
      closeAccessMenu();
    },
    [visibility, onPickVisibility, closeAccessMenu]
  );

  let trackAccessPortalMount: HTMLElement | null = null;
  if (typeof document !== 'undefined') {
    const row = getRowElement();
    trackAccessPortalMount =
      (row?.closest?.('dialog.popup') as HTMLElement | null) ??
      (row?.closest?.('dialog') as HTMLElement | null) ??
      document.body;
  }

  return (
    <>
      <button
        ref={accessBtnRef}
        type="button"
        className={buttonClassName ?? 'user-dashboard__article-access-button'}
        onClick={toggleAccessMenu}
        onMouseDown={(e) => e.stopPropagation()}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={albumAccessAria}
      >
        <span className="user-dashboard__article-access-button-icon" aria-hidden>
          <TrackVisibilityIcon visibility={visibility} />
        </span>
      </button>

      {menuOpen &&
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
            {menuOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="menuitem"
                className={clsx('user-dashboard__track-access-menu-item', {
                  'user-dashboard__track-access-menu-item--active': opt.value === visibility,
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
                {opt.value === visibility ? (
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
