import React, { useCallback, useMemo } from 'react';
import clsx from 'clsx';
import type { IInterface, DashboardTrackVisibilityLabels } from '@models';
import type { SupportedLang } from '@shared/model/lang';
import type { TrackVisibility } from '@shared/lib/tracks/trackVisibility';
import { TrackVisibilityIcon } from '@shared/ui/icons/TrackVisibilityIcon';
import { resolveEffectiveContentVisibility } from '@shared/lib/payment/artistMonetization';
import { useArtistMonetization } from '@shared/lib/payment/ArtistMonetizationContext';
import { buildArticleVisibilityMenuOptions } from './articleVisibilityOptions';
import {
  DashboardAccessMenuPortal,
  resolveDashboardAccessMenuPortalFromElement,
  useDashboardAccessMenu,
} from '../../lib/useDashboardAccessMenu';

type DashboardUi = NonNullable<IInterface['dashboard']>;
type DashboardUiWithTrackAccess = DashboardUi & {
  trackVisibility?: DashboardTrackVisibilityLabels;
  articleVisibility?: DashboardTrackVisibilityLabels;
  trackAccessAriaLabel?: string;
  articleAccessAriaLabel?: string;
};

export type ArticleAccessControlProps = {
  articleId: string;
  visibility: TrackVisibility;
  ui: IInterface | undefined;
  lang: SupportedLang;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onPickVisibility: (v: TrackVisibility) => void | Promise<void>;
  /** Элемент строки статьи (для портала в dialog). */
  getRowElement: () => HTMLElement | null;
  buttonClassName?: string;
};

export function ArticleAccessControl({
  articleId,
  visibility,
  ui,
  lang,
  menuOpen,
  onMenuOpenChange,
  onPickVisibility,
  getRowElement,
  buttonClassName,
}: ArticleAccessControlProps) {
  const { monetizationEnabled } = useArtistMonetization();
  const { triggerRef, menuRef, menuStyle, portalMount, toggleMenu, closeMenu } =
    useDashboardAccessMenu({
      open: menuOpen,
      onOpenChange: onMenuOpenChange,
      repositionKey: articleId,
      getPortalRoot: (_trigger) => resolveDashboardAccessMenuPortalFromElement(getRowElement()),
    });

  const trackAccessAria =
    (ui?.dashboard as DashboardUiWithTrackAccess | undefined)?.articleAccessAriaLabel ??
    (ui?.dashboard as DashboardUiWithTrackAccess | undefined)?.trackAccessAriaLabel ??
    (lang === 'en' ? 'Article access' : 'Доступ к статье');

  const menuOptions = useMemo(
    () => buildArticleVisibilityMenuOptions(ui, lang, monetizationEnabled),
    [ui?.dashboard, lang, monetizationEnabled]
  );

  const displayVisibility = resolveEffectiveContentVisibility(visibility, monetizationEnabled);

  const pickVisibility = useCallback(
    async (v: TrackVisibility) => {
      if (v === visibility) {
        closeMenu();
        return;
      }
      closeMenu();
      void onPickVisibility(v);
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
        aria-label={trackAccessAria}
      >
        <span className="user-dashboard__article-access-button-icon" aria-hidden>
          <TrackVisibilityIcon visibility={displayVisibility} />
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
              'user-dashboard__track-access-menu-item--active': opt.value === displayVisibility,
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
            {opt.value === displayVisibility ? (
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
