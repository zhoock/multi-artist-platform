import React, { useCallback, useMemo } from 'react';
import clsx from 'clsx';
import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { TrackVisibilityIcon } from '@shared/ui/icons/TrackVisibilityIcon';
import { buildAlbumVisibilityMenuOptions } from './albumVisibilityOptions';
import { DashboardVisibilityMenuItem } from '../../lib/DashboardVisibilityMenuItem';
import {
  DashboardAccessMenuPortal,
  resolveDashboardAccessMenuPortalFromElement,
  useDashboardAccessMenu,
} from '../../lib/useDashboardAccessMenu';

type DashboardUi = NonNullable<IInterface['dashboard']> & {
  albumAccessAriaLabel?: string;
  albumCopyrightRestrictedHint?: string;
};

export type AlbumAccessControlProps = {
  albumId: string;
  visibility: Extract<TrackVisibility, 'public' | 'hidden'>;
  /** When true, show red/hidden orb and block changing visibility (admin copyright hold). */
  copyrightRestricted?: boolean;
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
  copyrightRestricted = false,
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
      disabled: copyrightRestricted,
      repositionKey: albumId,
      getPortalRoot: (_trigger) => resolveDashboardAccessMenuPortalFromElement(getRowElement()),
    });

  const albumAccessAria =
    (ui?.dashboard as DashboardUi | undefined)?.albumAccessAriaLabel ?? 'Album visibility';

  const copyrightHint =
    (ui?.dashboard as DashboardUi | undefined)?.albumCopyrightRestrictedHint ??
    (lang === 'en'
      ? 'Album temporarily hidden by administration'
      : 'Альбом временно скрыт администрацией');

  const orbVisibility: Extract<TrackVisibility, 'public' | 'hidden'> = copyrightRestricted
    ? 'hidden'
    : visibility;

  const menuOptions = useMemo(
    () => buildAlbumVisibilityMenuOptions(ui, lang),
    [ui?.dashboard, lang]
  );

  const pickVisibility = useCallback(
    async (v: Extract<TrackVisibility, 'public' | 'hidden'>) => {
      if (copyrightRestricted) {
        return;
      }
      if (v === visibility) {
        closeMenu();
        return;
      }
      closeMenu();
      void onPickVisibility(v);
    },
    [visibility, onPickVisibility, closeMenu, copyrightRestricted]
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={clsx(
          buttonClassName ?? 'user-dashboard__article-access-button',
          copyrightRestricted && 'user-dashboard__article-access-button--disabled'
        )}
        onClick={toggleMenu}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={copyrightRestricted}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-disabled={copyrightRestricted ? true : undefined}
        aria-label={albumAccessAria}
        title={copyrightRestricted ? copyrightHint : undefined}
      >
        <span className="user-dashboard__article-access-button-icon" aria-hidden>
          <TrackVisibilityIcon visibility={orbVisibility} />
        </span>
      </button>

      <DashboardAccessMenuPortal
        menuRef={menuRef}
        open={menuOpen}
        portalMount={portalMount}
        menuStyle={menuStyle}
      >
        {menuOptions.map((opt) => (
          <DashboardVisibilityMenuItem
            key={opt.value}
            visibility={opt.value}
            label={opt.label}
            description={opt.description}
            selected={opt.value === visibility}
            onSelect={() => void pickVisibility(opt.value)}
          />
        ))}
      </DashboardAccessMenuPortal>
    </>
  );
}
