// src/pages/UserDashboard/components/mixer/MixerAdmin.tsx
import React, { useCallback, useMemo, useState } from 'react';
import type { IInterface } from '@models';
import type { AlbumData, TrackData } from '@entities/album/lib/transformAlbumData';
import { uploadFile, listStorageByPrefix } from '@shared/api/storage';
import { uniqueUploadFileSuffix } from '@shared/lib/uniqueUploadFileSuffix';
import { AlbumCoverImage } from '@entities/album';
import {
  buildStoragePublicObjectUrl,
  createSupabaseClient,
  STORAGE_BUCKET_NAME,
} from '@config/supabase';
import { getUserUserId } from '@config/user';
import { fetchWithAuthSession } from '@shared/lib/authFetch';
import { Waveform } from '@shared/ui/waveform';
import { DashboardExpandChevron } from '../../lib/dashboardExpandChevron';

interface MixerAdminProps {
  ui?: IInterface;
  userId?: string;
  albums?: AlbumData[];
}

type StemKey = 'drums' | 'bass' | 'guitars' | 'vocals';

interface StemState {
  key: StemKey;
  label: string;
  status: 'idle' | 'uploading' | 'uploaded' | 'deleting' | 'error';
  url?: string | null;
  fileName?: string | null;
  error?: string | null;
}

interface StemCoverState {
  key: StemKey;
  label: string;
  status: 'idle' | 'uploading' | 'uploaded' | 'error';
  url?: string | null;
  fileName?: string | null;
  error?: string | null;
}

