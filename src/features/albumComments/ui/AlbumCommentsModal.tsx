import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { albumCommentDomId, findCommentInTree } from '@shared/lib/albumCommentDeepLink';
import {
  appendReplyComment,
  appendRootComment,
  findCommentRootId,
  replaceCommentInTree,
  updateCommentInTree,
} from '../lib/updateCommentTree';
import { applyCommentDeleteToForest, pruneCommentForest } from '../lib/commentTreePrune';
import { collectMentionTargets } from '../lib/commentMentions';
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

const ALBUM_COMMENT_DEEP_LINK_HIGHLIGHT_MS = 2600;

type AlbumCommentsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  albumId: string;
  artistSlug: string;
  labels: AlbumCommentsModalLabels;
  summary: AlbumCommentsSummaryDto | null;
  onSummaryChange: (summary: AlbumCommentsSummaryDto) => void;
  artistUserId: string | null;
  deepLinkCommentId?: string | null;
  onDeepLinkConsumed?: () => void;
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
  deepLinkCommentId = null,
  onDeepLinkConsumed,
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
  const commentsLoadGenerationRef = useRef(0);
  const likeRequestGenerationRef = useRef(new Map<string, number>());
  const likeApiChainRef = useRef(new Map<string, Promise<void>>());
  const commentsRef = useRef(comments);
  commentsRef.current = comments;
  const [resolvedArtistUserId, setResolvedArtistUserId] = useState<string | null>(artistUserId);
  const [collapsedReplyRoots, setCollapsedReplyRoots] = useState<Set<string>>(() => new Set());
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const deepLinkResolvedRef = useRef<string | null>(null);
  const deepLinkFinishedRef = useRef(false);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRepliesThreadExpanded = useCallback(
    (rootId: string) => !collapsedReplyRoots.has(rootId),
    [collapsedReplyRoots]
  );

  const toggleRepliesThread = useCallback((rootId: string) => {
    setCollapsedReplyRoots((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  }, []);

  const totalCount = summary?.totalCount ?? 0;
  const mentionTargets = useMemo(() => collectMentionTargets(comments), [comments]);

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
      const loadGeneration = append
        ? commentsLoadGenerationRef.current
        : ++commentsLoadGenerationRef.current;
      if (!append) setLoadState('loading');
      else setLoadingMore(true);
      try {
        const page = await fetchAlbumCommentsPage({
          albumId,
          artistSlug,
          cursor,
        });
        if (!append && loadGeneration !== commentsLoadGenerationRef.current) {
          return;
        }
        setResolvedArtistUserId(page.artistUserId);
        setNextCursor(page.nextCursor);
        setComments((prev) =>
          append
            ? pruneCommentForest([...prev, ...page.comments])
            : pruneCommentForest(page.comments)
        );
        setLoadState('ready');
      } catch {
        if (!append && loadGeneration !== commentsLoadGenerationRef.current) {
          return;
        }
        if (!append) setLoadState('error');
        else toast.show({ variant: 'error', title: labels.loadError, layer: 'top' });
      } finally {
        if (append || loadGeneration === commentsLoadGenerationRef.current) {
          setLoadingMore(false);
        }
      }
    },
    [albumId, artistSlug, labels.loadError]
  );

  const focusCommentInView = useCallback((commentId: string) => {
    const focus = () => {
      document.getElementById(albumCommentDomId(commentId))?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    };
    requestAnimationFrame(() => requestAnimationFrame(focus));
  }, []);

  const applyCommentDeepLinkTarget = useCallback(
    (commentId: string, loaded: AlbumCommentDto[]) => {
      const located = findCommentInTree(loaded, commentId);
      if (!located) return false;
      if (located.isReply) {
        setCollapsedReplyRoots((prev) => {
          const next = new Set(prev);
          next.delete(located.rootId);
          return next;
        });
      }
      setHighlightedCommentId(commentId);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedCommentId(null);
        highlightTimerRef.current = null;
      }, ALBUM_COMMENT_DEEP_LINK_HIGHLIGHT_MS);

      const scrollToTarget = () => focusCommentInView(commentId);
      if (located.isReply) {
        requestAnimationFrame(() => requestAnimationFrame(scrollToTarget));
      } else {
        scrollToTarget();
      }
      return true;
    },
    [focusCommentInView]
  );

  const resolveCommentDeepLink = useCallback(
    async (targetCommentId: string) => {
      const loadGeneration = ++commentsLoadGenerationRef.current;
      setLoadState('loading');
      try {
        let cursor: string | null = null;
        let accumulated: AlbumCommentDto[] = [];
        let pageNextCursor: string | null = null;
        let pageArtistUserId = '';

        for (;;) {
          const page = await fetchAlbumCommentsPage({
            albumId,
            artistSlug,
            cursor,
          });
          if (loadGeneration !== commentsLoadGenerationRef.current) {
            return;
          }
          pageArtistUserId = page.artistUserId;
          pageNextCursor = page.nextCursor;
          accumulated = cursor ? [...accumulated, ...page.comments] : page.comments;
          setResolvedArtistUserId(page.artistUserId);
          setNextCursor(page.nextCursor);
          setComments(pruneCommentForest(accumulated));

          if (findCommentInTree(pruneCommentForest(accumulated), targetCommentId)) {
            break;
          }
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
        }

        if (loadGeneration !== commentsLoadGenerationRef.current) {
          return;
        }
        setComments(pruneCommentForest(accumulated));
        setNextCursor(pageNextCursor);
        if (pageArtistUserId) setResolvedArtistUserId(pageArtistUserId);
        setLoadState('ready');
        applyCommentDeepLinkTarget(targetCommentId, pruneCommentForest(accumulated));
      } catch {
        if (loadGeneration !== commentsLoadGenerationRef.current) {
          return;
        }
        setLoadState('error');
      }
    },
    [albumId, applyCommentDeepLinkTarget, artistSlug]
  );

  useEffect(() => {
    if (!isOpen) {
      deepLinkResolvedRef.current = null;
      deepLinkFinishedRef.current = false;
      return;
    }
    const target = deepLinkCommentId?.trim() ?? '';
    if (target) {
      if (deepLinkResolvedRef.current === target) return;
      deepLinkResolvedRef.current = target;
      void resolveCommentDeepLink(target).finally(() => {
        deepLinkFinishedRef.current = true;
        onDeepLinkConsumed?.();
      });
      return;
    }
    if (deepLinkFinishedRef.current) {
      deepLinkFinishedRef.current = false;
      return;
    }
    deepLinkResolvedRef.current = null;
    setCollapsedReplyRoots(new Set());
    void loadPage(null, false);
  }, [isOpen, deepLinkCommentId, loadPage, onDeepLinkConsumed, resolveCommentDeepLink]);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    []
  );

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
      const rootId = findCommentRootId(commentsRef.current, parentId) ?? reply.parentId ?? parentId;
      setComments((prev) => pruneCommentForest(appendReplyComment(prev, rootId, reply)));
      setReplyingToId(null);
      if (viewer?.id) bumpSummaryAfterNewComment(viewer.id);
    } catch {
      toast.show({ variant: 'error', title: labels.loadError, layer: 'top' });
    } finally {
      setReplySending(false);
    }
  };

  const handleToggleLike = useCallback(
    (commentId: string) => {
      const snapshot = commentsRef.current;
      const requestGeneration = (likeRequestGenerationRef.current.get(commentId) ?? 0) + 1;
      likeRequestGenerationRef.current.set(commentId, requestGeneration);

      setComments((prev) =>
        updateCommentInTree(prev, commentId, (c) => ({
          ...c,
          likedByViewer: !c.likedByViewer,
          likeCount: c.likedByViewer ? Math.max(0, c.likeCount - 1) : c.likeCount + 1,
        }))
      );

      const syncLikeFromApi = async () => {
        try {
          const result = await toggleAlbumCommentLike(commentId);
          if (likeRequestGenerationRef.current.get(commentId) !== requestGeneration) return;
          setComments((prev) =>
            updateCommentInTree(prev, commentId, {
              likedByViewer: result.liked,
              likeCount: result.likeCount,
            })
          );
        } catch {
          if (likeRequestGenerationRef.current.get(commentId) !== requestGeneration) return;
          setComments(snapshot);
          toast.show({ variant: 'error', title: labels.loadError, layer: 'top' });
        }
      };

      const previous = likeApiChainRef.current.get(commentId) ?? Promise.resolve();
      const next = previous.then(syncLikeFromApi, syncLikeFromApi);
      likeApiChainRef.current.set(commentId, next);
    },
    [labels.loadError]
  );

  const handleEdit = async (commentId: string, body: string) => {
    const updated = await updateAlbumComment({ commentId, body });
    setComments((prev) => replaceCommentInTree(prev, updated));
  };

  const handleDelete = useCallback(
    (commentId: string) => {
      const snapshot = commentsRef.current;
      const deletedAt = new Date().toISOString();

      setComments((prev) => applyCommentDeleteToForest(prev, commentId, deletedAt));

      void (async () => {
        try {
          await deleteAlbumComment(commentId);
          if (summary) {
            onSummaryChange({
              ...summary,
              totalCount: Math.max(0, summary.totalCount - 1),
            });
          }
        } catch {
          setComments(snapshot);
          toast.show({ variant: 'error', title: labels.loadError, layer: 'top' });
        }
      })();
    },
    [labels.loadError, onSummaryChange, summary]
  );

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

  const renderReplyNodes = (replies: AlbumCommentDto[]): ReactNode =>
    replies.map((reply) => (
      <AlbumCommentRow
        key={reply.id}
        comment={reply}
        lang={lang}
        labels={labels.row}
        mentionTargets={mentionTargets}
        isReply
        highlighted={highlightedCommentId === reply.id}
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
        viewerAvatarPath={null}
        viewerAvatarUrl={avatarSrc}
        viewerDisplayName={viewerDisplayName}
        requireAuthForAction={requireAuthForAction}
      >
        {reply.replies.length > 0 ? renderReplyNodes(reply.replies) : null}
      </AlbumCommentRow>
    ));

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
                      mentionTargets={mentionTargets}
                      highlighted={highlightedCommentId === root.id}
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
                      viewerAvatarPath={null}
                      viewerAvatarUrl={avatarSrc}
                      viewerDisplayName={viewerDisplayName}
                      requireAuthForAction={requireAuthForAction}
                      repliesThreadExpanded={isRepliesThreadExpanded(root.id)}
                      onToggleRepliesThread={() => toggleRepliesThread(root.id)}
                    >
                      {isRepliesThreadExpanded(root.id) || Boolean(root.deletedAt)
                        ? renderReplyNodes(root.replies)
                        : null}
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
