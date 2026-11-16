import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Heart as HeartIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AlbumCommentDto } from '@shared/api/albumComments';
import type { RouteLang } from '@shared/lib/i18n/routeLang';
import { buildArtistPagePath } from '@shared/lib/seo/publicPagePaths';
import { albumCommentDomId } from '@shared/lib/albumCommentDeepLink';
import { formatCommentRelativeTime } from '../lib/formatCommentRelativeTime';
import { MAX_ALBUM_COMMENT_CHARS, isSubmittableCommentBody } from '../lib/commentBody';
import { AlbumCommentAvatar } from './AlbumCommentAvatar';
import { buildReplyDraftWithMention, type MentionTarget } from '../lib/commentMentions';
import { AlbumCommentBody } from './AlbumCommentBody';
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
  showReplies: (count: number) => string;
  hideReplies: string;
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
  onDelete: (commentId: string) => void;
  onReport: (commentId: string) => Promise<void>;
  replySending?: boolean;
  viewerAvatarPath: string | null;
  viewerAvatarUrl?: string | null;
  viewerDisplayName: string;
  requireAuthForAction: () => boolean;
  repliesThreadExpanded?: boolean;
  onToggleRepliesThread?: () => void;
  highlighted?: boolean;
  mentionTargets?: MentionTarget[];
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
  viewerAvatarPath,
  viewerAvatarUrl,
  viewerDisplayName,
  requireAuthForAction,
  repliesThreadExpanded = true,
  onToggleRepliesThread,
  highlighted = false,
  mentionTargets = [],
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
  const replyCount = countThreadReplies(comment.replies);

  useEffect(() => {
    if (isReplyingHere) {
      setReplyDraft(buildReplyDraftWithMention(comment.author.displayName));
    } else {
      setReplyDraft('');
    }
  }, [comment.author.displayName, isReplyingHere]);
  const showRepliesToggle = !isReply && replyCount > 0 && onToggleRepliesThread != null;
  const isOwnComment = viewerUserId != null && comment.author.userId === viewerUserId;
  const canLike = !isOwnComment;
  const canReply = !isOwnComment;
  const showLikedState = canLike && comment.likedByViewer;
  const showLikeControl = !isDeleted && !editing;
  const showLikeCount = isOwnComment || comment.likeCount > 0;

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

  if (isDeleted) {
    return (
      <article
        id={albumCommentDomId(comment.id)}
        className={clsx(
          'album-comments__item',
          'album-comments__item--deleted-placeholder',
          isReply && 'album-comments__item--reply',
          highlighted && 'album-comments__item--highlight'
        )}
      >
        <p className="album-comments__deleted-text">{labels.deleted}</p>
        {children}
      </article>
    );
  }

  return (
    <article
      id={albumCommentDomId(comment.id)}
      className={clsx(
        'album-comments__item',
        isReply && 'album-comments__item--reply',
        highlighted && 'album-comments__item--highlight'
      )}
    >
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
              {!comment.author.isArtist ? (
                <span className="album-comments__dot" aria-hidden>
                  ·
                </span>
              ) : null}
              <time className="album-comments__time" dateTime={comment.createdAt}>
                {formatCommentRelativeTime(comment.createdAt, lang)}
              </time>
            </div>
            {!editing ? (
              <AlbumCommentMenu items={menuItems} onSelect={handleMenu} menuLabel={labels.menu} />
            ) : null}
          </header>

          {editing ? (
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
              <AlbumCommentBody body={comment.body} lang={lang} mentionTargets={mentionTargets} />
              {comment.isEdited ? <p className="album-comments__edited">{labels.edited}</p> : null}
            </>
          )}

          {!isDeleted && !editing ? (
            <div className="album-comments__actions">
              {showLikeControl ? (
                <button
                  type="button"
                  className={clsx(
                    'album-comments__like',
                    showLikedState && 'album-comments__like--active',
                    isOwnComment && 'album-comments__like--own'
                  )}
                  disabled={isOwnComment}
                  onClick={() => {
                    if (!canLike) return;
                    if (!requireAuthForAction()) return;
                    onToggleLike(comment.id);
                  }}
                  aria-pressed={showLikedState}
                  aria-label={labels.like}
                >
                  <HeartIcon
                    className="album-comments__like-icon"
                    size={21}
                    strokeWidth={1.65}
                    fill={showLikedState ? 'currentColor' : 'none'}
                  />
                  {showLikeCount ? (
                    <span className="album-comments__like-count">{comment.likeCount}</span>
                  ) : null}
                </button>
              ) : null}
              {canReply ? (
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
              {showRepliesToggle ? (
                <button
                  type="button"
                  className="album-comments__text-action album-comments__text-action--accent album-comments__replies-toggle"
                  aria-expanded={repliesThreadExpanded}
                  onClick={onToggleRepliesThread}
                >
                  {repliesThreadExpanded ? labels.hideReplies : labels.showReplies(replyCount)}
                </button>
              ) : null}
            </div>
          ) : null}

          {isReplyingHere && canReply ? (
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

function countThreadReplies(replies: AlbumCommentDto['replies']): number {
  return replies.reduce((sum, reply) => sum + 1 + countThreadReplies(reply.replies), 0);
}
