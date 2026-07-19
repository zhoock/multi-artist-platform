// src/features/createAlbum/ui/CreateAlbum.tsx
/**
 * Фича для создания нового альбома.
 * Позволяет вручную заполнить данные альбома и добавить треки.
 */

import { useCallback, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { AlbumEditable, TracksProps } from '@models';
import { getAudioDuration } from '@shared/lib/audio/getAudioDuration';
import { normalizeTrackIdString } from '@shared/lib/tracks/normalizeTrackIdString';
import { rankToOrderIndex } from '@shared/lib/tracks/trackOrderIndex';
import './CreateAlbum.style.scss';
interface TrackDraft {
  id: string;
  title: string;
  duration: string;
  src: string;
  content: string;
  authorship: string;
}

interface ServiceDraft {
  name: string;
  url: string;
}

interface DetailEntryDraft {
  text: string;
}

interface DetailDraft {
  id: string;
  title: string;
  entries: DetailEntryDraft[];
}

interface AlbumDraft {
  albumId: string;
  album: string;
  description: string;
  coverImg: string;
  releaseDate: string;
  releaseUpc: string;
  tracks: TrackDraft[];
  buttons: ServiceDraft[];
  details: DetailDraft[];
}

type AlbumBaseField = Exclude<keyof AlbumDraft, 'tracks' | 'buttons' | 'details'>;
type DetailEntryField = 'text' | 'link';

const DETAIL_TEMPLATES = [
  { id: '1', title: 'Genre', placeholder: 'Например: Гранж, альтернативный рок.' },
  { id: '2', title: 'Recorded At', placeholder: 'Укажите даты и студии записи.' },
  { id: '3', title: 'Mixed At', placeholder: 'Укажите студии и даты сведения.' },
  {
    id: '4',
    title: 'Band Members',
    placeholder: 'Ярослав Жук — lead vocals, backing vocals, words and music.',
  },
] as const;

const emptyTrack = (): TrackDraft => ({
  id: '',
  title: '',
  duration: '',
  src: '',
  content: '',
  authorship: '',
});

const emptyDetailValue = (id: string, title: string): DetailDraft => ({
  id,
  title,
  entries: [{ text: '' }],
});

const normalizeDraftDetails = (details?: DetailDraft[]): DetailDraft[] =>
  DETAIL_TEMPLATES.map((template) => {
    const existing =
      details?.find(
        (detail) =>
          (detail.title?.toLowerCase() ?? '') === template.title.toLowerCase() ||
          detail.id === template.id
      ) ?? emptyDetailValue(template.id, template.title);

    const text = existing.entries?.[0]?.text ?? '';

    return {
      id: template.id,
      title: template.title,
      entries: [{ text }],
    };
  });

const DEFAULT_SERVICES: ServiceDraft[] = [
  { name: 'itunes', url: '' },
  { name: 'bandcamp', url: '' },
  { name: 'amazon', url: '' },
  { name: 'apple', url: '' },
  { name: 'vk', url: '' },
  { name: 'youtube', url: '' },
  { name: 'spotify', url: '' },
  { name: 'yandex', url: '' },
  { name: 'deezer', url: '' },
  { name: 'tidal', url: '' },
];

const emptyAlbum: AlbumDraft = {
  albumId: '',
  album: '',
  description: '',
  coverImg: '',
  releaseDate: '',
  releaseUpc: '',
  tracks: [emptyTrack()],
  buttons: DEFAULT_SERVICES.map((service) => ({ ...service })),
  details: DETAIL_TEMPLATES.map((template) => emptyDetailValue(template.id, template.title)),
};

const formatDuration = (value: string): number | undefined => {
  if (!value.trim()) {
    return undefined;
  }
  const normalized = value.replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const draftToAlbum = (draft: AlbumDraft): AlbumEditable => {
  const cover: AlbumEditable['cover'] = draft.coverImg.trim() || undefined;

  const releaseEntries = Object.entries({
    date: draft.releaseDate.trim(),
    UPC: draft.releaseUpc.trim(),
  }).filter(([, value]) => value);

  const release = releaseEntries.reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});

  const tracks = draft.tracks
    .filter((track) => track.title.trim())
    .map<TracksProps>((track, index) => {
      const parsedDuration = formatDuration(track.duration);
      const id = normalizeTrackIdString(track.id) || String(index + 1);

      return {
        id,
        title: track.title.trim(),
        order_index: rankToOrderIndex(index),
        duration: parsedDuration ?? 0,
        src: track.src.trim() || '',
        content: track.content.trim() || '',
        authorship: track.authorship.trim() || undefined,
      };
    });

  const buttons = draft.buttons
    .filter((service) => service.name.trim() && service.url.trim())
    .reduce<Record<string, string>>((acc, service) => {
      acc[service.name.trim()] = service.url.trim();
      return acc;
    }, {});

  const details = DETAIL_TEMPLATES.map((template, index) => {
    const detail = draft.details[index] ?? emptyDetailValue(template.id, template.title);
    const lines = detail.entries[0]?.text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return {
      id: Number(template.id),
      title: template.title,
      content: lines && lines.length > 0 ? lines : [],
    };
  });

  const title = draft.album.trim();
  return {
    albumId: draft.albumId.trim() || undefined,
    artist: '',
    album: title,
    fullName: title,
    description: draft.description.trim(),
    cover,
    release,
    buttons,
    details,
    tracks,
  };
};

