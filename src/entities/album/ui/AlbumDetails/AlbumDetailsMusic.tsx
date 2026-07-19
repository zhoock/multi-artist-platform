import { useLang } from '@app/providers/lang';
import { formatDateToDisplay } from '@pages/UserDashboard/components/modals/album/EditAlbumModal.utils';
import type { detailsProps } from '@models';
import type { AlbumDetails } from '../../model/albumDetails';

/**
 * Компонент отображает блок с участниками и местами записи альбома.
 */
export default function AlbumDetailsMusic({ album }: { album: AlbumDetails }) {
  const { lang } = useLang() as { lang: 'en' | 'ru' };

  function Block({ title, content }: detailsProps) {
    const items = Array.isArray(content) ? content : []; // Проверяем, что content - массив

    // Определяем, является ли это блоком Genre/Жанр
    const isGenre =
      title === 'Genre' || title === 'Жанр' || title === 'Genres' || title === 'Жанры';

    // Для Genre объединяем все строковые элементы в одну строку через запятую
    if (isGenre) {
      const genreStrings = items
        .filter((item): item is string => typeof item === 'string')
        .map((genre) => {
          // Убираем существующие точки в конце, чтобы избежать двойных точек
          const cleanedGenre = genre.trim().replace(/\.+$/, '');

          // Форматируем: первое слово с заглавной, остальные слова в нижнем регистре
          return cleanedGenre
            .split(' ')
            .map((word, idx) => {
              if (idx === 0) {
                // Первое слово: первая буква заглавная, остальные в нижнем регистре
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
              } else {
                // Остальные слова: все в нижнем регистре
                return word.toLowerCase();
              }
            })
            .join(' ');
        });

      // Объединяем через запятую и пробел, добавляем одну точку в конце
      const genreText = genreStrings.length > 0 ? genreStrings.join(', ') + '.' : '';

      return (
        <>
          <h3>{title}</h3>
          <ul>{genreText && <li>{genreText}</li>}</ul>
        </>
      );
    }

    // Проверяем, является ли это блоком Recorded At, Mixed At или Mastered By
    // (блоки, которые используют новый формат с датами)
    const isRecordingBlock =
      title === 'Recorded At' ||
      title === 'Запись' ||
      title === 'Mixed At' ||
      title === 'Сведение' ||
      title === 'Mastered By' ||
      title === 'Мастеринг';

    // Функция для добавления точки в конце текста, если её нет
    const ensurePeriod = (text: string): string => {
      const trimmed = text.trim();
      if (!trimmed) return trimmed;
      // Убираем все точки в конце и добавляем одну
      return trimmed.replace(/\.+$/, '') + '.';
    };

    // Для остальных блоков - стандартная логика
    return (
      <>
        <h3>{title}</h3>
        <ul>
          {items.map((item, i) => {
            // Новый формат: { dateFrom, dateTo?, studioText, url }
            // Проверяем наличие dateFrom (может быть null, но поле должно существовать)
            if (
              typeof item === 'object' &&
              item !== null &&
              'dateFrom' in item &&
              !('text' in item)
            ) {
              const recordingItem = item as {
                dateFrom: string | null | undefined;
                dateTo?: string | null | undefined;
                studioText?: string | null | undefined;
                city?: string | null | undefined;
                url?: string | null | undefined;
              };

              // Если dateFrom есть (не null и не undefined), используем новый формат
              if (recordingItem.dateFrom !== null && recordingItem.dateFrom !== undefined) {
                // Формируем даты отдельно
                let datesText = '';
                if (recordingItem.dateFrom && recordingItem.dateTo) {
                  const fromFormatted = formatDateToDisplay(recordingItem.dateFrom, lang);
                  const toFormatted = formatDateToDisplay(recordingItem.dateTo, lang);
                  datesText = `${fromFormatted}—${toFormatted}`;
                } else if (recordingItem.dateFrom) {
                  datesText = formatDateToDisplay(recordingItem.dateFrom, lang);
                } else if (recordingItem.dateTo) {
                  datesText = formatDateToDisplay(recordingItem.dateTo, lang);
                }

                // Формируем текст студии и города отдельно
                let studioText = recordingItem.studioText || '';
                let cityText = recordingItem.city || '';

                // Если есть URL, ссылка только на текст студии, город после ссылки через запятую
                if (recordingItem.url && studioText) {
                  // Формируем текст после ссылки (город с точкой в конце)
                  let afterLinkText = '';
                  if (cityText) {
                    afterLinkText = `, ${ensurePeriod(cityText)}`;
                  } else {
                    // Если нет города, добавляем точку после ссылки
                    afterLinkText = '.';
                  }

                  return (
                    <li key={i}>
                      {datesText && `${datesText}: `}
                      <a
                        className="album-details__link"
                        href={recordingItem.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {studioText}
                      </a>
                      {afterLinkText}
                    </li>
                  );
                }

                // Если нет URL, но есть текст студии или город
                let studioAndCity = '';
                if (studioText && cityText) {
                  studioAndCity = `${studioText}, ${cityText}`;
                } else if (studioText) {
                  studioAndCity = studioText;
                } else if (cityText) {
                  studioAndCity = cityText;
                }

                studioAndCity = ensurePeriod(studioAndCity);

                if (studioAndCity) {
                  const fullText = datesText ? `${datesText}: ${studioAndCity}` : studioAndCity;
                  return <li key={i}>{fullText}</li>;
                }

                // Если только даты
                return <li key={i}>{datesText}</li>;
              }
            }

            // Для остальных блоков обрабатываем старый формат
            // (строки и объекты с { text: [], link })

            // Строки
            if (typeof item === 'string') {
              const text = item.trim();
              // Добавляем точку в конце для всех блоков
              const finalText = ensurePeriod(text);
              return finalText ? <li key={i}>{finalText}</li> : null;
            }

            // Объекты с text: поддерживаем и старый формат ["", "Имя", " — роль"],
            // и новый формат ["Имя", "роль"] (с link или без него)
            if (typeof item === 'object' && item !== null && 'text' in item) {
              const textItem = item as { text: string | string[]; link?: string };
              if (typeof textItem.text === 'string' && textItem.text.trim()) {
                const finalText = ensurePeriod(textItem.text.trim());
                return finalText ? <li key={i}>{finalText}</li> : null;
              }

              const parts = Array.isArray(textItem.text) ? textItem.text : [];

              // Новый формат producing: ["Имя", "роль"]
              if (parts.length === 2) {
                const name = (parts[0] || '').trim();
                const role = ensurePeriod((parts[1] || '').trim());
                if (!name && !role) return null;

                if (textItem.link && textItem.link.trim()) {
                  return (
                    <li key={i}>
                      <a
                        className="album-details__link"
                        href={textItem.link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {name}
                      </a>
                      {role && ` — ${role}`}
                    </li>
                  );
                }

                return <li key={i}>{name && role ? `${name} — ${role}` : `${name}${role}`}</li>;
              }

              // Старый формат с link: ["", "Имя", " — роль"]
              if (parts.length >= 3 && textItem.link && textItem.link.trim()) {
                const textBefore = parts[0] || '';
                const linkedText = parts[1] || '';
                const textAfter = ensurePeriod(parts[2] || '');

                return (
                  <li key={i}>
                    {textBefore}
                    {textBefore && ' '}
                    <a
                      className="album-details__link"
                      href={textItem.link}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {linkedText}
                    </a>
                    {textAfter && ' '}
                    {textAfter}
                  </li>
                );
              }
            }

            // Если формат не распознан, пропускаем
            return null;
          })}
        </ul>
      </>
    );
  }

  return Array.isArray(album?.details)
    ? album.details.map((d, index) => <Block {...d} key={`album-detail-${d.id}-${index}`} />)
    : null;
}
