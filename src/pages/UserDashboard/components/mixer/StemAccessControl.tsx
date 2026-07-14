// src/pages/UserDashboard/components/mixer/StemAccessControl.tsx
import React, { useCallback, useMemo } from 'react';
import clsx from 'clsx';
import type { IInterface } from '@models';
import { useLang } from '@app/providers/lang';
import {
  STEMS_VISIBILITY_OPTIONS,
  normalizeStemsVisibility,
  type StemsVisibility,
} from '@shared/lib/stems/stemsVisibility';
import {
  filterVisibilityOptionsByMonetization,
  resolveEffectiveContentVisibility,
} from '@shared/lib/payment/artistMonetization';
import { useArtistMonetization } from '@shared/lib/payment/ArtistMonetizationContext';
import { TrackVisibilityIcon } from '@shared/ui/icons/TrackVisibilityIcon';
import {
  DashboardAccessMenuPortal,
  resolveDashboardAccessMenuPortalFromElement,
  useDashboardAccessMenu,
} from '../../lib/useDashboardAccessMenu';

type StemAccessControlProps = {
  albumId: string;
  trackId: string;
  visibility: StemsVisibility;
  onVisibilityChange: (albumId: string, trackId: string, visibility: StemsVisibility) => void;
  ui?: IInterface;
  /** Контейнер для portal (dialog popup или body). */
  portalRoot?: HTMLElement | null;
};

export function StemAccessControl({
  albumId,
  trackId,
  visibility,
  onVisibilityChange,
  ui,
  portalRoot,
}: StemAccessControlProps) {
  const { lang } = useLang();
  const { monetizationEnabled } = useArtistMonetization();
  const rawStemsVisibility = normalizeStemsVisibility(visibility);
  const stemsVisibility = resolveEffectiveContentVisibility(
    rawStemsVisibility,
    monetizationEnabled
  );

  const { triggerRef, menuRef, menuOpen, menuStyle, portalMount, toggleMenu, closeMenu } =
    useDashboardAccessMenu({
      getPortalRoot: (trigger) =>
        portalRoot ??
        resolveDashboardAccessMenuPortalFromElement(trigger, {
          preferUserDashboard: true,
        }),
    });

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

    return filterVisibilityOptionsByMonetization(
      STEMS_VISIBILITY_OPTIONS.map((opt) => {
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
      }),
      monetizationEnabled
    );
  }, [lang, monetizationEnabled, t?.stemsVisibility]);

  const ariaLabel =
    (t?.stemsAccessAriaLabel as string | undefined) ??
    (lang === 'en' ? 'Stem access' : 'Доступ к стемам');

  const pickVisibility = useCallback(
    (v: StemsVisibility) => {
      if (v === rawStemsVisibility) {
        closeMenu();
        return;
      }
      void onVisibilityChange(albumId, trackId, v);
      closeMenu();
    },
    [albumId, trackId, rawStemsVisibility, onVisibilityChange, closeMenu]
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="user-dashboard__article-access-button user-dashboard__expanded-track-access-slot"
        onClick={toggleMenu}
        onMouseDown={(e) => e.stopPropagation()}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label={ariaLabel}
      >
        <span className="user-dashboard__article-access-button-icon" aria-hidden>
          <TrackVisibilityIcon visibility={stemsVisibility} />
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
              <span className="user-dashboard__track-access-menu-item-desc">{opt.description}</span>
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
      </DashboardAccessMenuPortal>
    </>
  );
}
