import type { LyricsTimingImportErrorCode } from './types';

type ImportMessageCopy = {
  title: string;
  message: string;
};

export function lyricsTimingImportErrorCopy(
  code: LyricsTimingImportErrorCode,
  lang: string
): ImportMessageCopy {
  const ru = lang === 'ru';
  const title = ru ? 'Не удалось загрузить' : 'Import failed';

  switch (code) {
    case 'invalid-json':
      return {
        title,
        message: ru
          ? 'Не удалось загрузить тайминги. Файл повреждён или имеет неподдерживаемый формат.'
          : 'Could not load timings. The file is corrupted or uses an unsupported format.',
      };
    case 'unsupported-format':
      return {
        title,
        message: ru
          ? 'Не удалось загрузить тайминги. Файл имеет неподдерживаемый формат.'
          : 'Could not load timings. The file uses an unsupported format.',
      };
    case 'unsupported-version':
      return {
        title,
        message: ru
          ? 'Не удалось загрузить тайминги. Версия файла не поддерживается.'
          : 'Could not load timings. The file version is not supported.',
      };
    case 'invalid-structure':
      return {
        title,
        message: ru
          ? 'Не удалось загрузить тайминги. Файл повреждён или имеет неверную структуру.'
          : 'Could not load timings. The file is corrupted or has an invalid structure.',
      };
    case 'invalid-timings':
      return {
        title,
        message: ru
          ? 'Не удалось загрузить тайминги. Файл содержит некорректные значения времени.'
          : 'Could not load timings. The file contains invalid time values.',
      };
    case 'line-count-mismatch':
      return {
        title,
        message: ru
          ? 'Этот файл не соответствует текущему тексту трека. Количество строк отличается.'
          : 'This file does not match the current track lyrics. The line count differs.',
      };
    case 'text-mismatch':
      return {
        title,
        message: ru
          ? 'Этот файл относится к другому тексту. Загрузка отменена.'
          : 'This file belongs to different lyrics. Import was cancelled.',
      };
    default:
      return {
        title,
        message: ru ? 'Не удалось загрузить тайминги.' : 'Could not load timings.',
      };
  }
}
