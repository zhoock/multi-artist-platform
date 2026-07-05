import React, { useCallback, useMemo } from 'react';
import clsx from 'clsx';
import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { TrackVisibilityIcon } from '@shared/ui/icons/TrackVisibilityIcon';
import { buildAlbumVisibilityMenuOptions } from './albumVisibilityOptions';
import {
  DashboardAccessMenuPortal,
  resolveDashboardAccessMenuPortalFromElement,
  useDashboardAccessMenu,
} from '../../lib/useDashboardAccessMenu';

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
  const { triggerRef, menuRef, menuStyle, portalMount, toggleMenu, closeMenu } =
    useDashboardAccessMenu({
      open: menuOpen,
      onOpenChange: onMenuOpenChange,
      repositionKey: albumId,
      getPortalRoot: (_trigger) => resolveDashboardAccessMenuPortalFromElement(getRowElement()),
    });

  const albumAccessAria =
    (ui?.dashboard as DashboardUi | undefined)?.albumAccessAriaLabel ??
    (lang === 'en' ? 'Album visibility' : 'Видимость альбома');

  const menuOptions = useMemo(
    () => buildAlbumVisibilityMenuOptions(ui, lang),
    [ui?.dashboard, lang]
  );

  const pickVisibility = useCallback(
    async (v: Extract<TrackVisibility, 'public' | 'hidden'>) => {
      if (v === visibility) {
        closeMenu();
        return;
      }
      await onPickVisibility(v);
      closeMenu();
    },
    [visibility, onPickVisibility, closeMenu]
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={buttonClassName ?? 'user-dashboard__article-access-button'}
        onClick={toggleMenu}
        onMouseDown={(e) => e.stopPropagation()}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={albumAccessAria}
      >
        <span className="user-dashboard__article-access-button-icon" aria-hidden>
          <TrackVisibilityIcon visibility={visibility} />
        </span>
      </button>

      <DashboardAccessMenuPortal
        menuRef={menuRef}
        open={menuOpen}
        portalMount={portalMount}
        menuStyle={menuStyle}
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
              <span className="user-dashboard__track-access-menu-item-desc">{opt.description}</span>
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
      </DashboardAccessMenuPortal>
    </>
  );
}
