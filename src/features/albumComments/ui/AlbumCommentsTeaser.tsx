import clsx from 'clsx';
import { MessageCircle as MessageCircleIcon } from 'lucide-react';
import type { AlbumCommentsSummaryDto } from '@shared/api/albumComments';

export type AlbumCommentsTeaserProps = {
  summary: AlbumCommentsSummaryDto | null;
  loading: boolean;
  labels: {
    noComments: string;
    commentsCount: (count: number) => string;
    openComments: string;
  };
  onOpen: () => void;
};

export function AlbumCommentsTeaser({
  summary,
  loading,
  labels,
  onOpen,
}: AlbumCommentsTeaserProps) {
  const total = summary?.totalCount ?? 0;
  const hasComments = total > 0;

  return (
    <button
      type="button"
      className={clsx('album-comments-teaser', loading && 'album-comments-teaser--loading')}
      onClick={onOpen}
      aria-label={labels.openComments}
    >
      <span className="share-list__link album-comments-teaser__trigger" aria-hidden>
        <MessageCircleIcon size={16} strokeWidth={1.75} />
      </span>
      {hasComments ? (
        <span className="album-comments-teaser__count">{labels.commentsCount(total)}</span>
      ) : !loading ? (
        <span className="album-comments-teaser__empty">{labels.noComments}</span>
      ) : null}
    </button>
  );
}
