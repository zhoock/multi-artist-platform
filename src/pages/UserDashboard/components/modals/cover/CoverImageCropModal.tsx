// src/pages/UserDashboard/components/CoverImageCropModal.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Cropper, { Area, Point } from 'react-easy-crop';
import { Popup } from '@shared/ui/popup';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useLang } from '@app/providers/lang';
import { getUser } from '@shared/lib/auth';
import { DashboardSaveSpinner } from '@shared/ui/dashboard-save/DashboardSaveSpinner';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import '@shared/ui/dashboard-save/dashboard-save.scss';
import { useCloseWithUnsavedConfirmation } from '@shared/lib/hooks/useCloseWithUnsavedConfirmation';
import {
  InlineEditDiscardDialog,
  getCloseDiscardConfirmLabels,
} from '../../shared/EditableCardField';
import './CoverImageCropModal.style.scss';

interface CoverImageCropModalProps {
  isOpen: boolean;
  imageFile: File | null;
  onClose: () => void;
  onSave: (croppedImageBlob: Blob) => Promise<void>;
  onPreview?: (croppedImageBlob: Blob) => void;
}

// Фиксированные размеры для crop (соотношение как в ВК)
const CROP_WIDTH = 2560;
const CROP_HEIGHT = 1522;
const CROP_ASPECT_RATIO = CROP_WIDTH / CROP_HEIGHT;

// Ключ для localStorage (временное решение, потом можно в БД)
const COVER_CROP_DATA_KEY = 'cover_crop_data';

interface CropData {
  zoom: number;
  position: Point;
}

// Функция для создания обрезанного изображения
async function getCroppedImg(imageSrc: string, pixelCrop: Area, rotation = 0): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  // Устанавливаем размеры canvas равными финальным размерам обрезки
  canvas.width = CROP_WIDTH;
  canvas.height = CROP_HEIGHT;

  // Вычисляем масштаб для обрезки
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  // Координаты и размеры обрезки в исходных пикселях изображения
  const cropX = pixelCrop.x * scaleX;
  const cropY = pixelCrop.y * scaleY;
  const cropWidth = pixelCrop.width * scaleX;
  const cropHeight = pixelCrop.height * scaleY;

  // Рисуем обрезанное изображение на canvas
  ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, CROP_WIDTH, CROP_HEIGHT);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas is empty'));
        }
      },
      'image/jpeg',
      0.9
    );
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.src = url;
  });
}

