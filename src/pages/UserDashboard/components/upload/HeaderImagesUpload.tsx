// src/pages/UserDashboard/components/HeaderImagesUpload.tsx
import React, { useState, useRef, useEffect } from 'react';
import { X as XIcon, Upload as UploadIcon, Plus as PlusIcon } from 'lucide-react';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useLang } from '@app/providers/lang';
import { CoverImageCropModal } from '../modals/cover/CoverImageCropModal';
import { buildProxyImageUrlFromStoragePath } from '@shared/lib/proxyImageUrl';
import { uploadFile, deleteHeroImage } from '@shared/api/storage';
import { getUser } from '@shared/lib/auth';
import { uniqueUploadFileSuffix } from '@shared/lib/uniqueUploadFileSuffix';
import './HeaderImagesUpload.style.scss';

interface HeaderImagesUploadProps {
  currentImages?: string[];
  onImagesUpdated?: (urls: string[]) => void;
  layout?: 'stacked' | 'inline';
  onUploadingChange?: (uploading: boolean) => void;
}

// Валидация файла
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MIN_WIDTH = 1920;
const MIN_HEIGHT = 1140;
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
];
const MAX_IMAGES = 10; // Максимальное количество изображений

/**
 * Извлекает простой URL из image-set() строки для использования в <img src>
 * @param imageSetOrUrl - image-set() строка или простой URL или storagePath
 * @returns простой URL для превью
 */
function extractPreviewUrl(imageSetOrUrl: string): string {
  // Если это storagePath (начинается с "users/"), преобразуем в proxy URL
  if (imageSetOrUrl.startsWith('users/') && imageSetOrUrl.includes('/hero/')) {
    const proxyUrl = buildProxyImageUrlFromStoragePath(imageSetOrUrl);
    return proxyUrl;
  }

  // Если это уже простой URL (proxy URL или Supabase URL), возвращаем как есть
  if (!imageSetOrUrl.includes('image-set')) {
    return imageSetOrUrl;
  }

  // Извлекаем первый URL из image-set()
  // Паттерн: url('/images/hero/2.avif') или url('/images/hero/2.jpg')
  const urlMatch = imageSetOrUrl.match(/url\(['"]([^'"]+)['"]\)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // Если не удалось извлечь, возвращаем как есть (на случай ошибки)
  return imageSetOrUrl;
}

function validateImageFile(file: File): Promise<{ valid: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Проверка типа файла
    if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
      resolve({
        valid: false,
        error: 'invalidFileType',
      });
      return;
    }

    // Проверка размера файла
    if (file.size > MAX_FILE_SIZE) {
      resolve({
        valid: false,
        error: 'fileTooLarge',
      });
      return;
    }

    // Проверка размеров изображения
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (img.width < MIN_WIDTH || img.height < MIN_HEIGHT) {
        resolve({
          valid: false,
          error: 'imageTooSmall',
        });
      } else {
        resolve({ valid: true });
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        valid: false,
        error: 'uploadError',
      });
    };
    img.src = objectUrl;
  });
}

