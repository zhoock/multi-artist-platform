import clsx from 'clsx';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { clearAuth } from '@shared/lib/auth';
import { useArchiveAccessModal } from '@shared/lib/archiveAccessModal';
import { useStoredProfileAvatarUrl, getProfileAvatarInitials } from '@shared/lib/hooks/useAvatar';
import { useOwnArtistPageSummary } from '@shared/lib/hooks/useOwnArtistPageSummary';
import { buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang/buildLocalizedPublicPath';
import { openOwnArtistPage } from '@shared/lib/ownArtistPage';
import { isProfileAvatarPlaceholderUrl } from '@shared/lib/avatarUpload';
import {
  IconArtistPage,
  IconCollection,
  IconLogOut,
  IconSettings,
  IconUpgradeSparkle,
} from './headerProfileMenuIcons';
import { usePremiumSubscription } from '@features/premiumSubscription';
import { formatCollectionMenuSubtitle } from '@shared/lib/payment/subscriptionPlans';
import { COLLECTION_DASHBOARD_PATH } from '@shared/lib/accountType';
import './profileAvatarMenu.scss';

export type ProfileAvatarMenuProps = {
  /** Когда меню языка в шапке открыто — закрываем дропдаун профиля */
  closeWhenLangMenuOpen?: boolean;
  /** Уведомление родителя при открытии/закрытии (например, закрыть язык при открытии профиля) */
  onOpenChange?: (open: boolean) => void;
  /** Дополнительный класс для img аватара (например модификатор главной) */
  avatarImgClassName?: string;
};

function ProfileAvatarMenuComponent({
  closeWhenLangMenuOpen = false,
  onOpenChange,
  avatarImgClassName,
}: ProfileAvatarMenuProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { isPremium, planSlug, slotsUsed } = usePremiumSubscription();
  const { open: openPremiumModal } = useArchiveAccessModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const avatarSrc = useStoredProfileAvatarUrl();
  const ownArtistPage = useOwnArtistPageSummary();

  const dashboardLinkState = { backgroundLocation: location };

  const updateOpen = useCallback(
    (next: boolean) => {
      setMenuOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );

  useEffect(() => {
    if (closeWhenLangMenuOpen) updateOpen(false);
  }, [closeWhenLangMenuOpen, updateOpen]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current && !wrapRef.current.contains(t)) updateOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [updateOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') updateOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen, updateOpen]);

  const toggleMenu = useCallback(() => {
    updateOpen(!menuOpen);
  }, [menuOpen, updateOpen]);

  const handleLogout = useCallback(() => {
    updateOpen(false);
    clearAuth();
    navigate(buildLocalizedPublicPath(lang, '/'));
  }, [lang, navigate, updateOpen]);

  const handleOpenOwnArtistPage = useCallback(() => {
    const slug = ownArtistPage.publicSlug;
    if (!slug) return;
    updateOpen(false);
    openOwnArtistPage(lang, slug, ownArtistPage.hasPublicPageContent, navigate, { sameTab: true });
  }, [lang, navigate, ownArtistPage.hasPublicPageContent, ownArtistPage.publicSlug, updateOpen]);

  const avatarLabels = ui?.header?.avatarMenu;
  const locale = lang === 'ru' ? 'ru' : 'en';
  const collectionTitle =
    ui?.dashboard?.collection?.title ?? (locale === 'en' ? 'Your Collection' : 'Ваша коллекция');
  const collectionSubtitle = formatCollectionMenuSubtitle(planSlug, slotsUsed, locale);
  const { pathname } = location;
  const isSettingsActive = pathname.startsWith('/dashboard/settings');
  const isCollectionActive = pathname.startsWith(COLLECTION_DASHBOARD_PATH);

  return (
    <div className="header__profile-wrap" ref={wrapRef}>
      <button
        type="button"
        className="header__profile"
        onClick={toggleMenu}
        aria-label={ui?.header?.openProfile ?? 'Account menu'}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        {isProfileAvatarPlaceholderUrl(avatarSrc) ? (
          <span
            className={[
              'header__profile-avatar',
              'header__profile-avatar--empty',
              avatarImgClassName,
            ]
              .filter(Boolean)
              .join(' ')}
            aria-hidden="true"
          >
            {getProfileAvatarInitials()}
          </span>
        ) : (
          <img
            className={['header__profile-avatar', avatarImgClassName].filter(Boolean).join(' ')}
            src={avatarSrc}
            alt=""
            decoding="async"
          />
        )}
      </button>
      {menuOpen ? (
        <div
          className="header__profile-menu"
          role="menu"
          aria-label={ui?.header?.openProfile ?? 'Account'}
        >
          <div className="header__profile-menu-group">
            <Link
              className={clsx(
                'header__profile-menu-item',
                isSettingsActive && 'header__profile-menu-item--active'
              )}
              role="menuitem"
              to="/dashboard/settings"
              state={dashboardLinkState}
              onClick={() => updateOpen(false)}
              aria-current={isSettingsActive ? 'page' : undefined}
            >
              <IconSettings className="header__profile-menu-icon" />
              <span>{avatarLabels?.dashboard ?? 'Dashboard'}</span>
            </Link>
            {ownArtistPage.publicSlug ? (
              <button
                type="button"
                className="header__profile-menu-item"
                role="menuitem"
                onClick={handleOpenOwnArtistPage}
              >
                <IconArtistPage className="header__profile-menu-icon" />
                <span>{avatarLabels?.myArtistPage ?? 'My Artist Page'}</span>
              </button>
            ) : null}
            {planSlug ? (
              <Link
                className={clsx(
                  'header__profile-menu-item',
                  'header__profile-menu-item--plan',
                  isCollectionActive && 'header__profile-menu-item--active'
                )}
                role="menuitem"
                to={COLLECTION_DASHBOARD_PATH}
                state={dashboardLinkState}
                onClick={() => updateOpen(false)}
                aria-current={isCollectionActive ? 'page' : undefined}
              >
                <IconCollection className="header__profile-menu-icon header__profile-menu-icon--plan" />
                <span className="header__profile-menu-item-text">
                  <span className="header__profile-menu-item-title header__profile-menu-item-title--plan">
                    {collectionTitle}
                  </span>
                  <span className="header__profile-menu-item-subtitle">{collectionSubtitle}</span>
                </span>
              </Link>
            ) : !isPremium ? (
              <button
                type="button"
                className="header__profile-menu-item header__profile-menu-item--upgrade"
                role="menuitem"
                onClick={() => {
                  updateOpen(false);
                  openPremiumModal();
                }}
              >
                <IconUpgradeSparkle className="header__profile-menu-icon header__profile-menu-icon--upgrade" />
                <span className="header__profile-menu-item-title header__profile-menu-item-title--upgrade">
                  {avatarLabels?.choosePlan ?? (locale === 'en' ? 'Choose Plan' : 'Выбрать план')}
                </span>
              </button>
            ) : null}
          </div>
          <div className="header__profile-menu-group header__profile-menu-group--separated">
            <button
              type="button"
              className="header__profile-menu-item header__profile-menu-item--danger"
              role="menuitem"
              onClick={handleLogout}
            >
              <IconLogOut className="header__profile-menu-icon" />
              <span>{avatarLabels?.logOut ?? 'Log out'}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const ProfileAvatarMenu = memo(ProfileAvatarMenuComponent);
