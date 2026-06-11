import clsx from 'clsx';
import type { AlbumListDraftBadge } from '@entities/album/lib/albumLifecycleStatus';
import type { IInterface } from '@models';

type AlbumLifecycleBadgeProps = {
  status: AlbumListDraftBadge;
  ui?: IInterface;
  lang: string;
};

function statusLabel(
  status: Exclude<AlbumListDraftBadge, null>,
  ui: IInterface | undefined,
  lang: string
): string {
  const en = lang !== 'ru';
  const d = ui?.dashboard;

  switch (status) {
    case 'ready-to-publish':
      return d?.albumStatusReadyToPublish ?? (en ? 'Ready to Publish' : 'Готов к публикации');
    case 'draft-changes':
      return d?.articleStatusDraftChanges ?? (en ? 'Draft changes' : 'Черновые правки');
    default:
      return d?.albumStatusDraft ?? (en ? 'Draft' : 'Черновик');
  }
}

export function AlbumLifecycleBadge({ status, ui, lang }: AlbumLifecycleBadgeProps) {
  if (!status) {
    return null;
  }

  return (
    <span
      className={clsx('user-dashboard__album-status-badge', {
        'user-dashboard__album-status-badge--neutral':
          status === 'draft' || status === 'draft-changes',
        'user-dashboard__album-status-badge--ready': status === 'ready-to-publish',
      })}
    >
      <span className="user-dashboard__album-status-badge-dot" aria-hidden="true" />
      {statusLabel(status, ui, lang)}
    </span>
  );
}