export function HeaderImagesUpload({
  currentImages = [],
  onImagesUpdated,
  layout = 'stacked',
  onUploadingChange,
}: HeaderImagesUploadProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const [images, setImages] = useState<string[]>(currentImages);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  useEffect(() => {
    onUploadingChange?.(isUploading);
  }, [isUploading, onUploadingChange]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Синхронизируем images с currentImages при изменении пропсов
  useEffect(() => {
    setImages(currentImages);
  }, [currentImages]);

  const handleFileSelect = async (file: File) => {
    setError(null);

    // Проверяем лимит
    if (images.length >= MAX_IMAGES) {
      const errorMessage = (
        ui?.dashboard?.settingsModal?.validation?.maxImages ??
        'Можно загрузить до {count} изображений'
      ).replace('{count}', String(MAX_IMAGES));
      setError(errorMessage);
      return;
    }

    const validation = await validateImageFile(file);
    if (!validation.valid) {
      let errorMessage = '';
      switch (validation.error) {
        case 'invalidFileType':
          errorMessage =
            ui?.dashboard?.settingsModal?.validation?.invalidFileType ??
            'Неподдерживаемый формат файла';
          break;
        case 'fileTooLarge':
          errorMessage = (
            ui?.dashboard?.settingsModal?.validation?.fileTooLarge ?? 'Файл слишком большой'
          ).replace('{size}', '15');
          break;
        case 'imageTooSmall':
          errorMessage = (
            ui?.dashboard?.settingsModal?.validation?.imageTooSmall ??
            'Изображение слишком маленькое'
          )
            .replace('{width}', String(MIN_WIDTH))
            .replace('{height}', String(MIN_HEIGHT));
          break;
        default:
          errorMessage =
            ui?.dashboard?.settingsModal?.validation?.uploadError ?? 'Ошибка загрузки файла';
      }
      setError(errorMessage);
      return;
    }

    setSelectedFile(file);
    setIsCropModalOpen(true);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleSave = async (croppedBlob: Blob) => {
    try {
      setIsUploading(true);
      setError(null);

      const user = getUser();
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const fileName = `hero-${uniqueUploadFileSuffix()}.jpg`;

      const url = await uploadFile({
        userId: user.id,
        category: 'hero',
        file: croppedBlob,
        fileName,
        contentType: 'image/jpeg',
        upsert: false,
      });

      if (!url) {
        throw new Error('Failed to upload image');
      }

      // Убеждаемся, что URL это proxy URL, а не storagePath
      const finalUrl =
        url.startsWith('users/') && url.includes('/hero/')
          ? buildProxyImageUrlFromStoragePath(url)
          : url;

      const newImages = [...images, finalUrl];

      setImages(newImages);

      if (onImagesUpdated) {
        onImagesUpdated(newImages);
      }

      setIsCropModalOpen(false);
      setSelectedFile(null);
    } catch (err) {
      console.error('Error uploading header image:', err);
      setError(
        ui?.dashboard?.settingsModal?.messages?.coverUploadError ?? 'Ошибка загрузки изображения'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async (index: number) => {
    const imageToRemove = images[index];
    if (!imageToRemove) {
      console.warn(
        '⚠️ [HeaderImagesUpload] Попытка удалить изображение, но оно не найдено по индексу:',
        index
      );
      return;
    }

    // Удаляем все варианты изображения из Storage
    try {
      const deleted = await deleteHeroImage(imageToRemove);
      if (!deleted) {
        console.warn(
          '⚠️ [HeaderImagesUpload] Не удалось удалить варианты hero изображения из Storage, но продолжаем удаление из списка'
        );
        setError(
          'Изображение удалено из списка, но могут остаться файлы в хранилище. Сохраните изменения для применения.'
        );
      } else {
        setError(null);
      }
    } catch (error) {
      console.error('❌ [HeaderImagesUpload] Ошибка удаления hero изображения из Storage:', error);
      setError(
        'Ошибка удаления изображения из хранилища, но оно удалено из списка. Сохраните изменения для применения.'
      );
    }

    // Удаляем URL из массива
    const newImages = images.filter((_, i) => i !== index);

    setImages(newImages);
    if (onImagesUpdated) {
      onImagesUpdated(newImages);
    }
  };

  const coverHint =
    ui?.dashboard?.settingsModal?.hints?.coverImage ??
    'Recommended resolution: 2560 × 1522\nMinimum: 1920 × 1140\nFormat: JPG, PNG, WEBP, GIF, AVIF, HEIC/HEIF';
  const coverHintLines = coverHint.split('\n');
  const recommendedHint = coverHintLines[0] ?? coverHint;
  const formatHint = coverHintLines.slice(1).join('. ');

  if (layout === 'inline') {
    return (
      <>
        <div className="header-images-upload header-images-upload--inline">
          <div className="header-images-upload__inline-gallery">
            {images.map((imageSetOrUrl, index) => {
              const previewUrl = extractPreviewUrl(imageSetOrUrl);
              return (
                <div key={index} className="header-images-upload__inline-item">
                  <img
                    src={previewUrl}
                    alt={`Header ${index + 1}`}
                    className="header-images-upload__preview"
                  />
                  <button
                    type="button"
                    className="header-images-upload__remove"
                    onClick={() => handleRemove(index)}
                    aria-label="Удалить изображение"
                  >
                    <XIcon {...dashboardActionIconProps({ size: 16 })} />
                  </button>
                </div>
              );
            })}

            {images.length < MAX_IMAGES ? (
              <button
                type="button"
                className="header-images-upload__inline-add"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <PlusIcon
                  className="header-images-upload__inline-add-icon"
                  {...dashboardActionIconProps({ size: 24 })}
                />
                <span>{ui?.dashboard?.addImage ?? 'Add image'}</span>
              </button>
            ) : null}
          </div>

          <div className="header-images-upload__inline-footer">
            <p className="header-images-upload__inline-hint">
              {recommendedHint}
              {formatHint ? `. ${formatHint}` : ''}
            </p>
            <span className="header-images-upload__inline-count">
              {(ui?.dashboard?.headerImagesCount ?? '{current} / {max} images')
                .replace('{current}', String(images.length))
                .replace('{max}', String(MAX_IMAGES))}
            </span>
          </div>

          {error ? <div className="header-images-upload__error">{error}</div> : null}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif"
            className="header-images-upload__input"
            onChange={handleFileInput}
          />
        </div>

        <CoverImageCropModal
          isOpen={isCropModalOpen}
          imageFile={selectedFile}
          onClose={() => {
            setIsCropModalOpen(false);
            setSelectedFile(null);
          }}
          onSave={handleSave}
        />
      </>
    );
  }

  return (
    <>
      <div className="header-images-upload">
        {images.length > 0 && (
          <div className="header-images-upload__list">
            {images.map((imageSetOrUrl, index) => {
              // Извлекаем простой URL для превью (из image-set() или используем как есть)
              const previewUrl = extractPreviewUrl(imageSetOrUrl);
              return (
                <div key={index} className="header-images-upload__item">
                  <img
                    src={previewUrl}
                    alt={`Header ${index + 1}`}
                    className="header-images-upload__preview"
                  />
                  <button
                    type="button"
                    className="header-images-upload__remove"
                    onClick={() => handleRemove(index)}
                    aria-label="Удалить изображение"
                  >
                    <XIcon {...dashboardActionIconProps({ size: 16 })} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {images.length < MAX_IMAGES && (
          <div
            className="header-images-upload__dropzone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon
              className="header-images-upload__dropzone-icon"
              {...dashboardActionIconProps({ size: 32 })}
            />
            <div className="header-images-upload__dropzone-text">
              {ui?.dashboard?.settingsModal?.buttons?.uploadCover ?? 'Загрузить изображение'}
            </div>
            <div className="header-images-upload__dropzone-hint">
              {ui?.dashboard?.settingsModal?.hints?.coverImage ??
                'Рекомендуемое разрешение: 2560 × 1522'}
            </div>
            <div className="header-images-upload__dropzone-count">
              {images.length} / {MAX_IMAGES}
            </div>
          </div>
        )}

        {error && <div className="header-images-upload__error">{error}</div>}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif"
          className="header-images-upload__input"
          onChange={handleFileInput}
        />
      </div>

      <CoverImageCropModal
        isOpen={isCropModalOpen}
        imageFile={selectedFile}
        onClose={() => {
          setIsCropModalOpen(false);
          setSelectedFile(null);
        }}
        onSave={handleSave}
      />
    </>
  );
}