export function MixerAdmin({ ui, userId, albums = [] }: MixerAdminProps) {
  // ui.dashboard.mixer пока не описан в типах IInterface, поэтому берём через any
  const t = (ui as any)?.dashboard?.mixer;
  const stemsInitial: StemState[] = useMemo(
    () => [
      { key: 'drums', label: t?.drums ?? 'Барабаны', status: 'idle' },
      { key: 'bass', label: t?.bass ?? 'Бас', status: 'idle' },
      { key: 'guitars', label: t?.guitars ?? 'Гитары', status: 'idle' },
      { key: 'vocals', label: t?.vocals ?? 'Вокал', status: 'idle' },
    ],
    [t?.bass, t?.drums, t?.guitars, t?.vocals]
  );

  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);
  const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null);
  const [trackStems, setTrackStems] = useState<Record<string, StemState[]>>({});
  const [trackStemCovers, setTrackStemCovers] = useState<Record<string, StemCoverState[]>>({});

  const getAlbumTracks = (albumId: string): TrackData[] =>
    albums.find((a) => a.id === albumId)?.tracks || [];

  const ensureTrackStems = useCallback(
    async (albumId: string, trackId: string) => {
      // Используем UUID пользователя из пропсов или получаем динамически
      const storageUserId = userId || getUserUserId();
      if (!storageUserId) {
        console.warn('⚠️ [MixerAdmin] No userId provided, cannot load stems');
        return;
      }

      // Сбрасываем кеш стемов для этого трека, чтобы всегда загружать свежие данные
      // Это нужно, чтобы после загрузки файла он сразу появлялся в списке
      // if (trackStems[trackId]) {
      //   return;
      // }

      // Инициализируем стемы только если их еще нет в состоянии
      // Это позволяет сохранить локальное состояние удаленных стемов
      setTrackStems((prev) => {
        if (prev[trackId]) {
          // Если стемы уже есть в состоянии, не перезаписываем их
          // Это позволяет сохранить локальное состояние (например, удаленные стемы)
          return prev;
        }
        return {
          ...prev,
          [trackId]: stemsInitial.map((stem) => ({ ...stem, status: 'idle' as const })),
        };
      });

      // Загружаем существующие стемы из Storage
      // Используем UUID пользователя для загрузки стемов
      const stemFolderPath = `users/${storageUserId}/audio/${albumId}/${trackId}`;
      console.log('🔍 [MixerAdmin] Loading stems from:', {
        stemFolderPath,
        albumId,
        trackId,
        storageUserId,
        fullPath: `users/${storageUserId}/audio/${albumId}/${trackId}`,
      });
      try {
        const files = await listStorageByPrefix(stemFolderPath);
        console.log('📁 [MixerAdmin] Found files:', files);
        if (files && files.length > 0) {
          // Сопоставляем файлы с ключами стемов
          const updatedStems = await Promise.all(
            stemsInitial.map(async (stem) => {
              // Ищем файл, который начинается с ключа стема (например, "drums-", "bass-", "guitars-", "vocals-")
              const matchingFile = files.find((fileName) => fileName.startsWith(`${stem.key}-`));
              if (matchingFile) {
                // Формируем полный путь для аудио файла
                const storagePath = `${stemFolderPath}/${matchingFile}`;
                // Публичный URL: достаточно VITE_SUPABASE_URL; anon key нужен только для клиента
                const supabase = createSupabaseClient();
                let url = '';
                if (supabase) {
                  const { data } = supabase.storage
                    .from(STORAGE_BUCKET_NAME)
                    .getPublicUrl(storagePath);
                  url = data.publicUrl;
                } else {
                  url = buildStoragePublicObjectUrl(storagePath) ?? '';
                }

                // Проверяем, что файл действительно существует, делая HEAD запрос
                let fileExists = false;
                if (url) {
                  try {
                    const headResponse = await fetch(url, { method: 'HEAD' });
                    fileExists = headResponse.ok;
                    console.log(`🔍 [MixerAdmin] File existence check for ${stem.key}:`, {
                      url,
                      exists: fileExists,
                      status: headResponse.status,
                    });
                  } catch (error) {
                    console.warn(
                      `⚠️ [MixerAdmin] Could not verify file existence for ${stem.key}:`,
                      error
                    );
                    fileExists = false; // Если проверка не удалась, считаем что файла нет
                  }
                }

                // Возвращаем стем как uploaded только если файл действительно существует
                if (fileExists) {
                  return {
                    ...stem,
                    status: 'uploaded' as const,
                    url,
                    fileName: matchingFile,
                    error: null,
                  };
                } else {
                  console.warn(
                    `⚠️ [MixerAdmin] File ${matchingFile} listed but does not exist, marking as idle`
                  );
                  return {
                    ...stem,
                    status: 'idle' as const,
                    url: null,
                    fileName: null,
                    error: null,
                  };
                }
              }
              return { ...stem, status: 'idle' as const };
            })
          );

          // Обновляем стемы, сохраняя локальное состояние (например, удаленные стемы)
          setTrackStems((prev) => {
            const currentStems = prev[trackId];
            if (currentStems) {
              // Если стемы уже есть, обновляем только те, которые не были удалены локально
              // (т.е. те, у которых status !== 'idle' ИЛИ url !== null)
              const mergedStems = updatedStems.map((newStem) => {
                const currentStem = currentStems.find((s) => s.key === newStem.key);
                // Если локально стем был удален (status: 'idle', url: null), сохраняем это состояние
                // НО только если в Storage тоже нет файла
                // Если в Storage появился файл - всегда используем его (игнорируем локальное удаление)
                if (newStem.url || newStem.fileName || newStem.status === 'uploaded') {
                  // В Storage есть файл - используем его, не сохраняем локальное удаление
                  return newStem;
                }
                // Если в Storage нет файла, проверяем локальное состояние
                if (
                  currentStem &&
                  currentStem.status === 'idle' &&
                  !currentStem.url &&
                  !currentStem.fileName && // Убеждаемся, что это не просто не загруженный стем
                  !newStem.url && // В Storage тоже нет файла
                  !newStem.fileName && // И не было fileName
                  newStem.status === 'idle' // И новый стем тоже idle
                ) {
                  // Сохраняем состояние удаления только если:
                  // 1. В Storage нет файла
                  // 2. И локально стем тоже idle без url и fileName
                  // Это предотвращает сохранение состояния "удален" для стемов, которые просто еще не загружены
                  console.log(`🔒 [MixerAdmin] Preserving locally deleted stem: ${newStem.key}`);
                  return currentStem;
                }
                // Иначе используем новые данные из Storage
                return newStem;
              });
              return {
                ...prev,
                [trackId]: mergedStems,
              };
            }
            return {
              ...prev,
              [trackId]: updatedStems,
            };
          });
        }
      } catch (error) {
        console.error(`Error loading stems for track ${trackId}:`, error);
      }

      // Инициализируем также обложки стемов
      setTrackStemCovers((prev) => {
        if (prev[trackId]) return prev;
        const coversInitial: StemCoverState[] = stemsInitial.map((stem) => ({
          key: stem.key,
          label: stem.label,
          status: 'idle' as const,
        }));
        return { ...prev, [trackId]: coversInitial };
      });

      // Загружаем существующие обложки стемов из Storage
      // Используем UUID пользователя для загрузки обложек стемов
      const coverFolderPath = `users/${storageUserId}/stems/${albumId}/${trackId}`;
      console.log('🔍 [MixerAdmin] Loading stem covers from:', coverFolderPath);
      try {
        const coverFiles = await listStorageByPrefix(coverFolderPath);
        if (coverFiles && coverFiles.length > 0) {
          const updatedCovers = stemsInitial.map((stem) => {
            // Ищем файл, который соответствует ключу стема (например, "drums.jpg", "bass.jpg")
            const matchingFile = coverFiles.find(
              (fileName) =>
                fileName.startsWith(`${stem.key}.`) ||
                fileName.startsWith(`${stem.key}-`) ||
                fileName === `${stem.key}`
            );
            if (matchingFile) {
              // Формируем полный путь для обложки стема
              const storagePath = `${coverFolderPath}/${matchingFile}`;
              // Для изображений используем proxy URL (используем /api/proxy-image для production)
              const origin = typeof window !== 'undefined' ? window.location.origin : '';
              const proxyPath =
                typeof window !== 'undefined' && window.location.hostname === 'localhost'
                  ? '/.netlify/functions/proxy-image'
                  : '/api/proxy-image';
              const url = `${origin}${proxyPath}?path=${encodeURIComponent(storagePath)}`;
              return {
                key: stem.key,
                label: stem.label,
                status: 'uploaded' as const,
                url,
                fileName: matchingFile,
                error: null,
              };
            }
            return {
              key: stem.key,
              label: stem.label,
              status: 'idle' as const,
            };
          });

          setTrackStemCovers((prev) => ({
            ...prev,
            [trackId]: updatedCovers,
          }));
        }
      } catch (error) {
        console.error(`Error loading stem covers for track ${trackId}:`, error);
      }
    },
    [stemsInitial, userId, trackStems]
  );

  const handleStemUpload = useCallback(
    async (albumId: string, track: TrackData, stemKey: StemKey, file: File) => {
      const storageUserId = userId || getUserUserId();
      if (!storageUserId) {
        setTrackStems((prev) => ({
          ...prev,
          [track.id]: (prev[track.id] || stemsInitial).map((stem) =>
            stem.key === stemKey
              ? {
                  ...stem,
                  status: 'error',
                  error: t?.noUser ?? 'Нет пользователя для загрузки',
                }
              : stem
          ),
        }));
        return;
      }

      const fileExt = file.name.split('.').pop() || 'wav';
      // TrackData не гарантирует наличие trackId, поэтому берём безопасно через id или fallback
      const trackId = track.id || (track as any).trackId || 'track';
      const fileName = `${stemKey}-${uniqueUploadFileSuffix()}.${fileExt}`;

      setTrackStems((prev) => ({
        ...prev,
        [track.id]: (prev[track.id] || stemsInitial).map((stem) =>
          stem.key === stemKey ? { ...stem, status: 'uploading', error: null } : stem
        ),
      }));

      try {
        console.log('📤 [MixerAdmin] Начало загрузки stem:', {
          albumId,
          trackId,
          stemKey,
          fileName,
          fileSize: file.size,
          fileSizeMB: (file.size / (1024 * 1024)).toFixed(2),
          fileType: file.type,
        });

        // Получаем токен
        const { getToken } = await import('@shared/lib/auth');
        const token = getToken();
        if (!token) {
          throw new Error('Пользователь не авторизован');
        }

        // Получаем signed URL для прямой загрузки в Supabase
        const signedUrlResponse = await fetchWithAuthSession('/api/stems/upload-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            albumId,
            trackId,
            fileName,
          }),
        });

        if (!signedUrlResponse.ok) {
          const errorData = await signedUrlResponse.json().catch(() => ({}));
          console.error('❌ [MixerAdmin] Failed to get signed URL:', errorData);
          throw new Error(errorData.error || 'Не удалось получить URL для загрузки');
        }

        const { data: signedUrlData } = await signedUrlResponse.json();
        if (!signedUrlData?.signedUrl || !signedUrlData?.storagePath) {
          console.error('❌ [MixerAdmin] Invalid signed URL response:', signedUrlData);
          throw new Error('Некорректный ответ от сервера');
        }

        const { signedUrl, storagePath } = signedUrlData;

        console.log('🔐 [MixerAdmin] Got signed URL, uploading directly to Supabase...', {
          signedUrl: signedUrl.substring(0, 100) + '...', // Логируем только начало URL
          storagePath,
          fileSize: file.size,
          fileType: file.type,
        });

        // Загружаем файл напрямую в Supabase через signed URL
        const uploadStartTime = Date.now();
        const uploadResponse = await fetch(signedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': file.type || 'audio/wav',
          },
          body: file,
        });

        const uploadDuration = Date.now() - uploadStartTime;

        console.log('📤 [MixerAdmin] Upload response:', {
          status: uploadResponse.status,
          statusText: uploadResponse.statusText,
          duration: `${uploadDuration}ms`,
          contentType: uploadResponse.headers.get('content-type'),
        });

        // Читаем ответ от PUT запроса для диагностики
        const responseText = await uploadResponse.text().catch(() => '');
        console.log('📥 [MixerAdmin] Upload response body:', {
          responseText: responseText.substring(0, 200), // Первые 200 символов
          responseLength: responseText.length,
        });

        if (!uploadResponse.ok) {
          console.error('❌ [MixerAdmin] Upload failed:', {
            status: uploadResponse.status,
            statusText: uploadResponse.statusText,
            error: responseText,
            storagePath,
          });
          throw new Error(`Ошибка загрузки: ${uploadResponse.status} ${uploadResponse.statusText}`);
        }

        // Проверяем, что файл действительно загружен, делая небольшой запрос на проверку
        console.log('✅ [MixerAdmin] Upload successful, verifying file exists...', {
          storagePath,
        });

        // Публичный URL: достаточно VITE_SUPABASE_URL (anon key не обязателен для ссылки)
        let url =
          buildStoragePublicObjectUrl(storagePath) ??
          (() => {
            const client = createSupabaseClient();
            if (!client) return null;
            const { data } = client.storage.from(STORAGE_BUCKET_NAME).getPublicUrl(storagePath);
            return data?.publicUrl ?? null;
          })();

        if (!url) {
          throw new Error(
            'Не задан VITE_SUPABASE_URL: нельзя собрать публичный URL для файла. Добавьте URL в .env и перезапустите dev-сервер.'
          );
        }

        const supabase = createSupabaseClient();
        if (supabase) {
          try {
            const folderPath = `users/${userId}/audio/${albumId}/${trackId}`;
            const fileNameOnly = storagePath.split('/').pop() || '';
            const { data: fileInfo, error: fileError } = await supabase.storage
              .from(STORAGE_BUCKET_NAME)
              .list(folderPath, {
                limit: 100,
              });

            if (fileError) {
              console.warn('⚠️ [MixerAdmin] Could not verify file in Storage:', fileError);
            } else {
              const fileExists = !!fileInfo?.find((f) => f.name === fileNameOnly);
              console.log('✅ [MixerAdmin] File verified in Storage:', {
                fileExists,
                fileNameOnly,
                folderPath,
                filesInFolder: fileInfo?.length || 0,
                allFiles: fileInfo?.map((f) => f.name) || [],
              });
            }
          } catch (verifyError) {
            console.warn('⚠️ [MixerAdmin] Error verifying file:', verifyError);
          }
        }

        console.log('✅ [MixerAdmin] Stem успешно загружен:', {
          stemKey,
          url,
          storagePath,
          fullPath: `users/${userId}/audio/${albumId}/${trackId}/${fileName}`,
        });

        setTrackStems((prev) => ({
          ...prev,
          [track.id]: (prev[track.id] || stemsInitial).map((stem) =>
            stem.key === stemKey
              ? { ...stem, status: 'uploaded', url, fileName: file.name, error: null }
              : stem
          ),
        }));

        // После успешной загрузки обновляем только что загруженный стем из Storage
        // с небольшой задержкой, чтобы Storage успел обработать файл
        // НЕ очищаем кеш, чтобы не показывать промежуточное состояние "idle"
        console.log('🔄 [MixerAdmin] Will verify uploaded stem in 1 second...');
        setTimeout(async () => {
          console.log('🔄 [MixerAdmin] Verifying uploaded stem...');
          // Не очищаем кеш - просто обновляем конкретный стем, если он изменился в Storage
          // Это предотвращает мигание кнопки "Загрузить"
          try {
            const stemFolderPath = `users/${userId}/audio/${albumId}/${trackId}`;
            const files = await listStorageByPrefix(stemFolderPath);
            if (files && files.length > 0) {
              const matchingFile = files.find((f) => f.startsWith(`${stemKey}-`));
              if (matchingFile) {
                const storagePath = `${stemFolderPath}/${matchingFile}`;
                const { createSupabaseClient, STORAGE_BUCKET_NAME } = await import(
                  '@config/supabase'
                );
                const supabase = createSupabaseClient();
                if (supabase) {
                  const { data: urlData } = supabase.storage
                    .from(STORAGE_BUCKET_NAME)
                    .getPublicUrl(storagePath);
                  if (urlData?.publicUrl) {
                    // Обновляем только если файл действительно существует
                    setTrackStems((prev) => ({
                      ...prev,
                      [track.id]: (prev[track.id] || stemsInitial).map((stem) =>
                        stem.key === stemKey
                          ? {
                              ...stem,
                              status: 'uploaded' as const,
                              url: urlData.publicUrl,
                              fileName: matchingFile,
                              error: null,
                            }
                          : stem
                      ),
                    }));
                    console.log('✅ [MixerAdmin] Stem verified and updated:', stemKey);
                  }
                }
              }
            }
          } catch (verifyError) {
            console.warn('⚠️ [MixerAdmin] Error verifying uploaded stem:', verifyError);
            // В случае ошибки оставляем состояние как есть (уже установлено как uploaded)
          }
        }, 1000);
      } catch (error) {
        console.error('❌ [MixerAdmin] Ошибка загрузки stem:', error);
        setTrackStems((prev) => ({
          ...prev,
          [track.id]: (prev[track.id] || stemsInitial).map((stem) =>
            stem.key === stemKey
              ? {
                  ...stem,
                  status: 'error',
                  error:
                    error instanceof Error ? error.message : (t?.uploadError ?? 'Ошибка загрузки'),
                }
              : stem
          ),
        }));
      }
    },
    [stemsInitial, t?.noUser, t?.uploadError, userId]
  );

  const handleStemCoverUpload = useCallback(
    async (albumId: string, track: TrackData, stemKey: StemKey, file: File) => {
      const storageUserId = userId || getUserUserId();
      if (!storageUserId) {
        setTrackStemCovers((prev) => ({
          ...prev,
          [track.id]: (
            prev[track.id] || stemsInitial.map((s) => ({ ...s, status: 'idle' as const }))
          ).map((cover) =>
            cover.key === stemKey
              ? {
                  ...cover,
                  status: 'error' as const,
                  error: t?.noUser ?? 'Нет пользователя для загрузки',
                }
              : cover
          ),
        }));
        return;
      }

      const fileExt = file.name.split('.').pop() || 'jpg';
      const trackFolder = track.id || (track as any).trackId || 'track';
      const fileName = `${albumId}/${trackFolder}/${stemKey}.${fileExt}`;

      setTrackStemCovers((prev) => ({
        ...prev,
        [track.id]: (
          prev[track.id] || stemsInitial.map((s) => ({ ...s, status: 'idle' as const }))
        ).map((cover) =>
          cover.key === stemKey ? { ...cover, status: 'uploading' as const, error: null } : cover
        ),
      }));

      try {
        let url = await uploadFile({
          userId: storageUserId,
          category: 'stems',
          file,
          fileName,
          contentType: file.type || 'image/jpeg',
          upsert: true,
        });

        if (!url) {
          throw new Error('Не удалось загрузить файл');
        }

        // Если URL является storagePath (начинается с "users/"), преобразуем в proxy URL
        if (url.startsWith('users/')) {
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          url = `${origin}/api/proxy-image?path=${encodeURIComponent(url)}`;
        }

        const finalFileName = fileName.split('/').pop() || file.name;

        setTrackStemCovers((prev) => ({
          ...prev,
          [track.id]: (
            prev[track.id] || stemsInitial.map((s) => ({ ...s, status: 'idle' as const }))
          ).map((cover) =>
            cover.key === stemKey
              ? { ...cover, status: 'uploaded' as const, url, fileName: finalFileName, error: null }
              : cover
          ),
        }));

        // Отправляем событие для обновления страницы StemsPlayground
        window.dispatchEvent(
          new CustomEvent('stem-cover-updated', {
            detail: {
              albumId,
              trackId: track.id,
              stemKey,
              url,
            },
          })
        );
      } catch (error) {
        console.error('Ошибка загрузки обложки stem:', error);
        setTrackStemCovers((prev) => ({
          ...prev,
          [track.id]: (
            prev[track.id] || stemsInitial.map((s) => ({ ...s, status: 'idle' as const }))
          ).map((cover) =>
            cover.key === stemKey
              ? {
                  ...cover,
                  status: 'error' as const,
                  error:
                    error instanceof Error ? error.message : (t?.uploadError ?? 'Ошибка загрузки'),
                }
              : cover
          ),
        }));
      }
    },
    [stemsInitial, t?.noUser, t?.uploadError, userId]
  );

  const handleStemCoverDelete = useCallback(
    async (albumId: string, track: TrackData, stemKey: StemKey) => {
      const cover = trackStemCovers[track.id]?.find((c) => c.key === stemKey);
      if (!cover || !cover.fileName) {
        console.warn('⚠️ [MixerAdmin] Cannot delete: cover not found or no fileName');
        return;
      }

      const trackFolder = track.id || (track as any).trackId || 'track';
      const storageUserId = userId || getUserUserId();
      if (!storageUserId) {
        console.warn('⚠️ [MixerAdmin] No userId provided, cannot delete stem cover');
        return;
      }
      const storagePath = `users/${storageUserId}/stems/${albumId}/${trackFolder}/${cover.fileName}`;

      console.log('🗑️ [MixerAdmin] Deleting stem cover from Storage:', {
        storagePath,
        albumId,
        trackId: track.id,
        stemKey,
        fileName: cover.fileName,
      });

      // Устанавливаем состояние "deleting"
      setTrackStemCovers((prev) => ({
        ...prev,
        [track.id]: (
          prev[track.id] || stemsInitial.map((s) => ({ ...s, status: 'idle' as const }))
        ).map((c) => (c.key === stemKey ? { ...c, status: 'uploading' as const, error: null } : c)),
      }));

      try {
        // Получаем токен из localStorage
        const { getToken } = await import('@shared/lib/auth');
        const token = getToken();
        if (!token) {
          throw new Error('No auth token found');
        }

        // Вызываем Netlify Function для удаления файла (используем тот же endpoint, что и для стемов)
        const deleteResponse = await fetchWithAuthSession('/api/stems/delete', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ storagePath }),
        });

        if (!deleteResponse.ok) {
          const errorData = await deleteResponse.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP ${deleteResponse.status}`);
        }

        const result = await deleteResponse.json();
        console.log('✅ [MixerAdmin] Stem cover successfully deleted from Storage:', result);

        // Обновляем состояние на 'idle' после успешного удаления
        setTrackStemCovers((prev) => ({
          ...prev,
          [track.id]: (
            prev[track.id] || stemsInitial.map((s) => ({ ...s, status: 'idle' as const }))
          ).map((c) =>
            c.key === stemKey
              ? { ...c, status: 'idle' as const, url: null, fileName: null, error: null }
              : c
          ),
        }));

        // Отправляем событие для обновления страницы StemsPlayground
        window.dispatchEvent(
          new CustomEvent('stem-cover-updated', {
            detail: {
              albumId,
              trackId: track.id,
              stemKey,
              url: null, // null означает, что обложка удалена
            },
          })
        );
      } catch (error) {
        console.error('❌ [MixerAdmin] Error deleting stem cover:', error);
        // Восстанавливаем состояние при ошибке
        setTrackStemCovers((prev) => ({
          ...prev,
          [track.id]: (
            prev[track.id] || stemsInitial.map((s) => ({ ...s, status: 'idle' as const }))
          ).map((c) =>
            c.key === stemKey
              ? {
                  ...c,
                  status: 'uploaded' as const,
                  url: cover.url,
                  fileName: cover.fileName,
                  error: error instanceof Error ? error.message : 'Ошибка при удалении обложки',
                }
              : c
          ),
        }));
      }
    },
    [trackStemCovers, stemsInitial]
  );

  return (
    <>
      {albums.length === 0 ? (
        <div className="mixer-admin__placeholder">
          {t?.noAlbums ?? 'Нет доступных альбомов для миксера'}
        </div>
      ) : (
        <div className="user-dashboard__albums-list">
          {albums.map((album, index) => {
            const tracks = getAlbumTracks(album.id);
            const isAlbumOpen = expandedAlbumId === album.id;
            return (
              <React.Fragment key={album.id}>
                <div
                  className={`user-dashboard__album-item ${isAlbumOpen ? 'user-dashboard__album-item--expanded' : ''}`}
                  onClick={() => setExpandedAlbumId(isAlbumOpen ? null : album.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpandedAlbumId(isAlbumOpen ? null : album.id);
                    }
                  }}
                  aria-label={isAlbumOpen ? 'Collapse album' : 'Expand album'}
                >
                  <div className="user-dashboard__album-thumbnail">
                    {album.cover ? (
                      <AlbumCoverImage
                        cover={album.cover}
                        userId={album.userId ?? userId}
                        alt={album.title}
                        contextAlbumId={album.id}
                        logContext="mixer"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <img src="/images/album-placeholder.png" alt={album.title} />
                    )}
                  </div>
                  <div className="user-dashboard__album-info">
                    <div className="user-dashboard__album-title">{album.title}</div>
                    {album.releaseDate ? (
                      <div className="user-dashboard__album-date">{album.releaseDate}</div>
                    ) : (
                      <div className="user-dashboard__album-year">{album.year}</div>
                    )}
                  </div>
                  <div className="user-dashboard__album-arrow">
                    <DashboardExpandChevron expanded={isAlbumOpen} />
                  </div>
                </div>

                {isAlbumOpen && (
                  <div className="user-dashboard__album-expanded">
                    <div className="user-dashboard__tracks-list">
                      {tracks.length === 0 ? (
                        <div className="mixer-admin__placeholder">
                          {t?.noTracks ?? 'Нет треков в альбоме'}
                        </div>
                      ) : (
                        tracks.map((track, trackIndex) => {
                          const isTrackOpen = expandedTrackId === track.id;
                          return (
                            <div key={track.id}>
                              <button
                                type="button"
                                className="user-dashboard__track-item"
                                onClick={() => {
                                  ensureTrackStems(album.albumId || album.id, track.id);
                                  setExpandedTrackId(isTrackOpen ? null : track.id);
                                }}
                                style={{ width: '100%', textAlign: 'left' }}
                              >
                                <div className="user-dashboard__track-number">
                                  {String(trackIndex + 1).padStart(2, '0')}
                                </div>
                                <div className="user-dashboard__track-title">
                                  {track.title ||
                                    (track as any).trackTitle ||
                                    (track as any).trackId}
                                </div>
                                <div className="user-dashboard__track-duration-container">
                                  <div className="user-dashboard__track-duration">
                                    {track.duration}
                                  </div>
                                </div>
                              </button>
                              {isTrackOpen && (
                                <>
                                  <h4 className="mixer-admin__subsection-title">
                                    {t?.stems ?? 'Партии'}
                                  </h4>
                                  <div className="mixer-admin__stems-list">
                                    {(trackStems[track.id] || stemsInitial).map((stem) => (
                                      <div
                                        key={stem.key}
                                        className={`mixer-admin__stem-row ${stem.status === 'uploading' || stem.status === 'deleting' ? 'mixer-admin__stem-row--uploading' : ''} ${stem.url && stem.status === 'uploaded' ? 'mixer-admin__stem-row--uploaded' : ''}`}
                                      >
                                        <div className="mixer-admin__stem-name">{stem.label}</div>
                                        <div className="mixer-admin__stem-waveform">
                                          {stem.url && stem.status === 'uploaded' ? (
                                            <div
                                              style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                width: '100%',
                                              }}
                                            >
                                              <div style={{ flex: 1 }}>
                                                <Waveform src={stem.url} progress={0} height={56} />
                                              </div>
                                              <button
                                                type="button"
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  e.preventDefault();
                                                  console.log('🗑️ [MixerAdmin] Deleting stem:', {
                                                    trackId: track.id,
                                                    stemKey: stem.key,
                                                    fileName: stem.fileName,
                                                    currentState: trackStems[track.id],
                                                  });

                                                  // Сначала обновляем локальное состояние на 'deleting'
                                                  setTrackStems((prev) => {
                                                    const currentTrackStems =
                                                      prev[track.id] || stemsInitial;
                                                    const updated = currentTrackStems.map((s) => {
                                                      if (s.key === stem.key) {
                                                        return {
                                                          ...s,
                                                          status: 'deleting' as const,
                                                        };
                                                      }
                                                      return s;
                                                    });
                                                    return {
                                                      ...prev,
                                                      [track.id]: [...updated],
                                                    };
                                                  });

                                                  // Удаляем файл из Supabase Storage
                                                  if (stem.fileName) {
                                                    const storageUserId = userId || getUserUserId();
                                                    if (!storageUserId) {
                                                      throw new Error('No userId available');
                                                    }
                                                    // ВАЖНО: Используем album.albumId (строковый ID, например "smolyanoechuchelko") вместо album.id (UUID)
                                                    const albumIdForPath =
                                                      album.albumId || album.id;
                                                    const storagePath = `users/${storageUserId}/audio/${albumIdForPath}/${track.id}/${stem.fileName}`;
                                                    console.log(
                                                      '🗑️ [MixerAdmin] Deleting file from Storage:',
                                                      {
                                                        storagePath,
                                                        albumId: album.id,
                                                        albumAlbumId: album.albumId,
                                                        albumIdForPath,
                                                        trackId: track.id,
                                                        fileName: stem.fileName,
                                                      }
                                                    );

                                                    try {
                                                      // Получаем токен из localStorage
                                                      const { getToken } = await import(
                                                        '@shared/lib/auth'
                                                      );
                                                      const token = getToken();
                                                      if (!token) {
                                                        throw new Error('No auth token found');
                                                      }

                                                      // Вызываем Netlify Function для удаления файла
                                                      const deleteResponse =
                                                        await fetchWithAuthSession(
                                                          '/api/stems/delete',
                                                          {
                                                            method: 'DELETE',
                                                            headers: {
                                                              'Content-Type': 'application/json',
                                                              Authorization: `Bearer ${token}`,
                                                            },
                                                            body: JSON.stringify({ storagePath }),
                                                          }
                                                        );

                                                      if (!deleteResponse.ok) {
                                                        const errorData = await deleteResponse
                                                          .json()
                                                          .catch(() => ({}));
                                                        throw new Error(
                                                          errorData.message ||
                                                            `HTTP ${deleteResponse.status}`
                                                        );
                                                      }

                                                      const result = await deleteResponse.json();
                                                      console.log(
                                                        '✅ [MixerAdmin] File successfully deleted from Storage:',
                                                        result
                                                      );

                                                      // Обновляем состояние на 'idle' после успешного удаления
                                                      setTrackStems((prev) => {
                                                        const currentTrackStems =
                                                          prev[track.id] || stemsInitial;
                                                        const updated = currentTrackStems.map(
                                                          (s) => {
                                                            if (s.key === stem.key) {
                                                              return {
                                                                ...s,
                                                                status: 'idle' as const,
                                                                url: null,
                                                                fileName: null,
                                                                error: null,
                                                              };
                                                            }
                                                            return s;
                                                          }
                                                        );
                                                        return {
                                                          ...prev,
                                                          [track.id]: [...updated],
                                                        };
                                                      });
                                                    } catch (error) {
                                                      console.error(
                                                        '❌ [MixerAdmin] Exception while deleting file:',
                                                        error
                                                      );
                                                      // Восстанавливаем состояние при ошибке
                                                      setTrackStems((prev) => {
                                                        const currentTrackStems =
                                                          prev[track.id] || stemsInitial;
                                                        const updated = currentTrackStems.map(
                                                          (s) => {
                                                            if (s.key === stem.key) {
                                                              return {
                                                                ...s,
                                                                status: 'uploaded' as const,
                                                                url: stem.url,
                                                                fileName: stem.fileName,
                                                                error:
                                                                  error instanceof Error
                                                                    ? error.message
                                                                    : 'Ошибка при удалении файла',
                                                              };
                                                            }
                                                            return s;
                                                          }
                                                        );
                                                        return {
                                                          ...prev,
                                                          [track.id]: [...updated],
                                                        };
                                                      });
                                                    }
                                                  } else {
                                                    // Если fileName нет, просто сбрасываем состояние
                                                    setTrackStems((prev) => {
                                                      const currentTrackStems =
                                                        prev[track.id] || stemsInitial;
                                                      const updated = currentTrackStems.map((s) => {
                                                        if (s.key === stem.key) {
                                                          return {
                                                            ...s,
                                                            status: 'idle' as const,
                                                            url: null,
                                                            fileName: null,
                                                            error: null,
                                                          };
                                                        }
                                                        return s;
                                                      });
                                                      return {
                                                        ...prev,
                                                        [track.id]: [...updated],
                                                      };
                                                    });
                                                  }
                                                }}
                                                style={{
                                                  padding: '4px 8px',
                                                  background:
                                                    'var(--dashboard-btn-secondary-hover-bg)',
                                                  color: 'var(--dashboard-text-primary)',
                                                  border: '1px solid var(--dashboard-border)',
                                                  borderRadius: '4px',
                                                  cursor: 'pointer',
                                                  fontSize: '12px',
                                                }}
                                                title="Удалить стем"
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          ) : (
                                            <label className="mixer-admin__stem-upload-area">
                                              <input
                                                type="file"
                                                accept="audio/*"
                                                onChange={(e) => {
                                                  const file = e.target.files?.[0];
                                                  if (file) {
                                                    handleStemUpload(
                                                      album.albumId || album.id,
                                                      track,
                                                      stem.key,
                                                      file
                                                    );
                                                    e.target.value = '';
                                                  }
                                                }}
                                                disabled={stem.status === 'uploading'}
                                              />
                                              {stem.status === 'uploading' ? (
                                                <div className="mixer-admin__stem-upload-loading">
                                                  <span className="mixer-admin__stem-spinner">
                                                    ⟳
                                                  </span>
                                                  {t?.uploading ?? 'Загрузка...'}
                                                </div>
                                              ) : (
                                                <div className="mixer-admin__stem-upload-placeholder">
                                                  {t?.upload ?? 'Загрузить'}
                                                </div>
                                              )}
                                            </label>
                                          )}
                                        </div>
                                        {stem.error && (
                                          <div className="mixer-admin__stem-error">
                                            {stem.error}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>

                                  <h4 className="mixer-admin__subsection-title">
                                    {t?.stemCovers ?? 'Обложки стемов'}
                                  </h4>
                                  <div className="mixer-admin__stems-grid">
                                    {(
                                      trackStemCovers[track.id] ||
                                      stemsInitial.map((s) => ({ ...s, status: 'idle' as const }))
                                    ).map((cover) => {
                                      const getStemIcon = (key: StemKey) => {
                                        switch (key) {
                                          case 'vocals':
                                            return (
                                              <svg
                                                width="24"
                                                height="24"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                              >
                                                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                                <line x1="12" y1="19" x2="12" y2="23" />
                                                <line x1="8" y1="23" x2="16" y2="23" />
                                              </svg>
                                            );
                                          case 'guitars':
                                            return (
                                              <svg
                                                width="24"
                                                height="24"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                              >
                                                <path d="M20 7h-3a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h3v-6z" />
                                                <path d="M7 13h6" />
                                                <circle cx="7" cy="13" r="2" />
                                                <circle cx="17" cy="13" r="2" />
                                                <path d="M17 5v2a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5" />
                                              </svg>
                                            );
                                          case 'bass':
                                            return (
                                              <svg
                                                width="24"
                                                height="24"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                              >
                                                <path d="M18 5h-4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4v-14z" />
                                                <path d="M6 13h4" />
                                                <circle cx="6" cy="13" r="2" />
                                                <circle cx="14" cy="13" r="2" />
                                                <path d="M14 3v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V3" />
                                              </svg>
                                            );
                                          case 'drums':
                                            return (
                                              <svg
                                                width="24"
                                                height="24"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                              >
                                                <circle cx="12" cy="12" r="8" />
                                                <circle cx="12" cy="12" r="3" />
                                                <line x1="4" y1="12" x2="8" y2="12" />
                                                <line x1="16" y1="12" x2="20" y2="12" />
                                                <line x1="12" y1="4" x2="12" y2="8" />
                                                <line x1="12" y1="16" x2="12" y2="20" />
                                              </svg>
                                            );
                                          default:
                                            return null;
                                        }
                                      };

                                      return (
                                        <div
                                          key={cover.key}
                                          className={`mixer-admin__stem-card ${cover.status === 'uploading' ? 'mixer-admin__stem-card--uploading' : ''} ${cover.url ? 'mixer-admin__stem-card--uploaded' : ''}`}
                                        >
                                          {/* input вынесен за пределы label, чтобы кнопка удаления не триггерила его */}
                                          <input
                                            id={`stem-cover-${album.id}-${track.id}-${cover.key}`}
                                            type="file"
                                            accept="image/*"
                                            style={{ display: 'none' }}
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) {
                                                handleStemCoverUpload(
                                                  album.id,
                                                  track,
                                                  cover.key,
                                                  file
                                                );
                                                e.target.value = '';
                                              }
                                            }}
                                            disabled={cover.status === 'uploading'}
                                          />
                                          {/* label используется только для клика по карточке (кроме кнопки удаления) */}
                                          <label
                                            htmlFor={`stem-cover-${album.id}-${track.id}-${cover.key}`}
                                            className="mixer-admin__stem-card-label"
                                            onClick={(e) => {
                                              // Предотвращаем клик на label, если кликнули на кнопку удаления
                                              const target = e.target as HTMLElement;
                                              if (
                                                target.closest('.mixer-admin__stem-delete') ||
                                                target.classList.contains(
                                                  'mixer-admin__stem-delete'
                                                )
                                              ) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                return false;
                                              }
                                            }}
                                          >
                                            <div className="mixer-admin__stem-icon">
                                              {getStemIcon(cover.key)}
                                            </div>
                                            <div className="mixer-admin__stem-label">
                                              {cover.label}
                                            </div>
                                            <div className="mixer-admin__stem-indicator">
                                              {cover.status === 'uploading' ? (
                                                <span className="mixer-admin__stem-spinner">⟳</span>
                                              ) : cover.url ? (
                                                <span className="mixer-admin__stem-arrow">⌄</span>
                                              ) : (
                                                <span className="mixer-admin__stem-arrow">⌄</span>
                                              )}
                                            </div>
                                          </label>
                                          {/* Кнопка удаления вынесена за пределы label */}
                                          {cover.url && cover.status !== 'uploading' && (
                                            <button
                                              type="button"
                                              className="mixer-admin__stem-delete"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                handleStemCoverDelete(
                                                  album.albumId || album.id,
                                                  track,
                                                  cover.key
                                                );
                                              }}
                                              onMouseDown={(e) => {
                                                // Предотвращаем всплытие еще на этапе mousedown
                                                e.stopPropagation();
                                                e.preventDefault();
                                              }}
                                              title="Удалить обложку"
                                              aria-label="Удалить обложку"
                                            >
                                              ✕
                                            </button>
                                          )}
                                          {cover.error && (
                                            <div className="mixer-admin__stem-error">
                                              {cover.error}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {index < albums.length - 1 && <div className="user-dashboard__album-divider"></div>}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </>
  );
}
