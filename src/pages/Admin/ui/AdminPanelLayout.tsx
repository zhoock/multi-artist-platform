import { type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import type { IInterface } from '@models';
import { buildLocalizedPublicPath } from '@shared/lib/i18n/routeLang';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';

import './AdminPanel.scss';
import { useOptionalAdminNotifications } from '../AdminNotificationsContext';

type AdminNotifCopy = NonNullable<IInterface['adminPanelNotifications']>;

type AdminPanelLayoutProps = {
  title: string;
  subtitle?: string;
  /** Unread badge (default: from AdminNotificationsContext) */
  bellUnreadCount?: number;
  /** Link target for bell (default /admin/notifications) */
  bellTo?: string;
  children: ReactNode;
};

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `admin-panel__link${isActive ? ' admin-panel__link--active' : ''}`;

const subLinkClass = ({ isActive }: { isActive: boolean }) =>
  `admin-panel__link admin-panel__link--sub${isActive ? ' admin-panel__link--active' : ''}`;

export function AdminPanelLayout({
  title,
  subtitle,
  bellUnreadCount: bellUnreadOverride,
  bellTo = '/admin/notifications',
  children,
}: AdminPanelLayoutProps) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const location = useLocation();
  const homePath = buildLocalizedPublicPath(lang, '/');
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const notifCopy = ui?.adminPanelNotifications as AdminNotifCopy | undefined;

  const notifCtx = useOptionalAdminNotifications();
  const unread = bellUnreadOverride ?? notifCtx?.unreadCount ?? 0;
  const bellLabel = notifCopy?.bellAriaLabel ?? 'Notifications';

  return (
    <div className="admin-panel">
      <aside className="admin-panel__sidebar" aria-label="Admin navigation">
        <div className="admin-panel__brand">Admin</div>
        <nav className="admin-panel__nav">
          <NavLink to="/admin" end className={navLinkClass}>
            Dashboard
          </NavLink>

          <div className="admin-panel__nav-section">
            <span className="admin-panel__nav-label">Copyright</span>
            <NavLink to="/admin/copyright" className={navLinkClass}>
              Copyright
            </NavLink>
            <NavLink to="/admin/copyright/claims" className={subLinkClass}>
              Claims
            </NavLink>
          </div>

          <div className="admin-panel__nav-section">
            <span className="admin-panel__nav-label">Notifications</span>
            <NavLink to="/admin/notifications" className={navLinkClass}>
              {notifCopy?.navNotifications ?? 'Notifications'}
              {unread > 0 ? (
                <span
                  className="admin-panel__nav-unread"
                  title={notifCopy?.unreadSummary ?? undefined}
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : null}
            </NavLink>
          </div>

          <div className="admin-panel__divider" role="presentation" />

          <div className="admin-panel__back">
            <NavLink
              to={homePath}
              state={{ backgroundLocation: location }}
              className="admin-panel__link"
            >
              Back to platform
            </NavLink>
          </div>
        </nav>
      </aside>
      <div className="admin-panel__main">
        <div className="admin-panel__header-row">
          <h1 className="admin-panel__title">{title}</h1>
          <Link to={bellTo} className="admin-panel__bell" aria-label={bellLabel} title={bellLabel}>
            <span className="admin-panel__bell-icon" aria-hidden>
              🔔
            </span>
            {unread > 0 ? (
              <span className="admin-panel__bell-count" aria-hidden>
                {unread > 99 ? '99+' : unread}
              </span>
            ) : null}
          </Link>
        </div>
        {subtitle ? <p className="admin-panel__subtitle">{subtitle}</p> : null}
        {children}
      </div>
    </div>
  );
}