const albumToDraft = (album: AlbumEditable): AlbumDraft => {
  const tracks =
    album.tracks?.map((track) => ({
      id: String(track.id ?? ''),
      title: track.title ?? '',
      duration:
        typeof track.duration === 'number' && Number.isFinite(track.duration)
          ? track.duration.toString()
          : '',
      src: track.src ?? '',
      content: track.content ?? '',
      authorship: track.authorship ?? '',
    })) ?? [];

  const buttonEntries = Object.entries(album.buttons ?? {});
  const buttons =
    buttonEntries.length > 0
      ? buttonEntries.map<ServiceDraft>(([name, url]) => ({
          name,
          url,
        }))
      : DEFAULT_SERVICES.map((service) => ({ ...service }));

  const details = DETAIL_TEMPLATES.map((template) => {
    const existing =
      album.details?.find(
        (detail) =>
          detail.title?.toLowerCase() === template.title.toLowerCase() ||
          String(detail.id) === template.id
      ) ?? null;

    if (!existing) {
      return emptyDetailValue(template.id, template.title);
    }

    const entries = existing.content?.map<DetailEntryDraft>((item) => {
      if (typeof item === 'string') {
        return { text: item, link: '' };
      }

      if (item && typeof item === 'object' && 'text' in item) {
        const t = item.text;
        const lines = Array.isArray(t)
          ? t.map((line: string) => line ?? '').join('\n')
          : typeof t === 'string'
            ? t
            : '';

        return {
          text: lines,
          link: '',
        };
      }

      return { text: '', link: '' };
    }) ?? [{ text: '', link: '' }];

    return {
      id: template.id,
      title: template.title,
      entries,
    };
  });

  return {
    albumId: album.albumId || '',
    album: album.album || '',
    description: album.description || '',
    coverImg: album.cover || '',
    releaseDate: typeof album.release?.date === 'string' ? album.release.date : '',
    releaseUpc: typeof album.release?.UPC === 'string' ? album.release.UPC : '',
    tracks,
    buttons,
    details: normalizeDraftDetails(details),
  };
};

const validateDraft = (draft: AlbumDraft): string[] => {
  const issues: string[] = [];
  if (!draft.albumId.trim()) {
    issues.push('Укажите поле «albumId».');
  }
  if (!draft.album.trim()) {
    issues.push('Укажите название альбома.');
  }
  if (!draft.tracks.length || draft.tracks.every((track) => !track.title.trim())) {
    issues.push('Добавьте хотя бы один трек.');
  }

  draft.tracks.forEach((track, index) => {
    if (!track.title.trim()) {
      issues.push(`Трек №${index + 1}: поле «Название» обязательно.`);
    }
    // Длительность определяется автоматически из метаданных аудиофайла, валидация не требуется
  });

  const ids = draft.tracks.map((track) => track.id.trim() || track.title.trim());
  const duplicates = ids.filter((id, index) => id && ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    issues.push(
      `Есть повторяющиеся идентификаторы треков: ${Array.from(new Set(duplicates)).join(', ')}.`
    );
  }

  draft.buttons.forEach((service, index) => {
    const name = service.name.trim();
    const url = service.url.trim();
    if (name && !url) {
      issues.push(`Ссылки: заполните URL для сервиса "${name}" (запись №${index + 1}).`);
    }
    if (!name && url) {
      issues.push(`Ссылки: укажите название сервиса для URL "${url}" (запись №${index + 1}).`);
    }
  });

  DETAIL_TEMPLATES.forEach((template, index) => {
    const detail = draft.details[index];
    const hasText =
      detail?.entries[0]?.text.split('\n').some((line) => line.trim().length > 0) ?? false;

    if (!hasText) {
      issues.push(`Заполните раздел "${template.title}".`);
    }
  });

  return issues;
};

