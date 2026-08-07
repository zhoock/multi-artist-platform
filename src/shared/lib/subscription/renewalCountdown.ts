const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const TWO_DAYS_MS = 2 * DAY_MS;

/** How long to show the in-progress message after nextChargeAt passes. */
export const RENEWAL_OVERDUE_IN_PROGRESS_MS = 3 * MINUTE_MS;

export const RENEWAL_COUNTDOWN_OVERDUE_IN_PROGRESS = {
  en: 'Updating...',
  ru: 'обновляется...',
} as const;

export const RENEWAL_COUNTDOWN_OVERDUE_AWAITING = {
  en: 'Awaiting confirmation...',
  ru: 'ожидается подтверждение...',
} as const;

/** @deprecated Use RENEWAL_COUNTDOWN_OVERDUE_IN_PROGRESS */
export const RENEWAL_COUNTDOWN_OVERDUE_LABEL = RENEWAL_COUNTDOWN_OVERDUE_IN_PROGRESS;

export type RenewalLang = 'en' | 'ru';

export type RenewalCountdownSource = 'nextChargeAt' | 'expiresAt' | null;

export type RenewalCountdownDisplay = {
  /** Text for `{date}` placeholders — includes «через» / «in» when relative. */
  label: string | null;
  /** Absolute charge datetime for tooltips. */
  title: string | null;
  source: RenewalCountdownSource;
  isRelative: boolean;
  isOverdue: boolean;
};

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function withRelativePrefix(relativePart: string, lang: RenewalLang): string {
  return lang === 'ru' ? `через ${relativePart}` : `in ${relativePart}`;
}

