// src/shared/lib/hooks/useImageColor.ts
import { useEffect, useRef } from 'react';
import { buildProxyImageUrlFromStoragePath } from '@shared/api/storage';

// Задача: нужно передать цвет от AlbumCover (внутри AudioPlayer) в Popup (в AlbumTracks).
// Это задача подъёма состояния (lifting state up).
// Решение: передаём setBgColor из AlbumTracks в AudioPlayer, а затем в AlbumCover.

// Добавляет ColorThief в window, чтобы TypeScript не ругался,
// если объект объявлен динамически (например, после загрузки внешнего скрипта).
declare global {
  interface Window {
    ColorThief: any;
  }
}

// Глобальный кеш для отслеживания уже обработанных изображений
const processedImagesCache = new Set<string>();

/**
 * Очищает кеш обработанных изображений для указанного пути.
 * Используется при смене альбома, чтобы принудительно переизвлечь цвета.
 * Очищает как базовый путь, так и все пути, которые содержат базовый путь
 * (на случай если изображение загружается по разным URL).
 */
export function clearImageColorCache(imgSrc: string): void {
  // Извлекаем базовое имя файла из пути для более точного сопоставления
  const baseFileName = imgSrc.split('/').pop()?.split('.')[0] || imgSrc;

  processedImagesCache.delete(imgSrc);

  // Очищаем все пути, которые содержат базовое имя файла
  // Это работает как для локальных путей, так и для полных URL (Supabase Storage)
  const pathsToDelete: string[] = [];
  processedImagesCache.forEach((cachedPath) => {
    // Проверяем по базовому пути и по имени файла
    if (
      cachedPath === imgSrc ||
      cachedPath.includes(imgSrc) ||
      imgSrc.includes(cachedPath) ||
      cachedPath.includes(baseFileName)
    ) {
      pathsToDelete.push(cachedPath);
    }
  });
  pathsToDelete.forEach((path) => processedImagesCache.delete(path));
}

/* Этот хук useImageColor предназначен для извлечения доминантного цвета
 * и палитры из изображения с использованием библиотеки Color Thief.
 * Он загружает скрипт Color Thief при необходимости, обрабатывает изображение
 * и передаёт полученные цвета в onColorsExtracted.
 * */