interface CreateAlbumProps {
  onBack?: () => void; // Callback для возврата назад (вместо роутинга)
}

export default function CreateAlbum({ onBack }: CreateAlbumProps = {}) {
  const location = useLocation();
  const [draft, setDraft] = useState<AlbumDraft>(emptyAlbum);

  const handleAlbumChange = useCallback((field: AlbumBaseField, value: string) => {
    setDraft((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const updateTrackField = useCallback((index: number, field: keyof TrackDraft, value: string) => {
    setDraft((prev) => {
      const tracks = [...prev.tracks];
      tracks[index] = {
        ...tracks[index],
        [field]: value,
      };
      return {
        ...prev,
        tracks,
      };
    });
  }, []);

  // Автоматически определяем длительность при изменении src
  useEffect(() => {
    const loadDurations = async () => {
      const updates: Array<{ index: number; duration: string }> = [];

      for (let i = 0; i < draft.tracks.length; i++) {
        const track = draft.tracks[i];
        // Определяем длительность только если указан src и duration еще не заполнен
        if (track.src && track.src.trim() && (!track.duration || track.duration.trim() === '')) {
          try {
            const duration = await getAudioDuration(track.src);
            if (duration !== null && Number.isFinite(duration) && duration > 0) {
              updates.push({ index: i, duration: duration.toFixed(2) });
            }
          } catch (error) {
            console.warn(`Failed to get duration for track ${i}:`, error);
          }
        }
      }

      // Применяем все обновления одним обновлением состояния
      if (updates.length > 0) {
        setDraft((prev) => {
          const tracks = [...prev.tracks];
          updates.forEach(({ index, duration }) => {
            // Проверяем, что src не изменился пока мы загружали длительность
            if (tracks[index].src === draft.tracks[index].src) {
              tracks[index] = {
                ...tracks[index],
                duration,
              };
            }
          });
          return {
            ...prev,
            tracks,
          };
        });
      }
    };

    // Используем debounce для избежания множественных запросов
    const timeoutId = setTimeout(() => {
      loadDurations();
    }, 500); // Ждем 500мс после последнего изменения

    return () => clearTimeout(timeoutId);
  }, [draft.tracks]); // Зависимость от tracks массива

  const addTrack = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      tracks: [...prev.tracks, emptyTrack()],
    }));
  }, []);

  const removeTrack = useCallback((index: number) => {
    setDraft((prev) => {
      if (prev.tracks.length <= 1) {
        return prev;
      }
      const tracks = prev.tracks.filter((_, trackIndex) => trackIndex !== index);
      return {
        ...prev,
        tracks,
      };
    });
  }, []);

  const updateServiceField = useCallback(
    (index: number, field: keyof ServiceDraft, value: string) => {
      setDraft((prev) => {
        const buttons = [...prev.buttons];
        buttons[index] = {
          ...buttons[index],
          [field]: value,
        };
        return {
          ...prev,
          buttons,
        };
      });
    },
    []
  );

  const addService = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      buttons: [...prev.buttons, { name: '', url: '' }],
    }));
  }, []);

  const removeService = useCallback((index: number) => {
    setDraft((prev) => {
      if (prev.buttons.length <= 1) {
        return prev;
      }
      const buttons = prev.buttons.filter((_, buttonIndex) => buttonIndex !== index);
      return {
        ...prev,
        buttons,
      };
    });
  }, []);

  const updateDetailEntryField = useCallback(
    (detailIndex: number, _entryIndex: number, _field: DetailEntryField, value: string) => {
      setDraft((prev) => {
        const details = normalizeDraftDetails(prev.details);
        details[detailIndex] = {
          id: DETAIL_TEMPLATES[detailIndex].id,
          title: DETAIL_TEMPLATES[detailIndex].title,
          entries: [{ text: value }],
        };
        return { ...prev, details };
      });
    },
    []
  );

  return (
    <section className="album-builder main-background" aria-label="Конструктор альбомов">
      <div className="admin-container">
        <header className="album-builder__header">
          <div className="album-builder__header-row">
            {onBack ? (
              <button type="button" onClick={onBack} className="album-builder__back">
                ← Назад
              </button>
            ) : (
              <Link
                to="/dashboard-new/albums"
                state={location.state}
                className="album-builder__back"
              >
                ← Назад
              </Link>
            )}
          </div>
          <h1>Конструктор альбомов</h1>
          <p>Заполните данные альбома и треков.</p>
        </header>

        <div className="album-builder__form">
          <div className="album-builder__group">
            <h2 className="album-builder__group-title">Основные данные</h2>
            <div className="album-builder__field">
              <label htmlFor="album-id">albumId</label>
              <input
                id="album-id"
                value={draft.albumId}
                onChange={(event) => handleAlbumChange('albumId', event.target.value)}
                placeholder="например, 23-remastered"
              />
            </div>
            <div className="album-builder__field">
              <label htmlFor="album-title">Название альбома</label>
              <input
                id="album-title"
                value={draft.album}
                onChange={(event) => handleAlbumChange('album', event.target.value)}
                placeholder="23 (Remastered)"
              />
            </div>
            <div className="album-builder__field">
              <label htmlFor="album-description">Описание</label>
              <textarea
                id="album-description"
                rows={5}
                value={draft.description}
                onChange={(event) => handleAlbumChange('description', event.target.value)}
                placeholder="Краткое описание альбома..."
              />
            </div>
          </div>

          <div className="album-builder__group">
            <h2 className="album-builder__group-title">Обложка и релиз</h2>
            <div className="album-builder__field">
              <label htmlFor="album-cover">Путь к обложке</label>
              <input
                id="album-cover"
                value={draft.coverImg}
                onChange={(event) => handleAlbumChange('coverImg', event.target.value)}
                placeholder="smolyanoe-chuchelko-Cover-23-remastered"
              />
            </div>
            <div className="album-builder__field album-builder__field--inline">
              <div>
                <label htmlFor="album-release-date">Дата релиза</label>
                <input
                  id="album-release-date"
                  type="date"
                  value={draft.releaseDate}
                  onChange={(event) => handleAlbumChange('releaseDate', event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="album-upc">UPC</label>
                <input
                  id="album-upc"
                  value={draft.releaseUpc}
                  onChange={(event) => handleAlbumChange('releaseUpc', event.target.value)}
                  placeholder="5016122320228/199199051297"
                />
              </div>
            </div>
          </div>

          <div className="album-builder__group">
            <h2 className="album-builder__group-title">Треки</h2>
            {draft.tracks.map((track, index) => (
              <details
                key={index}
                className="album-builder__track"
                open={draft.tracks.length === 1 || index === draft.tracks.length - 1}
              >
                <summary>
                  <span>
                    #{index + 1} {track.title || 'Новый трек'}
                  </span>
                  {draft.tracks.length > 1 && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        removeTrack(index);
                      }}
                    >
                      Удалить
                    </button>
                  )}
                </summary>
                <div className="album-builder__track-body">
                  <div className="album-builder__field">
                    <label htmlFor={`track-id-${index}`}>ID трека</label>
                    <input
                      id={`track-id-${index}`}
                      value={track.id}
                      onChange={(event) => updateTrackField(index, 'id', event.target.value)}
                      placeholder="1"
                    />
                  </div>
                  <div className="album-builder__field">
                    <label htmlFor={`track-title-${index}`}>Название</label>
                    <input
                      id={`track-title-${index}`}
                      value={track.title}
                      onChange={(event) => updateTrackField(index, 'title', event.target.value)}
                      placeholder="Фиджийская русалка Барнума"
                    />
                  </div>
                  <div className="album-builder__field">
                    <label htmlFor={`track-src-${index}`}>
                      Путь к файлу
                      {track.duration && (
                        <span className="album-builder__duration-hint">
                          {' '}
                          (длительность: {track.duration} мин)
                        </span>
                      )}
                    </label>
                    <input
                      id={`track-src-${index}`}
                      value={track.src}
                      onChange={(event) => updateTrackField(index, 'src', event.target.value)}
                      placeholder="/audio/album/track.mp3"
                    />
                    {track.src && !track.duration && (
                      <small className="album-builder__loading-hint">
                        Загрузка метаданных для определения длительности...
                      </small>
                    )}
                  </div>
                  <div className="album-builder__field">
                    <label htmlFor={`track-authorship-${index}`}>Авторство</label>
                    <input
                      id={`track-authorship-${index}`}
                      value={track.authorship}
                      onChange={(event) =>
                        updateTrackField(index, 'authorship', event.target.value)
                      }
                      placeholder="Ярослав Жук — слова и музыка"
                    />
                  </div>
                  <div className="album-builder__field">
                    <label htmlFor={`track-content-${index}`}>Текст песни</label>
                    <textarea
                      id={`track-content-${index}`}
                      rows={6}
                      value={track.content}
                      onChange={(event) => updateTrackField(index, 'content', event.target.value)}
                      placeholder="Полный текст песни..."
                    />
                  </div>
                </div>
              </details>
            ))}
            <button type="button" className="album-builder__add-track" onClick={addTrack}>
              + Добавить трек
            </button>
          </div>

          <div className="album-builder__group">
            <h2 className="album-builder__group-title">Дополнительная информация</h2>
            <p className="album-builder__group-hint">
              Заполните обязательные разделы блока «details». Для каждого заголовка введите
              значения, разделяя пункты переносом строки.
            </p>
            <div className="album-builder__details-simple">
              {DETAIL_TEMPLATES.map((template, detailIndex) => {
                const detail =
                  draft.details[detailIndex] ?? emptyDetailValue(template.id, template.title);
                const value = detail.entries[0]?.text ?? '';
                return (
                  <div key={template.id} className="album-builder__details-row">
                    <label htmlFor={`detail-${template.id}`}>{template.title}</label>
                    <textarea
                      id={`detail-${template.id}`}
                      rows={template.id === '1' ? 3 : 4}
                      value={value}
                      onChange={(event) => {
                        const text = event.target.value;
                        setDraft((prev) => {
                          const details = normalizeDraftDetails(prev.details);
                          details[detailIndex] = {
                            id: template.id,
                            title: template.title,
                            entries: [{ text }],
                          };
                          return { ...prev, details };
                        });
                      }}
                      placeholder={template.placeholder}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="album-builder__group">
            <h2 className="album-builder__group-title">Ссылки на сервисы</h2>
            <p className="album-builder__group-hint">
              Заполните название платформы и URL. Пустые строки при экспорте будут проигнорированы.
              Можно добавить дополнительные записи.
            </p>
            <div className="album-builder__services">
              {draft.buttons.map((service, index) => (
                <div key={index} className="album-builder__service">
                  <div className="album-builder__service-fields">
                    <div className="album-builder__field">
                      <label htmlFor={`service-name-${index}`}>Название сервиса</label>
                      <input
                        id={`service-name-${index}`}
                        value={service.name}
                        onChange={(event) => updateServiceField(index, 'name', event.target.value)}
                        placeholder="spotify"
                      />
                    </div>
                    <div className="album-builder__field">
                      <label htmlFor={`service-url-${index}`}>Ссылка</label>
                      <input
                        id={`service-url-${index}`}
                        value={service.url}
                        onChange={(event) => updateServiceField(index, 'url', event.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                  {draft.buttons.length > 1 && (
                    <button
                      type="button"
                      className="album-builder__service-remove"
                      onClick={() => removeService(index)}
                    >
                      Удалить
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" className="album-builder__add-service" onClick={addService}>
              + Добавить сервис
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
