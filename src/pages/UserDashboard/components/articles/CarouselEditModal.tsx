// src/pages/UserDashboard/components/CarouselEditModal.tsx
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Loader2 as Loader2Icon, Plus as PlusIcon, X as XIcon } from 'lucide-react';
import { getUserImageUrl } from '@shared/api/albums';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { optionalMediaSrc } from '@shared/lib/media/optionalMediaUrl';
import { ArticleCoverPlaceholder } from '@entities/article';
import { uploadFile } from '@shared/api/storage';
import { uniqueUploadFileSuffix } from '@shared/lib/uniqueUploadFileSuffix';
import { Popup } from '@shared/ui/popup';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useCloseWithUnsavedConfirmation } from '@shared/lib/hooks/useCloseWithUnsavedConfirmation';
import { InlineEditDiscardDialog, getCloseDiscardConfirmLabels } from '../shared/EditableCardField';
import '@shared/ui/dashboard-save/dashboard-save.scss';
import './CarouselEditModal.style.scss';

interface CarouselEditModalProps {
  /** Владелец медиа в Storage */
  mediaOwnerUserId?: string;
  blockId: string;
  initialImageKeys: string[];
  onSave: (imageKeys: string[]) => void;
  onCancel: () => void;
}

export function CarouselEditModal({
  mediaOwnerUserId,
  blockId,
  initialImageKeys,
  onSave,
  onCancel,
}: CarouselEditModalProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const [imageKeys, setImageKeys] = useState<string[]>(initialImageKeys);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImageKeys(initialImageKeys);
  }, [blockId, initialImageKeys]);

  const hasCarouselChanges = useMemo(() => {
    if (imageKeys.length !== initialImageKeys.length) return true;
    return imageKeys.some((k, i) => k !== initialImageKeys[i]);
  }, [imageKeys, initialImageKeys]);

  const finalizeCarouselDismiss = useCallback(() => {
    onCancel();
  }, [onCancel]);

  const carouselCloseGuard = useCloseWithUnsavedConfirmation({
    isOpen: true,
    isBusy: isUploading,
    hasUnsavedChanges: hasCarouselChanges,
    onClose: finalizeCarouselDismiss,
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const newImageKeys: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const baseFileName = file.name.replace(/\.[^/.]+$/, '');
        const fileName = `article_${uniqueUploadFileSuffix()}_${baseFileName}.${fileExtension}`;
        const imageKey = fileName;

        const url = await uploadFile({
          file,
          category: 'articles',
          fileName,
          userId: mediaOwnerUserId,
        });

        if (url) {
          newImageKeys.push(imageKey);
        }
      }
      setImageKeys([...imageKeys, ...newImageKeys]);
    } catch (error) {
      console.error('Error uploading images:', error);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = (index: number) => {
    setImageKeys(imageKeys.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave(imageKeys);
  };

  const handleRequestCancel = () => carouselCloseGuard.requestClose();

  return (
    <>
      <Popup
        isActive={true}
        onClose={handleRequestCancel}
        closeBlocked={isUploading || carouselCloseGuard.discardDialogOpen}
      >
        <div className="carousel-edit-modal">
          <div
            className={`edit-article-v2__carousel-edit-modal${isUploading ? ' dashboard-save-card--busy' : ''}`}
            aria-busy={isUploading}
          >
            <div className="edit-article-v2__carousel-edit-header">
              <h2 className="edit-article-v2__carousel-edit-title">Редактирование карусели</h2>
              <div className="edit-article-v2__carousel-edit-count">
                {imageKeys.length} {imageKeys.length === 1 ? 'фотография' : 'фотографий'}
              </div>
            </div>

            <div className="edit-article-v2__carousel-edit-content">
              <div className="edit-article-v2__carousel-edit-thumbnails">
                {imageKeys.map((imageKey, index) => {
                  const thumbUrl = optionalMediaSrc(
                    getUserImageUrl(imageKey, 'articles', '.jpg', undefined, mediaOwnerUserId),
                    'CarouselEditModal:thumbnail',
                    { index }
                  );
                  return (
                    <div key={imageKey} className="edit-article-v2__carousel-edit-thumbnail">
                      {thumbUrl ? (
                        <img src={thumbUrl} alt={`Image ${index + 1}`} />
                      ) : (
                        <ArticleCoverPlaceholder alt={`Image ${index + 1}`} />
                      )}
                      <button
                        type="button"
                        className="edit-article-v2__carousel-edit-remove"
                        onClick={() => handleRemoveImage(index)}
                        aria-label="Удалить изображение"
                      >
                        <XIcon {...dashboardActionIconProps({ size: 16 })} />
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="edit-article-v2__carousel-edit-add"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  aria-label={isUploading ? 'Загрузка изображений' : 'Добавить изображения'}
                >
                  {isUploading ? (
                    <Loader2Icon
                      {...dashboardActionIconProps({ size: 20 })}
                      className="edit-article-v2__carousel-edit-add-spinner"
                    />
                  ) : (
                    <PlusIcon {...dashboardActionIconProps({ size: 20 })} />
                  )}
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            <div className="edit-article-v2__carousel-edit-footer">
              <button
                type="button"
                className="edit-article-v2__carousel-edit-cancel"
                onClick={handleRequestCancel}
                disabled={isUploading}
              >
                Отмена
              </button>
              <button
                type="button"
                className="edit-article-v2__carousel-edit-save"
                onClick={handleSave}
                disabled={isUploading}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
        <InlineEditDiscardDialog
          open={carouselCloseGuard.discardDialogOpen}
          labels={getCloseDiscardConfirmLabels(ui ?? undefined)}
          titleId={carouselCloseGuard.discardTitleDomId}
          onStay={carouselCloseGuard.dismissDiscardDialog}
          onDiscard={carouselCloseGuard.finalizeCloseWithoutSaving}
        />
      </Popup>
    </>
  );
}