export function useImageColor(
  imgSrc: string,
  onColorsExtracted?: (colors: { dominant: string; palette: string[] }) => void
) {
  // Создание ref для изображения. Используется для хранения ссылки на изображение, с которого будет браться цвет.
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Храним последнюю версию колбэка в ref, чтобы избежать бесконечных циклов
  const onColorsExtractedRef = useRef(onColorsExtracted);

  // Обновляем ref при изменении колбэка
  useEffect(() => {
    onColorsExtractedRef.current = onColorsExtracted;
  }, [onColorsExtracted]);

  useEffect(() => {
    const callback = onColorsExtractedRef.current;
    if (!callback) {
      return;
    }

    // Проверяет, загружен ли уже Color Thief.
    // Если нет, создаёт <script> и добавляет в document.body.
    // Если уже загружен, сразу вызывает extractColors.
    const loadScript = () => {
      const existingScript = document.querySelector('script[src*="color-thief"]');
      if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/color-thief/2.3.2/color-thief.umd.js';
        script.onload = () => {
          // Небольшая задержка для гарантии инициализации в мобильных браузерах
          setTimeout(extractColors, 50);
        };
        script.onerror = () => {
          console.error('Ошибка загрузки ColorThief скрипта');
        };
        document.body.appendChild(script);
      } else if (window.ColorThief) {
        // Если скрипт уже загружен, вызываем extractColors с небольшой задержкой
        setTimeout(extractColors, 50);
      } else {
        // Скрипт есть в DOM, но еще не загружен - ждем события загрузки
        existingScript.addEventListener('load', () => {
          setTimeout(extractColors, 50);
        });
      }
    };

    // Функция extractColors.
    const extractColors = () => {
      // Проверяет, доступен ли window.ColorThief.
      // Если нет — выводит ошибку и выходит.
      if (!window.ColorThief) {
        console.error('ColorThief не найден');
        return;
      }

      // Создаёт экземпляр ColorThief.
      // Берёт изображение из useRef.
      const colorThief = new window.ColorThief();
      const img = imgRef.current;
      if (!img) {
        return;
      }

      let lastActualImgSrc = imgSrc;

      // Извлечение цветов
      const getColors = () => {
        try {
          // В мобильных браузерах img.complete может быть true, но изображение еще не готово
          // Проверяем naturalWidth и naturalHeight для гарантии готовности
          if (img.naturalWidth === 0 || img.naturalHeight === 0) {
            // Изображение еще не загружено полностью, ждем следующего события
            if (!img.complete) {
              img.onload = getColors;
            } else {
              // Если complete=true, но размеры 0, пробуем через небольшую задержку
              setTimeout(() => {
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                  getColors();
                }
              }, 100);
            }
            return;
          }

          // Получаем реальный путь к изображению для кеша
          // Для <picture> с <source> элементами нужно использовать currentSrc
          // currentSrc возвращает реальный URL, который браузер выбрал из <source> элементов
          let actualImgSrc = (img as HTMLImageElement).currentSrc || img.src || imgSrc;
          lastActualImgSrc = actualImgSrc;

          // Если изображение загружается с Supabase Storage (cross-origin), используем прокси
          // для обхода CORS ограничений при извлечении цветов
          if (actualImgSrc.includes('supabase.co/storage')) {
            // Извлекаем путь к изображению из Supabase URL
            // Формат: https://xxx.supabase.co/storage/v1/object/public/user-media/users/.../albums/...
            const urlMatch = actualImgSrc.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
            if (urlMatch) {
              const imagePath = urlMatch[1];
              const proxyUrl = buildProxyImageUrlFromStoragePath(imagePath);

              // Создаем новый Image элемент для загрузки через прокси
              const proxyImg = new Image();
              proxyImg.crossOrigin = 'anonymous';
              proxyImg.src = proxyUrl;

              proxyImg.onload = () => {
                // Когда прокси-изображение загрузилось, используем его для извлечения цветов
                try {
                  const dominantColor = colorThief.getColor(proxyImg);
                  const palette = colorThief.getPalette(proxyImg, 10);

                  processedImagesCache.add(imgSrc);
                  processedImagesCache.add(proxyUrl);

                  const colors = {
                    dominant: `rgb(${dominantColor.join(',')})`,
                    palette: palette.map((color: number[]) => `rgb(${color.join(',')})`),
                  };

                  onColorsExtractedRef.current?.(colors);
                } catch (error) {
                  console.error('Ошибка при извлечении цветов из прокси-изображения:', error);
                }
              };

              proxyImg.onerror = async (e) => {
                console.error('Ошибка загрузки прокси-изображения:', {
                  proxyUrl,
                  originalUrl: (img as HTMLImageElement).currentSrc || img.src,
                  error: e,
                });

                // Пробуем загрузить изображение через fetch и создать data URL
                try {
                  const fetchResponse = await fetch(proxyUrl);
                  const contentType = fetchResponse.headers.get('content-type') || '';

                  if (!fetchResponse.ok) {
                    const errorResponse = fetchResponse.clone();
                    const errorText = await errorResponse.text();
                    console.error('[useImageColor] Fetch error response:', errorText);
                    throw new Error(`HTTP ${fetchResponse.status}: ${fetchResponse.statusText}`);
                  }

                  // Проверяем, что получили изображение, а не HTML
                  if (!contentType.startsWith('image/')) {
                    const textResponse = fetchResponse.clone();
                    const responseText = await textResponse.text();
                    console.error('[useImageColor] Expected image but got:', {
                      contentType,
                      responsePreview: responseText.substring(0, 200),
                    });
                    throw new Error(`Expected image content-type, got: ${contentType}`);
                  }

                  const blob = await fetchResponse.blob();

                  if (blob.size === 0) {
                    throw new Error('Blob is empty');
                  }

                  const dataUrl = URL.createObjectURL(blob);

                  const dataUrlImg = new Image();
                  dataUrlImg.crossOrigin = 'anonymous';
                  dataUrlImg.src = dataUrl;

                  dataUrlImg.onload = () => {
                    try {
                      const dominantColor = colorThief.getColor(dataUrlImg);
                      const palette = colorThief.getPalette(dataUrlImg, 10);

                      processedImagesCache.add(imgSrc);
                      processedImagesCache.add(proxyUrl);
                      processedImagesCache.add(dataUrl);

                      const colors = {
                        dominant: `rgb(${dominantColor.join(',')})`,
                        palette: palette.map((color: number[]) => `rgb(${color.join(',')})`),
                      };

                      URL.revokeObjectURL(dataUrl); // Освобождаем память
                      onColorsExtractedRef.current?.(colors);
                    } catch (colorError) {
                      console.error('Ошибка при извлечении цветов из data URL:', colorError);
                      URL.revokeObjectURL(dataUrl);
                    }
                  };

                  dataUrlImg.onerror = () => {
                    console.error('Ошибка загрузки data URL изображения');
                    URL.revokeObjectURL(dataUrl);
                  };
                } catch (fetchError) {
                  console.error('Ошибка при загрузке через fetch:', fetchError);
                  // Пробуем использовать оригинальное изображение как последний fallback
                  try {
                    const dominantColor = colorThief.getColor(img);
                    const palette = colorThief.getPalette(img, 10);

                    processedImagesCache.add(imgSrc);

                    const colors = {
                      dominant: `rgb(${dominantColor.join(',')})`,
                      palette: palette.map((color: number[]) => `rgb(${color.join(',')})`),
                    };

                    onColorsExtractedRef.current?.(colors);
                  } catch (fallbackError) {
                    console.error('Fallback также не сработал (CORS проблема):', fallbackError);
                  }
                }
              };

              return; // Выходим, так как используем асинхронную загрузку через прокси
            }
          }

          // Проверяем кеш с реальным путем
          // Если изображение уже обработано, не извлекаем цвета повторно
          if (processedImagesCache.has(actualImgSrc) || processedImagesCache.has(imgSrc)) {
            // Если цвета уже извлечены, но колбэк еще не был вызван (например, при перемонтировании),
            // нужно вызвать колбэк с уже извлеченными цветами
            // Но мы не храним цвета в кеше, поэтому просто выходим
            return;
          }

          // Получает основной цвет.
          const dominantColor = colorThief.getColor(img);
          // Получает палитру из 10 цветов.
          const palette = colorThief.getPalette(img, 10);

          // Помечаем изображение как обработанное ПЕРЕД вызовом колбэка
          // Добавляем в кеш и базовый путь, и реальный путь для надежности
          processedImagesCache.add(imgSrc);
          if (actualImgSrc !== imgSrc) {
            processedImagesCache.add(actualImgSrc);
          }

          // Преобразует массив [r, g, b] в строку "rgb(r, g, b)".
          const colors = {
            dominant: `rgb(${dominantColor.join(',')})`,
            palette: palette.map((color: number[]) => `rgb(${color.join(',')})`),
          };

          // Вызывает onColorsExtracted через ref, чтобы избежать проблем с зависимостями
          onColorsExtractedRef.current?.(colors);
        } catch (error) {
          console.error('Ошибка при извлечении цветов:', error);
          // При ошибке не добавляем в кеш, чтобы можно было повторить попытку
        }
      };

      // Обработка загрузки изображения.
      // Если изображение уже загружено — проверяем готовность и извлекаем цвета.
      // Если нет — ждём onload и затем вызываем getColors.
      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        // Изображение полностью загружено и готово
        getColors();
      } else {
        // Ждем загрузки изображения
        const handleLoad = () => {
          img.removeEventListener('load', handleLoad);
          img.removeEventListener('error', handleError);
          // Небольшая задержка для гарантии готовности в мобильных браузерах
          setTimeout(getColors, 50);
        };
        const handleError = () => {
          img.removeEventListener('load', handleLoad);
          img.removeEventListener('error', handleError);
          console.error('Ошибка загрузки изображения для извлечения цветов:', imgSrc);
        };
        img.addEventListener('load', handleLoad);
        img.addEventListener('error', handleError);
      }
    };

    // Запуск скрипта.
    // Вызывает loadScript при каждом изменении imgSrc.
    // onColorsExtracted не в зависимостях, используем ref для доступа к последней версии
    loadScript();
  }, [imgSrc]);

  // Возвращаемый результат.
  // Хук возвращает ref, который нужно прикрепить к <img>,
  // чтобы Color Thief мог анализировать изображение.
  return imgRef;
}
