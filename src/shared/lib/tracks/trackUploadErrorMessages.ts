import type { IInterface } from '@models';
import type { SupportedLang } from '@shared/model/lang';

type TrackUploadErrorCopy = {
  fileTooLarge: string;
  fileFailed: string;
  uploadCancelled: string;
  uploadTimeout: string;
  notAuthenticated: string;
  failedGetUploadUrl: string;
  invalidServerResponse: string;
  failedSaveTracks: string;
  unknownError: string;
};

function defaultCopy(lang: SupportedLang): TrackUploadErrorCopy {
  if (lang === 'ru') {
    return {
      fileTooLarge: 'Файл слишком большой для загрузки. Максимальный размер — 50 МБ.',
      fileFailed: 'Не удалось загрузить файл',
      uploadCancelled: 'Загрузка отменена.',
      uploadTimeout:
        'Превышено время ожидания: файл слишком большой или соединение слишком медленное. Попробуйте файл меньшего размера или проверьте интернет.',
      notAuthenticated: 'Вы не авторизованы. Войдите в аккаунт.',
      failedGetUploadUrl: 'Не удалось получить URL для загрузки. Попробуйте ещё раз.',
      invalidServerResponse: 'Некорректный ответ сервера. Попробуйте ещё раз.',
      failedSaveTracks: 'Не удалось сохранить треки.',
      unknownError: 'Неизвестная ошибка',
    };
  }

  return {
    fileTooLarge: 'File is too large for storage upload. Maximum size is 50 MB.',
    fileFailed: 'Failed to upload file',
    uploadCancelled: 'Upload cancelled.',
    uploadTimeout:
      'Upload timed out: the file may be too large or your connection too slow. Try a smaller file or check your connection.',
    notAuthenticated: 'You are not signed in. Please log in.',
    failedGetUploadUrl: 'Could not get upload URL. Please try again.',
    invalidServerResponse: 'Invalid response from server. Please try again.',
    failedSaveTracks: 'Failed to save tracks.',
    unknownError: 'Unknown error',
  };
}

export function resolveTrackUploadErrorCopy(
  lang: SupportedLang,
  ui?: IInterface | null
): TrackUploadErrorCopy {
  const defaults = defaultCopy(lang);
  const dashboard = ui?.dashboard;

  return {
    fileTooLarge: dashboard?.trackUploadFileTooLarge ?? defaults.fileTooLarge,
    fileFailed: dashboard?.trackUploadFileFailed ?? defaults.fileFailed,
    uploadCancelled: dashboard?.uploadCancelled ?? defaults.uploadCancelled,
    uploadTimeout: dashboard?.trackUploadTimeout ?? defaults.uploadTimeout,
    notAuthenticated: dashboard?.trackUploadNotAuthenticated ?? defaults.notAuthenticated,
    failedGetUploadUrl: dashboard?.trackUploadFailedGetUrl ?? defaults.failedGetUploadUrl,
    invalidServerResponse:
      dashboard?.trackUploadInvalidServerResponse ?? defaults.invalidServerResponse,
    failedSaveTracks: dashboard?.trackUploadFailedSave ?? defaults.failedSaveTracks,
    unknownError: dashboard?.trackUploadUnknownError ?? defaults.unknownError,
  };
}

export function formatStorageUploadError(
  status: number,
  statusText: string,
  errorText: string,
  lang: SupportedLang,
  ui?: IInterface | null
): string {
  const copy = resolveTrackUploadErrorCopy(lang, ui);
  let detail = errorText.trim();
  if (detail) {
    try {
      const parsed = JSON.parse(detail) as {
        message?: string;
        error?: string;
      };
      detail = parsed.message?.trim() || parsed.error?.trim() || detail;
    } catch {
      // keep raw body
    }
  }

  if (
    status === 413 ||
    /too large|payload too large|entity too large|maximum.*size/i.test(detail)
  ) {
    return copy.fileTooLarge;
  }

  if (detail) {
    return `${copy.fileFailed}: ${detail}`;
  }

  return `${copy.fileFailed}: ${status} ${statusText}`;
}

export function formatTrackUploadTimeoutMessage(
  lang: SupportedLang,
  ui?: IInterface | null
): string {
  return resolveTrackUploadErrorCopy(lang, ui).uploadTimeout;
}

export function formatTrackUploadCancelledMessage(
  lang: SupportedLang,
  ui?: IInterface | null
): string {
  return resolveTrackUploadErrorCopy(lang, ui).uploadCancelled;
}

export function resolveTrackUploadFailureReason(
  error: unknown,
  lang: SupportedLang,
  ui?: IInterface | null
): string {
  const copy = resolveTrackUploadErrorCopy(lang, ui);
  if (!(error instanceof Error)) {
    return typeof error === 'string' ? error : copy.unknownError;
  }

  return error.message || copy.unknownError;
}
