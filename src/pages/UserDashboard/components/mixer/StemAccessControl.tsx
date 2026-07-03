// src/pages/UserDashboard/components/mixer/StemAccessControl.tsx
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import type { IInterface } from '@models';
import { useLang } from '@app/providers/lang';
import {
  STEMS_VISIBILITY_OPTIONS,
  normalizeStemsVisibility,
  type StemsVisibility,
} from '@shared/lib/stems/stemsVisibility';
import { TrackVisibilityIcon } from '@shared/ui/icons/TrackVisibilityIcon';

type StemAccessControlProps = {
  albumId: string;
  trackId: string;
  visibility: StemsVisibility;
  onVisibilityChange: (albumId: string, trackId: string, visibility: StemsVisibility) => void;
  ui?: IInterface;
  /** Контейнер для portal (dialog popup или body). */
  portalRoot?: HTMLElement | null;
};

/** Меню должно быть внутри `<dialog>` (top layer) и `.user-dashboard` (стили). */
function resolveAccessMenuPortalRoot(anchor: HTMLElement | null): HTMLElement | null {
  if (typeof document === 'undefined' || !anchor) return null;
  const dialog =
    (anchor.closest('dialog.popup') as HTMLElement | null) ??
    (anchor.closest('dialog') as HTMLElement | null);
  if (dialog) {
    return (dialog.querySelector('.user-dashboard') as HTMLElement | null) ?? dialog;
  }
  return document.body;
}

export function StemAccessControl({
  albumId,
  trackId,
  visibility,
  onVisibilityChange,
  ui,
  portalRoot,
}: StemAccessControlProps) {
  const { lang } = useLang();
  const stemsVisibility = normalizeStemsVisibility(visibility);
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const t = (ui as { dashboard?: { mixer?: Record<string, unknown> } } | undefined)?.dashboard
    ?.mixer;

  const menuOptions = useMemo(() => {
    const labels = t?.stemsVisibility as
      | {
          public?: { title?: string; description?: string };
          subscribersOnly?: { title?: string; description?: string };
          hidden?: { title?: string; description?: string };
        }
      | undefined;
    const en = lang === 'en';
    const fallbacks = {
      public: {
        title: en ? 'Open to everyone' : 'Открыт для всех',
        description: en
          ? 'Stems are available to all visitors.'
          : 'Стемы доступны всем посетителям.',
      },
      subscribersOnly: {
        title: en ? 'Subscribers only' : 'Только для подписчиков',
        description: en
          ? 'Only subscribers can access these stems.'
          : 'Стемы доступны только подписчикам.',
      },
      hidden: {
        title: en ? 'Hidden' : 'Скрыт',
        description: en
          ? 'Stems are hidden from the public Mixer.'
          : 'Стемы скрыты из публичного Mixer.',
      },
    } as const;

    return STEMS_VISIBILITY_OPTIONS.map((opt) => {
      const block =
        opt.value === 'public'
          ? labels?.public
          : opt.value === 'hidden'
            ? labels?.hidden
            : labels?.subscribersOnly;
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
  }, [lang, t?.stemsVisibility]);

  const ariaLabel =
    (t?.stemsAccessAriaLabel as string | undefined) ??
    (lang === 'en' ? 'Stem access' : 'Доступ к стемам');

  const updateMenuPosition = useCallback(() => {
    const el = btnRef.current;
    if (!el || !menuOpen) return;
    const r = el.getBoundingClientRect();
    const menuWidth = 268;
    setMenuPos({
      top: r.bottom + 4,
      left: Math.min(r.left, window.innerWidth - menuWidth - 8),
    });
  }, [menuOpen]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuPos(null);
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    updateMenuPosition();
  }, [menuOpen, updateMenuPosition]);

  useEffect(() => {
    if (!menuOpen) return;
    window.addEventListener('scroll', updateMenuPosition, true);
    window.addEventListener('resize', updateMenuPosition);
    return () => {
      window.removeEventListener('scroll', updateMenuPosition, true);
      window.removeEventListener('resize', updateMenuPosition);
    };
  }, [menuOpen, updateMenuPosition]);

  useEffect(() => {
    if (!menuOpen) return;
    let detached: (() => void) | null = null;
    let cancelled = false;

    const scheduleId = window.setTimeout(() => {
      if (cancelled) return;
      const onDown = (e: MouseEvent | TouchEvent) => {
        const target = e.target as Node;
        if (btnRef.current?.contains(target)) return;
        if (menuRef.current?.contains(target)) return;
        closeMenu();
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
  }, [menuOpen, closeMenu]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen, closeMenu]);

  const toggleMenu = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setMenuOpen((wasOpen) => {
      if (wasOpen) {
        setMenuPos(null);
        return false;
      }
      const el = btnRef.current;
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
    (v: StemsVisibility) => {
      if (v === stemsVisibility) {
        closeMenu();
        return;
      }
      void onVisibilityChange(albumId, trackId, v);
      closeMenu();
    },
    [albumId, trackId, stemsVisibility, onVisibilityChange, closeMenu]
  );

  const mount =
    portalRoot ??
    (typeof document !== 'undefined' ? resolveAccessMenuPortalRoot(btnRef.current) : null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="user-dashboard__track-access-button mixer-admin__stem-access-button"
        onClick={toggleMenu}
        onMouseDown={(e) => e.stopPropagation()}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={ariaLabel}
      >
        <span className="user-dashboard__track-access-button-icon" aria-hidden>
          <TrackVisibilityIcon visibility={stemsVisibility} size={18} />
        </span>
      </button>
      {menuOpen &&
        mount != null &&
        createPortal(
          <div
            ref={menuRef}
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
                  'user-dashboard__track-access-menu-item--active': opt.value === stemsVisibility,
                })}
                onClick={(e) => {
                  e.stopPropagation();
                  pickVisibility(opt.value);
                }}
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
                {opt.value === stemsVisibility ? (
                  <span className="user-dashboard__track-access-menu-check" aria-hidden>
                    ✓
                  </span>
                ) : (
                  <span className="user-dashboard__track-access-menu-check-spacer" aria-hidden />
                )}
              </button>
            ))}
          </div>,
          mount
        )}
    </>
  );
}
