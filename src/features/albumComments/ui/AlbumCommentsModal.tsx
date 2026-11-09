import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Popup, PopupCloseButton } from '@shared/ui/popup';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { DashboardLoadingState } from '@shared/ui/dashboard';
import { useEffectiveLocation } from '@shared/lib/hooks/useEffectiveLocation';
import { useLang } from '@app/providers/lang';
import { useAuthSessionUser } from '@shared/lib/hooks/useAuthSessionUser';
import { isAuthenticated } from '@shared/lib/auth';
import { buildAuthPath } from '@shared/lib/internalAppUrls';
import { sanitizeReturnPath } from '@shared/lib/authReturnUrl';
import { toast } from '@shared/lib/toast/toastApi';
import {
  createAlbumComment,
  deleteAlbumComment,
  fetchAlbumCommentsPage,
  reportAlbumComment,
  toggleAlbumCommentLike,
  updateAlbumComment,
  type AlbumCommentDto,
  type AlbumCommentsSummaryDto,
} from '@shared/api/albumComments';
import { readStoredProfileDisplayName } from '@shared/lib/profileDisplayName';
import { useAvatar } from '@shared/lib/hooks/useAvatar';
import {
  appendReplyComment,
  appendRootComment,
  replaceCommentInTree,
  updateCommentInTree,
} from '../lib/updateCommentTree';
import { AlbumCommentComposer } from './AlbumCommentComposer';
import { AlbumCommentRow, type AlbumCommentRowLabels } from './AlbumCommentRow';
import './albumComments.scss';

export type AlbumCommentsModalLabels = {
  title: string;
  emptyTitle: string;
  emptyHint: string;
  loadError: string;
  retry: string;
  showMore: string;
  reportThanks: string;
  row: AlbumCommentRowLabels;
  composerPlaceholder: string;
  commentsCount: (count: number) => string;
};

type AlbumCommentsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  albumId: string;
  artistSlug: string;
  labels: AlbumCommentsModalLabels;
  summary: AlbumCommentsSummaryDto | null;
  onSummaryChange: (summary: AlbumCommentsSummaryDto) => void;
  artistUserId: string | null;
};

