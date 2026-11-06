import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import type { IInterface } from '@models';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  patchAdminNotificationRead,
  type AdminNotificationItem,
} from '@shared/lib/adminNotificationsApi';

import { AdminPanelLayout } from './ui/AdminPanelLayout';
import { useAdminNotifications } from './AdminNotificationsContext';

type Copy = NonNullable<IInterface['adminPanelNotifications']>;

function parseCopyrightBody(body: unknown): { contentTitle?: string } | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  const contentTitle = typeof o.contentTitle === 'string' ? o.contentTitle : undefined;
  return { contentTitle };
}

function relativeTime(iso: string, lang: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    const sec = Math.floor(diff / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    const rtf = new Intl.RelativeTimeFormat(lang === 'ru' ? 'ru' : 'en', { numeric: 'auto' });
    if (min < 1) return rtf.format(0, 'second');
    if (min < 60) return rtf.format(-min, 'minute');
    if (hr < 24) return rtf.format(-hr, 'hour');
    if (day < 7) return rtf.format(-day, 'day');
    return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return iso;
  }
}

export default function AdminNotificationsPage() {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.adminPanelNotifications;
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, error, refresh } = useAdminNotifications();

  const titleFor = useCallback(
    (n: AdminNotificationItem): string => {
      if (n.type === 'copyright_claim') return copy?.copyrightClaimTitle ?? 'New copyright claim';
      return n.type;
    },
    [copy?.copyrightClaimTitle]
  );

  const bodyFor = useCallback(
    (n: AdminNotificationItem): string => {
      if (n.type === 'copyright_claim') {
        const parsed = parseCopyrightBody(n.body);
        const title = parsed?.contentTitle ?? '';
        const template = copy?.copyrightClaimBody ?? 'Copyright claim submitted for "{{title}}"';
        return template.replace('{{title}}', title);
      }
      return '';
    },
    [copy?.copyrightClaimBody]
  );

  const handleRowClick = async (n: AdminNotificationItem) => {
    if (n.type === 'copyright_claim' && n.targetType === 'copyright_claim') {
      if (!n.isRead) {
        try {
          await patchAdminNotificationRead(n.id);
          await refresh();
        } catch {
          /* still navigate */
        }
      }
      navigate(`/admin/copyright/claims/${n.targetId}`);
    }
  };

  const subtitle =
    unreadCount > 0 && copy?.unreadSummary
      ? copy.unreadSummary.replace('{{count}}', String(unreadCount))
      : undefined;

  return (
    <AdminPanelLayout
      title={copy?.pageTitle ?? 'Notifications'}
      subtitle={subtitle}
      bellUnreadCount={unreadCount}
      bellTo="/admin/notifications"
    >
      {loading ? <p className="admin-panel__placeholder">…</p> : null}
      {!loading && error ? (
        <p className="admin-panel__placeholder admin-panel__placeholder--error">
          {copy?.loadError ?? 'Could not load notifications.'}
        </p>
      ) : null}
      {!loading && !error && notifications.length === 0 ? (
        <p className="admin-panel__placeholder">{copy?.empty ?? 'No notifications yet.'}</p>
      ) : null}
      {!loading && !error && notifications.length > 0 ? (
        <ul className="admin-notifications">
          {notifications.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={`admin-notifications__row${n.isRead ? ' admin-notifications__row--read' : ''}`}
                onClick={() => void handleRowClick(n)}
              >
                <span className="admin-notifications__dot" aria-hidden>
                  {n.isRead ? '○' : '●'}
                </span>
                <span className="admin-notifications__main">
                  <span className="admin-notifications__title">{titleFor(n)}</span>
                  <span className="admin-notifications__body">{bodyFor(n)}</span>
                  <span className="admin-notifications__time">
                    {relativeTime(n.createdAt, lang)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </AdminPanelLayout>
  );
}