export function CoverImageCropModal({
  isOpen,
  imageFile,
  onClose,
  onSave,
  onPreview,
}: CoverImageCropModalProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cropBaselineRef = useRef<{ zoom: number; crop: Point } | null>(null);

  // Загружаем изображение при изменении файла
  useEffect(() => {
    if (!imageFile || !isOpen) {
      cropBaselineRef.current = null;
      setImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setError(null);
      setIsPreviewMode(false);
      setPreviewBlob(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      setImageSrc(src);

      // Загружаем сохраненные данные обрезки
      const savedCropData = loadCropData();
      const nextZoom = savedCropData?.zoom ?? 1;
      const nextCrop = savedCropData?.position ?? { x: 0, y: 0 };
      cropBaselineRef.current = { zoom: nextZoom, crop: nextCrop };
      setCrop(nextCrop);
      setZoom(nextZoom);
    };
    reader.onerror = () => {
      setError(
        ui?.dashboard?.profileSettingsModal?.validation?.uploadError ?? 'Ошибка чтения файла'
      );
      setImageSrc(null);
    };
    reader.readAsDataURL(imageFile);
  }, [imageFile, isOpen, ui]);

  // Сохраняем данные обрезки при изменении
  useEffect(() => {
    if (isOpen && imageSrc) {
      saveCropData({ zoom, position: crop });
    }
  }, [zoom, crop, isOpen, imageSrc]);

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handlePreview = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    try {
      setIsSaving(true);
      setError(null);
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      setPreviewBlob(croppedBlob);
      setIsPreviewMode(true);

      // Не вызываем onPreview, чтобы не открывать изображение в новой вкладке
      // Предпросмотр показывается внутри модального окна
    } catch (err) {
      console.error('Error creating preview:', err);
      setError(
        ui?.dashboard?.profileSettingsModal?.validation?.uploadError ??
          'Ошибка создания предпросмотра'
      );
    } finally {
      setIsSaving(false);
    }
  }, [imageSrc, croppedAreaPixels, ui]);

  const handleSave = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    try {
      setIsSaving(true);
      setError(null);
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      await onSave(croppedBlob);
      // Очищаем сохраненные данные обрезки после успешного сохранения
      clearCropData();
      onClose();
    } catch (err) {
      console.error('Error saving cover:', err);
      let errorMessage =
        ui?.dashboard?.profileSettingsModal?.messages?.coverUploadError ??
        'Ошибка сохранения обложки';

      // Более детальные сообщения об ошибках
      if (err instanceof Error) {
        if (
          err.message.includes('network') ||
          err.message.includes('fetch') ||
          err.message.includes('Network')
        ) {
          errorMessage =
            ui?.dashboard?.profileSettingsModal?.validation?.networkError ??
            'Ошибка сети. Проверьте подключение к интернету.';
        } else if (err.message.includes('Failed to upload') || err.message.includes('upload')) {
          errorMessage =
            ui?.dashboard?.profileSettingsModal?.messages?.coverUploadError ??
            'Ошибка загрузки обложки';
        }
      }

      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  }, [imageSrc, croppedAreaPixels, onSave, onClose, ui]);

  const hasCropUnsavedChanges = useMemo(() => {
    const b = cropBaselineRef.current;
    if (!b || !imageSrc || isPreviewMode) return false;
    return zoom !== b.zoom || crop.x !== b.crop.x || crop.y !== b.crop.y;
  }, [zoom, crop, imageSrc, isPreviewMode]);

  const finalizeCropModalClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const popupRequestCloseRef = useRef<(() => void) | null>(null);
  const closeDialog = useCallback(() => {
    popupRequestCloseRef.current?.();
  }, []);

  const cropCloseGuard = useCloseWithUnsavedConfirmation({
    isOpen,
    isBusy: isSaving,
    hasUnsavedChanges: hasCropUnsavedChanges,
    closeDialog,
  });

  const { requestClose: requestCropModalClose } = cropCloseGuard;

  const attemptCropClose = useCallback(() => {
    if (isSaving) return;
    if (isPreviewMode) {
      setIsPreviewMode(false);
      setPreviewBlob(null);
      return;
    }
    requestCropModalClose();
  }, [isSaving, isPreviewMode, requestCropModalClose]);

  // Функции для работы с localStorage (временное решение)
  function loadCropData(): CropData | null {
    try {
      const user = getUser();
      if (!user?.id) return null;

      const key = `${COVER_CROP_DATA_KEY}_${user.id}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  function saveCropData(data: CropData): void {
    try {
      const user = getUser();
      if (!user?.id) return;

      const key = `${COVER_CROP_DATA_KEY}_${user.id}`;
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      // Игнорируем ошибки localStorage
    }
  }

  function clearCropData(): void {
    try {
      const user = getUser();
      if (!user?.id) return;

      const key = `${COVER_CROP_DATA_KEY}_${user.id}`;
      localStorage.removeItem(key);
    } catch {
      // Игнорируем ошибки localStorage
    }
  }

  if (!isOpen) return null;

  return (
    <Popup
      isActive={isOpen}
      onClose={finalizeCropModalClose}
      onCancelRequest={attemptCropClose}
      requestCloseRef={popupRequestCloseRef}
      closeBlocked={isSaving || cropCloseGuard.discardDialogOpen}
    >
      <div className={`cover-image-crop-modal${isSaving ? ' dashboard-save-card--busy' : ''}`}>
        <div className="cover-image-crop-modal__header">
          <h2 className="cover-image-crop-modal__title">
            {ui?.dashboard?.profileSettingsModal?.messages?.coverEditTitle ??
              'Редактирование обложки'}
          </h2>
          <button
            type="button"
            className="cover-image-crop-modal__close"
            onClick={attemptCropClose}
            disabled={isSaving}
            aria-label={ui?.dashboard?.close ?? 'Закрыть'}
          >
            <ModalCloseIcon />
          </button>
        </div>

        <div className="cover-image-crop-modal__instruction">
          {isPreviewMode
            ? (ui?.dashboard?.profileSettingsModal?.messages?.coverPreviewInstruction ??
              'Предпросмотр обложки')
            : (ui?.dashboard?.profileSettingsModal?.messages?.coverEditInstruction ??
              'Выбранная область будет видна в вашем профиле')}
        </div>

        {error && <div className="cover-image-crop-modal__error">{error}</div>}

        <div className="cover-image-crop-modal__container">
          {imageSrc && !isPreviewMode && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={CROP_ASPECT_RATIO}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              cropShape="rect"
              showGrid={false}
              style={{
                containerStyle: {
                  width: '100%',
                  height: '100%',
                  position: 'relative',
                  background: 'var(--dashboard-hover-bg)',
                },
                cropAreaStyle: {
                  border: '2px dashed rgba(255, 255, 255, 0.6)',
                },
              }}
            />
          )}

          {isPreviewMode && previewBlob && (
            <div className="cover-image-crop-modal__preview">
              <img
                src={URL.createObjectURL(previewBlob)}
                alt="Preview"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                onClick={(e) => e.preventDefault()}
                onDragStart={(e) => e.preventDefault()}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />
            </div>
          )}

          {!imageSrc && (
            <div className="cover-image-crop-modal__loading">
              {ui?.dashboard?.loading ?? 'Загрузка изображения...'}
            </div>
          )}
        </div>

        {!isPreviewMode && imageSrc && (
          <div className="cover-image-crop-modal__controls">
            <div className="cover-image-crop-modal__zoom-control">
              <label>
                <span className="cover-image-crop-modal__zoom-label">
                  {ui?.dashboard?.profileSettingsModal?.fields?.zoom ?? 'Масштаб'}:
                </span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  style={
                    {
                      '--zoom-percent': `${((zoom - 1) / (3 - 1)) * 100}%`,
                    } as React.CSSProperties
                  }
                />
                <span className="cover-image-crop-modal__zoom-value">
                  {Math.round(zoom * 100)}%
                </span>
              </label>
            </div>
          </div>
        )}

        <div className="cover-image-crop-modal__footer">
          {isPreviewMode ? (
            <>
              <button
                type="button"
                className="cover-image-crop-modal__button"
                onClick={attemptCropClose}
                disabled={isSaving}
              >
                {ui?.dashboard?.cancel ?? 'Отмена'}
              </button>
              <button
                type="button"
                className={`cover-image-crop-modal__button cover-image-crop-modal__button--save ${
                  isSaving ? 'cover-image-crop-modal__button--loading' : ''
                }`}
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <DashboardSaveSpinner className="cover-image-crop-modal__button-spinner" />
                    {ui?.dashboard?.saving ?? 'Сохранение...'}
                  </>
                ) : (
                  (ui?.dashboard?.profileSettingsModal?.buttons?.setCover ?? 'Установить обложку')
                )}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="cover-image-crop-modal__button cover-image-crop-modal__button--preview"
                onClick={handlePreview}
                disabled={!croppedAreaPixels || isSaving}
              >
                {ui?.dashboard?.preview ?? 'Предпросмотр'}
              </button>
              <button
                type="button"
                className="cover-image-crop-modal__button"
                onClick={attemptCropClose}
                disabled={isSaving}
              >
                {ui?.dashboard?.cancel ?? 'Отмена'}
              </button>
              <button
                type="button"
                className={`cover-image-crop-modal__button cover-image-crop-modal__button--save ${
                  isSaving ? 'cover-image-crop-modal__button--loading' : ''
                }`}
                onClick={handleSave}
                disabled={!croppedAreaPixels || isSaving}
              >
                {isSaving ? (
                  <>
                    <DashboardSaveSpinner className="cover-image-crop-modal__button-spinner" />
                    {ui?.dashboard?.saving ?? 'Сохранение...'}
                  </>
                ) : (
                  (ui?.dashboard?.profileSettingsModal?.buttons?.setCover ?? 'Установить обложку')
                )}
              </button>
            </>
          )}
        </div>
      </div>
      <InlineEditDiscardDialog
        open={cropCloseGuard.discardDialogOpen}
        labels={getCloseDiscardConfirmLabels(ui ?? undefined)}
        titleId={cropCloseGuard.discardTitleDomId}
        onStay={cropCloseGuard.dismissDiscardDialog}
        onDiscard={cropCloseGuard.finalizeCloseWithoutSaving}
      />
    </Popup>
  );
}
