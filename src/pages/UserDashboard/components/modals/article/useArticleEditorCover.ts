import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';

import type { IInterface } from '@models';
import { uploadFile } from '@shared/api/storage';
import { sanitizeFileName } from '@shared/lib/sanitizeFileName';
import { uniqueUploadFileSuffix } from '@shared/lib/uniqueUploadFileSuffix';

export type ArticleCoverUploadState = {
  preview: string | null;
  status: 'idle' | 'uploading' | 'error';
  progress: number;
  error: string | null;
  dragActive: boolean;
};

const EMPTY_COVER_UPLOAD: ArticleCoverUploadState = {
  preview: null,
  status: 'idle',
  progress: 0,
  error: null,
  dragActive: false,
};

type UseArticleEditorCoverOptions = {
  /** Last saved cover key (from article in DB). */
  savedCoverKey: string;
  ui: IInterface | null;
  disabled?: boolean;
};

/**
 * Cover edits stay local until Save draft / Publish.
 * Selecting a file only creates a blob preview; storage + DB write happen in commitCoverForSave.
 */
export function useArticleEditorCover({
  savedCoverKey,
  ui,
  disabled = false,
}: UseArticleEditorCoverOptions) {
  const [coverUpload, setCoverUpload] = useState<ArticleCoverUploadState>(EMPTY_COVER_UPLOAD);
  const [coverRemoved, setCoverRemoved] = useState(false);
  const localPreviewRef = useRef<string | null>(null);
  const pendingFileRef = useRef<File | null>(null);

  const clearLocalPreview = useCallback(() => {
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
    }
  }, []);

  const resetCoverUpload = useCallback(() => {
    clearLocalPreview();
    pendingFileRef.current = null;
    setCoverRemoved(false);
    setCoverUpload(EMPTY_COVER_UPLOAD);
  }, [clearLocalPreview]);

  useEffect(() => {
    return () => {
      clearLocalPreview();
      pendingFileRef.current = null;
    };
  }, [clearLocalPreview]);

  const hasCoverChanges = coverRemoved || Boolean(coverUpload.preview);

  /** Cover key to show in the editor (empty when removed or replaced by local preview). */
  const displayCoverKey = coverRemoved || coverUpload.preview ? '' : savedCoverKey;

  const selectCoverFile = useCallback(
    (file: File) => {
      if (disabled) return;

      if (!file.type.startsWith('image/')) {
        setCoverUpload((prev) => ({
          ...prev,
          status: 'error',
          error: ui?.dashboard?.pleaseSelectImageFile ?? 'Please select an image file',
        }));
        return;
      }

      clearLocalPreview();
      pendingFileRef.current = file;
      localPreviewRef.current = URL.createObjectURL(file);
      setCoverRemoved(false);
      setCoverUpload({
        preview: localPreviewRef.current,
        status: 'idle',
        progress: 0,
        error: null,
        dragActive: false,
      });
    },
    [clearLocalPreview, disabled, ui?.dashboard?.pleaseSelectImageFile]
  );

  const handleCoverDrag = useCallback(
    (event: DragEvent) => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();

      if (event.type === 'dragenter' || event.type === 'dragover') {
        setCoverUpload((prev) => ({ ...prev, dragActive: true }));
      }
      if (event.type === 'dragleave') {
        setCoverUpload((prev) => ({ ...prev, dragActive: false }));
      }
    },
    [disabled]
  );

  const handleCoverDrop = useCallback(
    (event: DragEvent) => {
      if (disabled) return;
      event.preventDefault();
      event.stopPropagation();
      setCoverUpload((prev) => ({ ...prev, dragActive: false }));

      const file = event.dataTransfer.files?.[0];
      if (file) {
        selectCoverFile(file);
      }
    },
    [disabled, selectCoverFile]
  );

  const handleCoverFileInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        selectCoverFile(file);
      }
      event.target.value = '';
    },
    [selectCoverFile]
  );

  const handleCoverRemove = useCallback(() => {
    if (disabled) return;

    clearLocalPreview();
    pendingFileRef.current = null;
    setCoverRemoved(true);
    setCoverUpload(EMPTY_COVER_UPLOAD);
  }, [clearLocalPreview, disabled]);

  /**
   * Upload pending file to storage (if any) and return the img key for Save draft / Publish.
   * Does not write to the articles API — caller includes the key in the article save body.
   */
  const commitCoverForSave = useCallback(
    async (previousSavedKey: string): Promise<string> => {
      const pendingFile = pendingFileRef.current;

      if (pendingFile) {
        setCoverUpload((prev) => ({
          ...prev,
          status: 'uploading',
          progress: 30,
          error: null,
        }));

        const fileExtension = pendingFile.name.split('.').pop() || 'jpg';
        const baseFileName = pendingFile.name.replace(/\.[^/.]+$/, '');
        const rawFileName = `article_cover_${uniqueUploadFileSuffix()}_${baseFileName}.${fileExtension}`;
        const finalImageKey = sanitizeFileName(rawFileName);
        const previousCoverKey =
          previousSavedKey && previousSavedKey.startsWith('article_cover_')
            ? previousSavedKey
            : undefined;

        const url = await uploadFile({
          file: pendingFile,
          category: 'articles',
          fileName: rawFileName,
          ...(previousCoverKey ? { previousImageKey: previousCoverKey } : {}),
        });

        if (!url) {
          setCoverUpload((prev) => ({
            ...prev,
            status: 'error',
            error: ui?.dashboard?.failedToUploadCover ?? 'Failed to upload cover image',
          }));
          throw new Error(ui?.dashboard?.failedToUploadCover ?? 'Failed to upload cover image');
        }

        clearLocalPreview();
        pendingFileRef.current = null;
        setCoverRemoved(false);
        setCoverUpload(EMPTY_COVER_UPLOAD);
        return finalImageKey;
      }

      if (coverRemoved) {
        return '';
      }

      return previousSavedKey;
    },
    [clearLocalPreview, coverRemoved, ui?.dashboard?.failedToUploadCover]
  );

  return {
    coverUpload,
    coverRemoved,
    displayCoverKey,
    hasCoverChanges,
    resetCoverUpload,
    handleCoverDrag,
    handleCoverDrop,
    handleCoverFileInput,
    handleCoverRemove,
    commitCoverForSave,
  };
}
