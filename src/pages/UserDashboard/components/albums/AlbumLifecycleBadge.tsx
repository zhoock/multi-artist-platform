import type { AlbumListDraftBadge } from '@entities/album/lib/albumLifecycleStatus';
import type { IInterface } from '@models';
import { StatusBadge, type StatusBadgeVariant } from '@shared/ui/statusBadge';

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
    case 'copyright-restricted':
      return d?.albumStatusTemporarilyHidden ?? (en ? 'Temporarily hidden' : 'Временно скрыт');
    default:
      return d?.albumStatusDraft ?? (en ? 'Draft' : 'Черновик');
  }
}

function lifecycleVariant(status: Exclude<AlbumListDraftBadge, null>): StatusBadgeVariant {
  if (status === 'ready-to-publish') {
    return 'readyToPublish';
  }

  if (status === 'copyright-restricted') {
    return 'notVerified';
  }

  return 'draft';
}

export function AlbumLifecycleBadge({ status, ui, lang }: AlbumLifecycleBadgeProps) {
  if (!status) {
    return null;
  }

  return (
    <StatusBadge variant={lifecycleVariant(status)}>{statusLabel(status, ui, lang)}</StatusBadge>
  );
}
