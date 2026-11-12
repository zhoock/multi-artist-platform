import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Heart as HeartIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AlbumCommentDto } from '@shared/api/albumComments';
import type { RouteLang } from '@shared/lib/i18n/routeLang';
import { buildArtistPagePath } from '@shared/lib/seo/publicPagePaths';
import { formatCommentRelativeTime } from '../lib/formatCommentRelativeTime';
import { MAX_ALBUM_COMMENT_CHARS, isSubmittableCommentBody } from '../lib/commentBody';
import { AlbumCommentAvatar } from './AlbumCommentAvatar';
import { AlbumCommentComposer } from './AlbumCommentComposer';
import { AlbumCommentMenu, type AlbumCommentMenuItem } from './AlbumCommentMenu';

export type AlbumCommentRowLabels = {
  artistBadge: string;
  reply: string;
  cancel: string;
  edited: string;
  deleted: string;
  like: string;
  menu: string;
  edit: string;
  delete: string;
  report: string;
  save: string;
  replyPlaceholder: (name: string) => string;
};

type AlbumCommentRowProps = {
  comment: AlbumCommentDto;
  lang: string;
  labels: AlbumCommentRowLabels;
  isReply?: boolean;
  viewerUserId: string | null;
  artistUserId: string;
  replyingToId: string | null;
  onRequestReply: (commentId: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (parentId: string, body: string) => Promise<void>;
  onToggleLike: (commentId: string) => void;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onReport: (commentId: string) => Promise<void>;
  replySending?: boolean;
  likePending?: boolean;
  viewerAvatarPath: string | null;
  viewerAvatarUrl?: string | null;
  viewerDisplayName: string;
  requireAuthForAction: () => boolean;
  children?: React.ReactNode;
};

export function AlbumCommentRow({
  comment,
  lang,
  labels,
  isReply = false,
  viewerUserId,
  artistUserId,
  replyingToId,
  onRequestReply,
  onCancelReply,
  onSubmitReply,
  onToggleLike,
  onEdit,
  onDelete,
  onReport,
  replySending = false,
  likePending = false,
  viewerAvatarPath,
  viewerAvatarUrl,
  viewerDisplayName,
  requireAuthForAction,
  children,
}: AlbumCommentRowProps) {
  const isDeleted = Boolean(comment.deletedAt);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(comment.body);
  const [replyDraft, setReplyDraft] = useState('');

  const menuItems: AlbumCommentMenuItem[] = useMemo(() => {
    if (isDeleted || !viewerUserId) return [];
    const isOwn = comment.author.userId === viewerUserId;
    const isAlbumOwner = viewerUserId === artistUserId;
    const items: AlbumCommentMenuItem[] = [];
    if (isOwn) {
      items.push({ id: 'edit', label: labels.edit });
      items.push({ id: 'delete', label: labels.delete, destructive: true });
    } else if (isAlbumOwner) {
      items.push({ id: 'delete', label: labels.delete, destructive: true });
    } else {
      items.push({ id: 'report', label: labels.report });
    }
    return items;
  }, [
    artistUserId,
    comment.author.userId,
    isDeleted,
    labels.delete,
    labels.edit,
    labels.report,
    viewerUserId,
  ]);

  const handleMenu = (id: string) => {
    if (id === 'edit') {
      setEditDraft(comment.body);
      setEditing(true);
      return;
    }
    if (id === 'delete') {
      void onDelete(comment.id);
      return;
    }
    if (id === 'report') {
      void onReport(comment.id);
    }
  };

  const isReplyingHere = replyingToId === comment.id;

  const artistPagePath = useMemo(() => {
    if (!comment.author.isArtist) return null;
    const slug = comment.author.publicSlug?.trim();
    if (!slug) return null;
    return buildArtistPagePath(lang as RouteLang, slug);
  }, [comment.author.isArtist, comment.author.publicSlug, lang]);

  const avatar = (
    <AlbumCommentAvatar
      avatarPath={comment.author.avatarPath}
      displayName={comment.author.displayName}
    />
  );

  return (
    <article
      className={clsx(
        'album-comments__item',
        isReply && 'album-comments__item--reply',
        isDeleted && 'album-comments__item--deleted'
      )}
    >
      {isReply ? <span className="album-comments__reply-rail" aria-hidden /> : null}
      <div className="album-comments__item-main">
        {artistPagePath ? (
          <Link to={artistPagePath} className="album-comments__avatar-link">
            {avatar}
          </Link>
        ) : (
          avatar
        )}
        <div className="album-comments__item-body">
          <header className="album-comments__item-header">
            <div className="album-comments__item-meta">
              {artistPagePath ? (
                <Link to={artistPagePath} className="album-comments__author-link">
                  {comment.author.displayName}
                </Link>
              ) : (
                <span className="album-comments__author">{comment.author.displayName}</span>
              )}
              {comment.author.isArtist ? (
                <span className="album-comments__artist-badge">{labels.artistBadge}</span>
              ) : null}
              <span className="album-comments__dot" aria-hidden>
                ·
              </span>
              <time className="album-comments__time" dateTime={comment.createdAt}>
                {formatCommentRelativeTime(comment.createdAt, lang)}
              </time>
            </div>
            {!editing ? (
              <AlbumCommentMenu items={menuItems} onSelect={handleMenu} menuLabel={labels.menu} />
            ) : null}
          </header>

          {isDeleted ? (
            <p className="album-comments__deleted-text">{labels.deleted}</p>
          ) : editing ? (
            <div className="album-comments__edit">
              <textarea
                className="album-comments__edit-input"
                rows={2}
                value={editDraft}
                maxLength={MAX_ALBUM_COMMENT_CHARS}
                onChange={(event) => setEditDraft(event.target.value)}
              />
              <div className="album-comments__edit-actions">
                <button
                  type="button"
                  className="album-comments__text-action album-comments__text-action--muted"
                  onClick={() => {
                    setEditing(false);
                    setEditDraft(comment.body);
                  }}
                >
                  {labels.cancel}
                </button>
                <button
                  type="button"
                  className="album-comments__text-action album-comments__text-action--accent"
                  disabled={!isSubmittableCommentBody(editDraft)}
                  onClick={() => {
                    void onEdit(comment.id, editDraft).then(() => setEditing(false));
                  }}
                >
                  {labels.save}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="album-comments__text">{comment.body}</p>
              {comment.isEdited ? <p className="album-comments__edited">{labels.edited}</p> : null}
            </>
          )}

          {!isDeleted && !editing ? (
            <div className="album-comments__actions">
              <button
                type="button"
                className={clsx(
                  'album-comments__like',
                  comment.likedByViewer && 'album-comments__like--active'
                )}
                disabled={likePending}
                onClick={() => {
                  if (!requireAuthForAction()) return;
                  onToggleLike(comment.id);
                }}
                aria-pressed={comment.likedByViewer}
                aria-label={labels.like}
              >
                <HeartIcon
                  className="album-comments__like-icon"
                  size={21}
                  strokeWidth={1.65}
                  fill={comment.likedByViewer ? 'currentColor' : 'none'}
                />
                <span className="album-comments__like-count">{comment.likeCount}</span>
              </button>
              {!isReply ? (
                <button
                  type="button"
                  className="album-comments__reply"
                  onClick={() => {
                    if (!requireAuthForAction()) return;
                    onRequestReply(comment.id);
                  }}
                >
                  {labels.reply}
                </button>
              ) : null}
            </div>
          ) : null}

          {isReplyingHere ? (
            <div className="album-comments__inline-reply">
              <AlbumCommentComposer
                value={replyDraft}
                onChange={setReplyDraft}
                compact
                sending={replySending}
                placeholder={labels.replyPlaceholder(comment.author.displayName)}
                avatarPath={viewerAvatarPath}
                imageUrl={viewerAvatarUrl}
                displayName={viewerDisplayName}
                cancelLabel={labels.cancel}
                onCancel={onCancelReply}
                onSubmit={() => {
                  void onSubmitReply(comment.id, replyDraft).then(() => setReplyDraft(''));
                }}
              />
            </div>
          ) : null}

          {children}
        </div>
      </div>
    </article>
  );
}
