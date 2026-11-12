import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useLang } from '@app/providers/lang';
import type { SupportedLang } from '@shared/model/lang';

function albumCommentsTeaserFallbacks(lang: SupportedLang) {
  return lang === 'ru'
    ? {
        noComments: 'Нет комментариев',
        openComments: 'Открыть комментарии',
        countTemplate: '{count}',
      }
    : {
        noComments: 'No comments',
        openComments: 'Open comments',
        countTemplate: '{count}',
      };
}
import {
  ALBUM_COMMENT_DEEP_LINK_QUERY_PARAM,
  readAlbumCommentIdFromSearchParams,
} from '@shared/lib/albumCommentDeepLink';
import { useEffectiveSearchParams } from '@shared/lib/hooks/useEffectiveLocation';
import { fetchAlbumCommentsSummary, type AlbumCommentsSummaryDto } from '@shared/api/albumComments';
import { Share } from '@features/share';
import '@features/share/ui/style.scss';
import { pluralizeReplyCount } from '../lib/pluralizeReplyCount';
import { AlbumCommentsTeaser } from './AlbumCommentsTeaser';
import { AlbumCommentsModal, type AlbumCommentsModalLabels } from './AlbumCommentsModal';
import './albumComments.scss';

type AlbumCommentsSectionProps = {
  albumId: string;
  artistSlug: string;
  shareUrl: string;
};

export function AlbumCommentsSection({ albumId, artistSlug, shareUrl }: AlbumCommentsSectionProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.albumComments;
  const [searchParams, setSearchParams] = useEffectiveSearchParams();

  const [summary, setSummary] = useState<AlbumCommentsSummaryDto | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [artistUserId, setArtistUserId] = useState<string | null>(null);
  const autoOpenedForDeepLinkRef = useRef<string | null>(null);

  const deepLinkCommentId = useMemo(
    () => readAlbumCommentIdFromSearchParams(searchParams),
    [searchParams]
  );

  const labels = useMemo(() => {
    const fallback = albumCommentsTeaserFallbacks(lang);
    return {
      noComments: copy?.teaserNoComments ?? fallback.noComments,
      commentsCount: (count: number) =>
        (copy?.teaserCount ?? fallback.countTemplate).replace('{count}', String(count)),
      openComments: copy?.teaserOpenAria ?? fallback.openComments,
    };
  }, [copy, lang]);

  const modalLabels: AlbumCommentsModalLabels = useMemo(
    () => ({
      title: copy?.modalTitle ?? 'Comments',
      emptyTitle: copy?.emptyTitle ?? 'No comments yet.',
      emptyHint: copy?.emptyHint ?? 'Be the first.',
      loadError: copy?.loadError ?? 'Failed to load comments.',
      retry: copy?.retry ?? 'Retry',
      showMore: copy?.showMore ?? 'Show more',
      reportThanks: copy?.reportThanks ?? 'Thanks. Your report was received.',
      composerPlaceholder: copy?.composerPlaceholder ?? 'Leave a comment…',
      commentsCount: (count: number) =>
        (copy?.modalCount ?? '{count}').replace('{count}', String(count)),
      row: {
        artistBadge: copy?.artistBadge ?? 'Artist',
        reply: copy?.reply ?? 'Reply',
        cancel: copy?.cancel ?? 'Cancel',
        edited: copy?.edited ?? 'edited',
        deleted: copy?.deleted ?? 'Comment deleted',
        like: copy?.like ?? 'Like',
        menu: copy?.menu ?? 'Comment menu',
        edit: copy?.edit ?? 'Edit',
        delete: copy?.delete ?? 'Delete',
        report: copy?.report ?? 'Report',
        save: copy?.save ?? 'Save',
        replyPlaceholder: (name: string) =>
          (copy?.replyPlaceholder ?? 'Reply to {name}…').replace('{name}', name),
        showReplies: (count: number) =>
          pluralizeReplyCount(count, lang, {
            one: copy?.showRepliesOne ?? 'Show {count} reply',
            few: copy?.showRepliesFew ?? 'Show {count} replies',
            many: copy?.showRepliesMany ?? 'Show {count} replies',
          }),
        hideReplies: copy?.hideReplies ?? 'Hide replies',
      },
    }),
    [copy, lang]
  );

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const payload = await fetchAlbumCommentsSummary({ albumId, artistSlug });
      setSummary(payload.summary);
      setArtistUserId(payload.artistUserId);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [albumId, artistSlug]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (!deepLinkCommentId) {
      autoOpenedForDeepLinkRef.current = null;
      return;
    }
    if (autoOpenedForDeepLinkRef.current === deepLinkCommentId) return;
    autoOpenedForDeepLinkRef.current = deepLinkCommentId;
    setModalOpen(true);
  }, [deepLinkCommentId]);

  const handleSummaryChange = useCallback((next: AlbumCommentsSummaryDto) => {
    setSummary(next);
  }, []);

  const handleDeepLinkConsumed = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(ALBUM_COMMENT_DEEP_LINK_QUERY_PARAM);
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  return (
    <>
      <div className="album-comments-actions-bar">
        <AlbumCommentsTeaser
          summary={summary}
          loading={summaryLoading}
          labels={labels}
          onOpen={() => setModalOpen(true)}
        />
        <div className="album-comments-actions-bar__share">
          <Share url={shareUrl} />
        </div>
      </div>
      <AlbumCommentsModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          void loadSummary();
        }}
        albumId={albumId}
        artistSlug={artistSlug}
        labels={modalLabels}
        summary={summary}
        onSummaryChange={handleSummaryChange}
        artistUserId={artistUserId}
        deepLinkCommentId={deepLinkCommentId}
        onDeepLinkConsumed={handleDeepLinkConsumed}
      />
    </>
  );
}
