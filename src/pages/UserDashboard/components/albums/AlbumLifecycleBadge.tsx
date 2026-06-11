import clsx from 'clsx';
import type { AlbumLifecycleStatus } from '@entities/album/lib/albumLifecycleStatus';
import type { IInterface } from '@models';

type AlbumLifecycleBadgeProps = {
  status: AlbumLifecycleStatus;
  ui?: IInterface;
  lang: string;
};

function statusLabel(
  status: AlbumLifecycleStatus,
  ui: IInterface | undefined,
  lang: string
): string {
  const en = lang !== 'ru';
  const d = ui?.dashboard;

  switch (status) {
    case 'ready-to-publish':
      return d?.albumStatusReadyToPublish ?? (en ? 'Ready to Publish' : 'Готов к публикации');
    case 'published':
      return d?.albumStatusPublished ?? (en ? 'Published' : 'Опубликован');
    case 'hidden':
      return d?.albumStatusHidden ?? (en ? 'Hidden' : 'Скрыт');
    default:
      return d?.albumStatusDraft ?? (en ? 'Draft' : 'Черновик');
  }
}

export function AlbumLifecycleBadge({ status, ui, lang }: AlbumLifecycleBadgeProps) {
  return (
    <span
      className={clsx('user-dashboard__album-status-badge', {
        'user-dashboard__album-status-badge--neutral': status === 'draft',
        'user-dashboard__album-status-badge--ready': status === 'ready-to-publish',
        'user-dashboard__album-status-badge--published': status === 'published',
        'user-dashboard__album-status-badge--hidden': status === 'hidden',
      })}
    >
      <span className="user-dashboard__album-status-badge-dot" aria-hidden="true" />
      {statusLabel(status, ui, lang)}
    </span>
  );
}
