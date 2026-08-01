import React, { Suspense } from 'react';

import type { AlbumEditable, IArticles } from '@models';
import type { TrackLyricsBundle } from '@shared/lib/lyrics/types';
import { DashboardModalChunkFallback } from './DashboardModalChunkFallback';
import {
  AddLyricsModalLazy,
  EditAlbumModalLazy,
  EditArticleModalV2Lazy,
  EditLyricsModalLazy,
  PreviewLyricsModalLazy,
  SyncLyricsModalLazy,
} from '../../lib/dashboardLazyModals';
import type { AlbumFormData } from '../modals/album/EditAlbumModal.types';

type AddLyricsModalState = {
  isOpen: boolean;
  albumId: string;
  trackId: string;
  trackTitle: string;
};

type EditLyricsModalState = {
  isOpen: boolean;
  albumId: string;
  trackId: string;
  trackTitle: string;
  trackState: TrackLyricsBundle['state'];
  hasSyncedLyrics?: boolean;
  initialLyrics?: string;
  initialAuthorship?: string;
};

type PreviewLyricsModalState = {
  isOpen: boolean;
  lyrics: TrackLyricsBundle;
  trackSrc?: string;
  mediaOwnerUserId?: string;
};

type SyncLyricsModalState = {
  isOpen: boolean;
  albumId: string;
  trackId: string;
  trackTitle: string;
  trackSrc?: string;
  mediaOwnerUserId?: string;
  trackDurationSeconds?: number;
  lyricsText?: string;
  authorship?: string;
};

type EditAlbumModalState = {
  isOpen: boolean;
  albumId?: string;
};

type EditArticleModalState = {
  isOpen: boolean;
  article: IArticles | null;
};

export type DashboardLazyModalsProps = {
  addLyricsModal: AddLyricsModalState | null;
  editLyricsModal: EditLyricsModalState | null;
  previewLyricsModal: PreviewLyricsModalState | null;
  syncLyricsModal: SyncLyricsModalState | null;
  editAlbumModal: EditAlbumModalState | null;
  editArticleModal: EditArticleModalState | null;
  onCloseAddLyrics: () => void;
  onCloseEditLyrics: () => void;
  onClosePreviewLyrics: () => void;
  onCloseSyncLyrics: () => void;
  onCloseEditAlbum: () => void;
  onCloseEditArticle: () => void;
  onAddLyricsSave: (lyrics: string, authorship?: string) => void | Promise<void>;
  onEditLyricsSave: (lyrics: string, authorship?: string) => void | Promise<void>;
  getTrackLyricsText: (albumId: string, trackId: string) => string;
  getTrackAuthorship: (albumId: string, trackId: string) => string | undefined;
  onEditAlbumDiscardRiskChange: (hasRisk: boolean) => void;
  onEditAlbumNext: (
    formData: AlbumFormData,
    updatedAlbum?: AlbumEditable,
    meta?: { createdNewAlbum?: boolean }
  ) => void | Promise<void>;
  onSyncLyricsSave: (bundle: TrackLyricsBundle) => void;
  onSyncLyricsSaved: () => void;
  onArticleEditorToast: () => void;
  onArticlePersisted: (options: { affectsPublicSurface: boolean }) => void;
  profilePublicSlug?: string | null;
};

export function DashboardLazyModals({
  addLyricsModal,
  editLyricsModal,
  previewLyricsModal,
  syncLyricsModal,
  editAlbumModal,
  editArticleModal,
  onCloseAddLyrics,
  onCloseEditLyrics,
  onClosePreviewLyrics,
  onCloseSyncLyrics,
  onCloseEditAlbum,
  onCloseEditArticle,
  onAddLyricsSave,
  onEditLyricsSave,
  getTrackLyricsText,
  getTrackAuthorship,
  onEditAlbumDiscardRiskChange,
  onEditAlbumNext,
  onSyncLyricsSave,
  onSyncLyricsSaved,
  onArticleEditorToast,
  onArticlePersisted,
  profilePublicSlug,
}: DashboardLazyModalsProps) {
  return (
    <>
      {addLyricsModal ? (
        <Suspense fallback={<DashboardModalChunkFallback />}>
          <AddLyricsModalLazy
            isOpen={addLyricsModal.isOpen}
            trackTitle={addLyricsModal.trackTitle}
            onClose={onCloseAddLyrics}
            onSave={onAddLyricsSave}
          />
        </Suspense>
      ) : null}

      {editLyricsModal ? (
        <Suspense fallback={<DashboardModalChunkFallback />}>
          <EditLyricsModalLazy
            isOpen={editLyricsModal.isOpen}
            initialLyrics={
              editLyricsModal.initialLyrics ??
              getTrackLyricsText(editLyricsModal.albumId, editLyricsModal.trackId)
            }
            initialAuthorship={
              editLyricsModal.initialAuthorship ||
              getTrackAuthorship(editLyricsModal.albumId, editLyricsModal.trackId)
            }
            onClose={onCloseEditLyrics}
            onSave={onEditLyricsSave}
          />
        </Suspense>
      ) : null}

      {previewLyricsModal ? (
        <Suspense fallback={<DashboardModalChunkFallback />}>
          <PreviewLyricsModalLazy
            isOpen={previewLyricsModal.isOpen}
            lyrics={previewLyricsModal.lyrics}
            trackSrc={previewLyricsModal.trackSrc}
            mediaOwnerUserId={previewLyricsModal.mediaOwnerUserId}
            onClose={onClosePreviewLyrics}
          />
        </Suspense>
      ) : null}

      {syncLyricsModal ? (
        <Suspense fallback={<DashboardModalChunkFallback />}>
          <SyncLyricsModalLazy
            isOpen={syncLyricsModal.isOpen}
            albumId={syncLyricsModal.albumId}
            trackId={syncLyricsModal.trackId}
            trackTitle={syncLyricsModal.trackTitle}
            trackSrc={syncLyricsModal.trackSrc}
            mediaOwnerUserId={syncLyricsModal.mediaOwnerUserId}
            trackDurationSeconds={syncLyricsModal.trackDurationSeconds}
            initialLyricsText={syncLyricsModal.lyricsText}
            authorship={syncLyricsModal.authorship}
            onClose={onCloseSyncLyrics}
            onSave={onSyncLyricsSave}
            onSyncSaved={onSyncLyricsSaved}
          />
        </Suspense>
      ) : null}

      {editAlbumModal ? (
        <Suspense fallback={<DashboardModalChunkFallback />}>
          <EditAlbumModalLazy
            key={editAlbumModal.albumId ?? 'new-album'}
            isOpen={editAlbumModal.isOpen}
            albumId={editAlbumModal.albumId}
            onDiscardRiskChange={onEditAlbumDiscardRiskChange}
            onClose={onCloseEditAlbum}
            onNext={onEditAlbumNext}
          />
        </Suspense>
      ) : null}

      {editArticleModal?.article ? (
        <Suspense fallback={<DashboardModalChunkFallback />}>
          <EditArticleModalV2Lazy
            isOpen={editArticleModal.isOpen}
            article={editArticleModal.article}
            onClose={onCloseEditArticle}
            publicArtistSlug={profilePublicSlug}
            onArticleEditorToast={onArticleEditorToast}
            onArticlePersisted={onArticlePersisted}
          />
        </Suspense>
      ) : null}
    </>
  );
}