export function AlbumCommentsModal({
  isOpen,
  onClose,
  albumId,
  artistSlug,
  labels,
  summary,
  onSummaryChange,
  artistUserId,
}: AlbumCommentsModalProps) {
  const titleId = useId();
  const { lang } = useLang();
  const location = useEffectiveLocation();
  const navigate = useNavigate();
  const viewer = useAuthSessionUser();
  const { avatarSrc } = useAvatar();

  const viewerDisplayName = useMemo(
    () => viewer?.name?.trim() || readStoredProfileDisplayName().trim() || '—',
    [viewer?.name]
  );

  const [comments, setComments] = useState<AlbumCommentDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [loadingMore, setLoadingMore] = useState(false);
  const [composerValue, setComposerValue] = useState('');
  const [sendingRoot, setSendingRoot] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replySending, setReplySending] = useState(false);
  const [likePendingId, setLikePendingId] = useState<string | null>(null);
  const [resolvedArtistUserId, setResolvedArtistUserId] = useState<string | null>(artistUserId);

  const totalCount = summary?.totalCount ?? 0;

  const requireAuthForAction = useCallback((): boolean => {
    if (isAuthenticated()) return true;
    const returnTo =
      sanitizeReturnPath(`${location.pathname}${location.search}`) ?? location.pathname;
    const params = new URLSearchParams({ mode: 'login', returnTo });
    navigate(buildAuthPath(params), { state: { backgroundLocation: location } });
    return false;
  }, [location, navigate]);

  const loadPage = useCallback(
    async (cursor?: string | null, append = false) => {
      if (!append) setLoadState('loading');
      else setLoadingMore(true);
      try {
        const page = await fetchAlbumCommentsPage({
          albumId,
          artistSlug,
          cursor,
        });
        setResolvedArtistUserId(page.artistUserId);
        setNextCursor(page.nextCursor);
        setComments((prev) => (append ? [...prev, ...page.comments] : page.comments));
        setLoadState('ready');
      } catch {
        if (!append) setLoadState('error');
        else toast.show({ variant: 'error', title: labels.loadError, layer: 'top' });
      } finally {
        setLoadingMore(false);
      }
    },
    [albumId, artistSlug, labels.loadError]
  );

  useEffect(() => {
    if (!isOpen) return;
    void loadPage(null, false);
  }, [isOpen, loadPage]);

  const bumpSummaryAfterNewComment = useCallback(
    (authorUserId: string) => {
      const base: AlbumCommentsSummaryDto = summary ?? { totalCount: 0, recentCommenters: [] };
      const already = base.recentCommenters.some((c) => c.userId === authorUserId);
      const recent = already
        ? base.recentCommenters
        : [
            {
              userId: authorUserId,
              displayName: viewerDisplayName,
              avatarPath: null,
            },
            ...base.recentCommenters,
          ].slice(0, 3);
      onSummaryChange({
        totalCount: base.totalCount + 1,
        recentCommenters: recent,
      });
    },
    [onSummaryChange, summary, viewerDisplayName]
  );

  const handleCreateRoot = async () => {
    if (!requireAuthForAction()) return;
    setSendingRoot(true);
    try {
      const comment = await createAlbumComment({
        albumId,
        artistSlug,
        body: composerValue,
      });
      setComments((prev) => appendRootComment(prev, comment));
      setComposerValue('');
      if (viewer?.id) bumpSummaryAfterNewComment(viewer.id);
    } catch {
      toast.show({ variant: 'error', title: labels.loadError, layer: 'top' });
    } finally {
      setSendingRoot(false);
    }
  };

  const handleSubmitReply = async (parentId: string, body: string) => {
    if (!requireAuthForAction()) return;
    setReplySending(true);
    try {
      const reply = await createAlbumComment({
        albumId,
        artistSlug,
        body,
        parentId,
      });
      const rootId = reply.parentId ?? parentId;
      setComments((prev) => appendReplyComment(prev, rootId, reply));
      setReplyingToId(null);
      if (viewer?.id) bumpSummaryAfterNewComment(viewer.id);
    } catch {
      toast.show({ variant: 'error', title: labels.loadError, layer: 'top' });
    } finally {
      setReplySending(false);
    }
  };

  const handleToggleLike = async (commentId: string) => {
    const snapshot = comments;
    setComments((prev) =>
      updateCommentInTree(prev, commentId, (c) => ({
        ...c,
        likedByViewer: !c.likedByViewer,
        likeCount: c.likedByViewer ? Math.max(0, c.likeCount - 1) : c.likeCount + 1,
      }))
    );
    setLikePendingId(commentId);
    try {
      const result = await toggleAlbumCommentLike(commentId);
      setComments((prev) =>
        updateCommentInTree(prev, commentId, {
          likedByViewer: result.liked,
          likeCount: result.likeCount,
        })
      );
    } catch {
      setComments(snapshot);
      toast.show({ variant: 'error', title: labels.loadError, layer: 'top' });
    } finally {
      setLikePendingId(null);
    }
  };

  const handleEdit = async (commentId: string, body: string) => {
    const updated = await updateAlbumComment({ commentId, body });
    setComments((prev) => replaceCommentInTree(prev, updated));
  };

  const handleDelete = async (commentId: string) => {
    const updated = await deleteAlbumComment(commentId);
    setComments((prev) => replaceCommentInTree(prev, updated));
    if (summary) {
      onSummaryChange({
        ...summary,
        totalCount: Math.max(0, summary.totalCount - (updated.deletedAt ? 1 : 0)),
      });
    }
  };

  const handleReport = async (commentId: string) => {
    try {
      await reportAlbumComment(commentId);
      toast.show({ variant: 'success', title: labels.reportThanks, layer: 'top' });
    } catch (err) {
      const message = err instanceof Error ? err.message : labels.loadError;
      toast.show({ variant: 'error', title: message, layer: 'top' });
    }
  };

  const artistId = resolvedArtistUserId ?? artistUserId ?? '';

  return (
    <Popup isActive={isOpen} onClose={onClose} publicBackdrop aria-labelledby={titleId}>
      <div className="album-comments-fullscreen">
        <header className="album-comments-fullscreen__header">
          <div className="album-comments-fullscreen__header-main">
            <div className="album-comments-fullscreen__column">
              <h2 id={titleId} className="album-comments-fullscreen__title">
                {labels.title}
                {totalCount > 0 ? (
                  <span className="album-comments-fullscreen__count">
                    {labels.commentsCount(totalCount)}
                  </span>
                ) : null}
              </h2>
            </div>
          </div>
          <PopupCloseButton
            className="album-comments-fullscreen__close"
            aria-label={labels.row.cancel}
          >
            <ModalCloseIcon />
          </PopupCloseButton>
        </header>

        <div className="album-comments-fullscreen__body">
          <div className="album-comments-fullscreen__column">
            {loadState === 'loading' ? (
              <DashboardLoadingState className="album-comments-fullscreen__loading" />
            ) : null}
            {loadState === 'error' ? (
              <div className="album-comments-fullscreen__error">
                <p>{labels.loadError}</p>
                <button
                  type="button"
                  className="album-comments__text-btn"
                  onClick={() => loadPage()}
                >
                  {labels.retry}
                </button>
              </div>
            ) : null}
            {loadState === 'ready' && comments.length === 0 ? (
              <div className="album-comments-fullscreen__empty">
                <p className="album-comments-fullscreen__empty-title">{labels.emptyTitle}</p>
                <p>{labels.emptyHint}</p>
              </div>
            ) : null}
            {loadState === 'ready' && comments.length > 0 ? (
              <div className="album-comments-fullscreen__list">
                {comments.map((root) => (
                  <section key={root.id} className="album-comments-fullscreen__thread">
                    <AlbumCommentRow
                      comment={root}
                      lang={lang}
                      labels={labels.row}
                      viewerUserId={viewer?.id ?? null}
                      artistUserId={artistId}
                      replyingToId={replyingToId}
                      onRequestReply={setReplyingToId}
                      onCancelReply={() => setReplyingToId(null)}
                      onSubmitReply={handleSubmitReply}
                      onToggleLike={handleToggleLike}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onReport={handleReport}
                      replySending={replySending}
                      likePending={likePendingId === root.id}
                      viewerAvatarPath={null}
                      viewerAvatarUrl={avatarSrc}
                      viewerDisplayName={viewerDisplayName}
                      requireAuthForAction={requireAuthForAction}
                    >
                      {root.replies.map((reply) => (
                        <AlbumCommentRow
                          key={reply.id}
                          comment={reply}
                          lang={lang}
                          labels={labels.row}
                          isReply
                          viewerUserId={viewer?.id ?? null}
                          artistUserId={artistId}
                          replyingToId={replyingToId}
                          onRequestReply={setReplyingToId}
                          onCancelReply={() => setReplyingToId(null)}
                          onSubmitReply={handleSubmitReply}
                          onToggleLike={handleToggleLike}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onReport={handleReport}
                          replySending={replySending}
                          likePending={likePendingId === reply.id}
                          viewerAvatarPath={null}
                          viewerAvatarUrl={avatarSrc}
                          viewerDisplayName={viewerDisplayName}
                          requireAuthForAction={requireAuthForAction}
                        />
                      ))}
                    </AlbumCommentRow>
                  </section>
                ))}
                {nextCursor ? (
                  <button
                    type="button"
                    className="album-comments-fullscreen__more"
                    disabled={loadingMore}
                    onClick={() => void loadPage(nextCursor, true)}
                  >
                    {labels.showMore}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <footer className="album-comments-fullscreen__footer">
          <div className="album-comments-fullscreen__column">
            <AlbumCommentComposer
              value={composerValue}
              onChange={setComposerValue}
              sending={sendingRoot}
              placeholder={labels.composerPlaceholder}
              imageUrl={avatarSrc}
              avatarPath={null}
              displayName={viewerDisplayName}
              onFocus={() => {
                if (!isAuthenticated()) requireAuthForAction();
              }}
              onSubmit={() => {
                if (!requireAuthForAction()) return;
                void handleCreateRoot();
              }}
            />
          </div>
        </footer>
      </div>
    </Popup>
  );
}
