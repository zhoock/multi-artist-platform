import type { MyArchiveArtist, MyArchiveData } from '@shared/api/archive';

const MS_SECOND = 1000;
const MS_MINUTE = 60 * MS_SECOND;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;

export function isArchiveArtistLocked(
  lockedUntil: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lockedUntil) return false;
  const ts = new Date(lockedUntil);
  if (Number.isNaN(ts.getTime())) return false;
  return ts.getTime() > now.getTime();
}

/** @deprecated Unused product constant; lock duration comes from API `lockedUntil`. */
export const COLLECTION_ARTIST_LOCK_PERIOD_DAYS = 30;

export function getCollectionArtistLockMsRemaining(
  lockedUntil: string | null | undefined,
  now: Date = new Date()
): number {
  if (!lockedUntil) return 0;
  const ts = new Date(lockedUntil);
  if (Number.isNaN(ts.getTime())) return 0;
  const msRemaining = ts.getTime() - now.getTime();
  return msRemaining > 0 ? msRemaining : 0;
}

export function getCollectionArtistLockDaysRemaining(
  lockedUntil: string | null | undefined,
  now: Date = new Date()
): number {
  const msRemaining = getCollectionArtistLockMsRemaining(lockedUntil, now);
  if (msRemaining <= 0) return 0;
  return Math.ceil(msRemaining / MS_DAY);
}

function ruPluralForm(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function formatCollectionArtistReplaceInDaysLabel(days: number, lang: 'en' | 'ru'): string {
  if (days <= 0) return '';

  if (lang === 'en') {
    return days === 1 ? 'Can be replaced in 1 day.' : `Can be replaced in ${days} days.`;
  }

  const unit = ruPluralForm(days, 'день', 'дня', 'дней');
  return `Можно заменить через ${days} ${unit}.`;
}

function formatMinutesRemainingLabel(minutes: number, lang: 'en' | 'ru'): string {
  if (minutes <= 0) return '';

  if (lang === 'en') {
    return minutes === 1
      ? 'Can be replaced in 1 minute.'
      : `Can be replaced in ${minutes} minutes.`;
  }

  const unit = ruPluralForm(minutes, 'минуту', 'минуты', 'минут');
  return `Можно заменить через ${minutes} ${unit}.`;
}

function formatSecondsRemainingLabel(seconds: number, lang: 'en' | 'ru'): string {
  if (seconds <= 0) return '';

  if (lang === 'en') {
    return seconds === 1
      ? 'Can be replaced in 1 second.'
      : `Can be replaced in ${seconds} seconds.`;
  }

  const unit = ruPluralForm(seconds, 'секунду', 'секунды', 'секунд');
  return `Можно заменить через ${seconds} ${unit}.`;
}

function formatHoursMinutesRemainingLabel(
  hours: number,
  minutes: number,
  lang: 'en' | 'ru'
): string {
  if (hours <= 0 && minutes <= 0) return '';

  if (lang === 'en') {
    if (hours <= 0) return formatMinutesRemainingLabel(minutes, lang);
    if (minutes <= 0) {
      return hours === 1 ? 'Can be replaced in 1 hour.' : `Can be replaced in ${hours} hours.`;
    }
    const hourPart = hours === 1 ? '1 hour' : `${hours} hours`;
    const minutePart = minutes === 1 ? '1 minute' : `${minutes} minutes`;
    return `Can be replaced in ${hourPart} ${minutePart}.`;
  }

  if (hours <= 0) return formatMinutesRemainingLabel(minutes, lang);
  if (minutes <= 0) {
    const hourUnit = ruPluralForm(hours, 'час', 'часа', 'часов');
    return `Можно заменить через ${hours} ${hourUnit}.`;
  }

  const hourUnit = ruPluralForm(hours, 'час', 'часа', 'часов');
  const minuteUnit = ruPluralForm(minutes, 'минуту', 'минуты', 'минут');
  return `Можно заменить через ${hours} ${hourUnit} ${minutes} ${minuteUnit}.`;
}

/**
 * Human-readable countdown until the artist can be removed (from API `lockedUntil`).
 * Returns null when the lock has already ended or the timestamp is invalid.
 */
export function formatCollectionArtistReplaceInLabel(
  lockedUntil: string | null | undefined,
  lang: 'en' | 'ru',
  now: Date = new Date()
): string | null {
  const msRemaining = getCollectionArtistLockMsRemaining(lockedUntil, now);
  if (msRemaining <= 0) return null;

  if (msRemaining >= MS_DAY) {
    const days = Math.ceil(msRemaining / MS_DAY);
    return formatCollectionArtistReplaceInDaysLabel(days, lang);
  }

  if (msRemaining >= MS_HOUR) {
    let hours = Math.floor(msRemaining / MS_HOUR);
    let minutes = Math.ceil((msRemaining % MS_HOUR) / MS_MINUTE);
    if (minutes >= 60) {
      hours += 1;
      minutes = 0;
    }
    return formatHoursMinutesRemainingLabel(hours, minutes, lang);
  }

  if (msRemaining >= MS_MINUTE) {
    const minutes = Math.ceil(msRemaining / MS_MINUTE);
    return formatMinutesRemainingLabel(minutes, lang);
  }

  const seconds = Math.max(1, Math.ceil(msRemaining / MS_SECOND));
  return formatSecondsRemainingLabel(seconds, lang);
}

export function isCollectionArtistActive(artist: Pick<MyArchiveArtist, 'isActive'>): boolean {
  return artist.isActive === true;
}

/** Time-based lock only (`lockedUntil` vs now). Independent of subscription entitlement. */
export function isCollectionArtistTimeLocked(
  artist: Pick<MyArchiveArtist, 'isActive' | 'lockedUntil'>,
  now: Date = new Date()
): boolean {
  if (!isCollectionArtistActive(artist)) return false;
  return isArchiveArtistLocked(artist.lockedUntil, now);
}

/** @alias isCollectionArtistTimeLocked */
export function isCollectionArtistLocked(
  artist: Pick<MyArchiveArtist, 'isActive' | 'lockedUntil'>,
  now: Date = new Date()
): boolean {
  return isCollectionArtistTimeLocked(artist, now);
}

export function canRemoveCollectionArtist(
  artist: Pick<MyArchiveArtist, 'isActive' | 'lockedUntil'>,
  isPremium: boolean,
  now: Date = new Date()
): boolean {
  if (!isCollectionArtistActive(artist)) return true;
  if (isCollectionArtistTimeLocked(artist, now)) return false;
  if (!isPremium) return false;
  return true;
}

export function normalizeCollectionArtist(artist: MyArchiveArtist): MyArchiveArtist {
  if (!isCollectionArtistActive(artist)) {
    return {
      ...artist,
      isActive: false,
      lockedUntil: null,
      isLocked: false,
    };
  }

  const isLocked = isCollectionArtistLocked(artist);
  return {
    ...artist,
    isActive: true,
    isLocked,
  };
}

export function normalizeCollectionArchive(data: MyArchiveData): MyArchiveData {
  const artists = data.artists.map(normalizeCollectionArtist);

  return {
    ...data,
    artists,
    slotsUsed: artists.filter((artist) => artist.isActive).length,
    inactiveCount: artists.filter((artist) => !artist.isActive).length,
  };
}

/** Milliseconds until `lockedUntil`, or null when no future lock applies. */
export function getCollectionArtistLockExpiryDelayMs(
  lockedUntil: string | null | undefined,
  now: Date = new Date()
): number | null {
  const msRemaining = getCollectionArtistLockMsRemaining(lockedUntil, now);
  return msRemaining > 0 ? msRemaining : null;
}