export function formatRenewalChargeDate(iso: string, lang: RenewalLang): string | null {
  try {
    return new Date(iso).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

export function formatRenewalChargeDateTime(iso: string, lang: RenewalLang): string | null {
  try {
    return new Date(iso).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

function formatDaysHours(days: number, hours: number, lang: RenewalLang): string {
  if (lang === 'en') {
    const dayPart = days === 1 ? '1 day' : `${days} days`;
    if (hours <= 0) return dayPart;
    const hourPart = hours === 1 ? '1 hour' : `${hours} hours`;
    return `${dayPart} ${hourPart}`;
  }

  const dayWord = pluralRu(days, 'день', 'дня', 'дней');
  const dayPart = `${days} ${dayWord}`;
  if (hours <= 0) return dayPart;
  const hourWord = pluralRu(hours, 'час', 'часа', 'часов');
  return `${dayPart} ${hours} ${hourWord}`;
}

function formatHoursMinutes(hours: number, minutes: number, lang: RenewalLang): string {
  if (lang === 'en') {
    const hourPart = hours === 1 ? '1 hour' : `${hours} hours`;
    if (minutes <= 0) return hourPart;
    const minutePart = minutes === 1 ? '1 minute' : `${minutes} minutes`;
    return `${hourPart} ${minutePart}`;
  }

  const hourWord = pluralRu(hours, 'час', 'часа', 'часов');
  const hourPart = `${hours} ${hourWord}`;
  if (minutes <= 0) return hourPart;
  const minuteWord = pluralRu(minutes, 'минута', 'минуты', 'минут');
  return `${hourPart} ${minutes} ${minuteWord}`;
}

function formatMinutesOnly(minutes: number, lang: RenewalLang, accusative = false): string {
  if (lang === 'en') {
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  const minuteWord = accusative
    ? pluralRu(minutes, 'минуту', 'минуты', 'минут')
    : pluralRu(minutes, 'минута', 'минуты', 'минут');
  return `${minutes} ${minuteWord}`;
}

function formatSecondsOnly(seconds: number, lang: RenewalLang, accusative = false): string {
  if (lang === 'en') {
    return seconds === 1 ? '1 second' : `${seconds} seconds`;
  }
  const secondWord = accusative
    ? pluralRu(seconds, 'секунду', 'секунды', 'секунд')
    : pluralRu(seconds, 'секунда', 'секунды', 'секунд');
  return `${seconds} ${secondWord}`;
}

function formatOverdueLabel(overdueMs: number, lang: RenewalLang): string {
  if (overdueMs <= RENEWAL_OVERDUE_IN_PROGRESS_MS) {
    return RENEWAL_COUNTDOWN_OVERDUE_IN_PROGRESS[lang];
  }
  return RENEWAL_COUNTDOWN_OVERDUE_AWAITING[lang];
}

export function getRenewalCountdownRemainingMs(
  nextChargeAt: string,
  now: Date = new Date()
): number | null {
  const targetMs = new Date(nextChargeAt).getTime();
  if (Number.isNaN(targetMs)) return null;
  return targetMs - now.getTime();
}

/** Tick every second only in the last minute before charge; otherwise once per minute. */
export function getRenewalCountdownTickInterval(remainingMs: number): number {
  if (remainingMs > 0 && remainingMs < MINUTE_MS) return SECOND_MS;
  return MINUTE_MS;
}

function formatRelativeRenewalCore(params: {
  nextChargeAt: string;
  lang: RenewalLang;
  now: Date;
}): Pick<RenewalCountdownDisplay, 'label' | 'isRelative' | 'isOverdue'> {
  const remainingMs = getRenewalCountdownRemainingMs(params.nextChargeAt, params.now);
  if (remainingMs === null) {
    return { label: null, isRelative: false, isOverdue: false };
  }

  if (remainingMs <= 0) {
    return {
      label: formatOverdueLabel(Math.abs(remainingMs), params.lang),
      isRelative: false,
      isOverdue: true,
    };
  }

  let relativePart: string;

  if (remainingMs > TWO_DAYS_MS) {
    const dateLabel = formatRenewalChargeDate(params.nextChargeAt, params.lang);
    return {
      label: dateLabel,
      isRelative: false,
      isOverdue: false,
    };
  }

  if (remainingMs >= DAY_MS) {
    const days = Math.floor(remainingMs / DAY_MS);
    const hours = Math.floor((remainingMs % DAY_MS) / HOUR_MS);
    relativePart = formatDaysHours(days, hours, params.lang);
  } else if (remainingMs >= HOUR_MS) {
    const hours = Math.floor(remainingMs / HOUR_MS);
    const minutes = Math.floor((remainingMs % HOUR_MS) / MINUTE_MS);
    relativePart = formatHoursMinutes(hours, minutes, params.lang);
  } else if (remainingMs >= MINUTE_MS) {
    const minutes = Math.floor(remainingMs / MINUTE_MS);
    relativePart = formatMinutesOnly(minutes, params.lang, params.lang === 'ru');
  } else {
    const seconds = Math.ceil(remainingMs / SECOND_MS);
    if (seconds <= 0) {
      return {
        label: formatOverdueLabel(0, params.lang),
        isRelative: false,
        isOverdue: true,
      };
    }
    relativePart = formatSecondsOnly(seconds, params.lang, params.lang === 'ru');
  }

  return {
    label: withRelativePrefix(relativePart, params.lang),
    isRelative: true,
    isOverdue: false,
  };
}

/**
 * Adaptive label for the next auto-charge time (relative core without expiresAt fallback).
 */
export function formatRelativeRenewalTime(params: {
  nextChargeAt: string;
  lang: RenewalLang;
  now?: Date;
}): string | null {
  const result = formatRelativeRenewalCore({
    nextChargeAt: params.nextChargeAt,
    lang: params.lang,
    now: params.now ?? new Date(),
  });
  return result.label;
}

export function resolveRenewalCountdownDisplay(params: {
  nextChargeAt: string | null | undefined;
  expiresAt: string | null | undefined;
  lang: RenewalLang;
  now?: Date;
}): RenewalCountdownDisplay {
  const now = params.now ?? new Date();

  if (params.nextChargeAt) {
    const targetMs = new Date(params.nextChargeAt).getTime();
    if (!Number.isNaN(targetMs)) {
      const core = formatRelativeRenewalCore({
        nextChargeAt: params.nextChargeAt,
        lang: params.lang,
        now,
      });

      return {
        ...core,
        title: formatRenewalChargeDateTime(params.nextChargeAt, params.lang),
        source: 'nextChargeAt',
      };
    }
  }

  if (params.expiresAt) {
    const dateLabel = formatRenewalChargeDate(params.expiresAt, params.lang);
    if (dateLabel) {
      return {
        label: dateLabel,
        title: formatRenewalChargeDateTime(params.expiresAt, params.lang),
        source: 'expiresAt',
        isRelative: false,
        isOverdue: false,
      };
    }
  }

  return {
    label: null,
    title: null,
    source: null,
    isRelative: false,
    isOverdue: false,
  };
}

export function isRenewalCountdownOverdue(nextChargeAt: string, now: Date = new Date()): boolean {
  const remainingMs = getRenewalCountdownRemainingMs(nextChargeAt, now);
  return remainingMs !== null && remainingMs <= 0;
}
