import type { MyArchiveArtist, MyArchiveData } from '@shared/api/archive';

export function isArchiveArtistLocked(
  lockedUntil: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lockedUntil) return false;
  const ts = new Date(lockedUntil);
  if (Number.isNaN(ts.getTime())) return false;
  return ts.getTime() > now.getTime();
}

export const COLLECTION_ARTIST_LOCK_PERIOD_DAYS = 30;

export function getCollectionArtistLockDaysRemaining(
  lockedUntil: string | null | undefined,
  now: Date = new Date()
): number {
  if (!lockedUntil) return 0;
  const ts = new Date(lockedUntil);
  if (Number.isNaN(ts.getTime())) return 0;
  const msRemaining = ts.getTime() - now.getTime();
  if (msRemaining <= 0) return 0;
  return Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
}

export function formatCollectionArtistReplaceInDaysLabel(days: number, lang: 'en' | 'ru'): string {
  const count = Math.max(1, days);

  if (lang === 'en') {
    return count === 1 ? 'Can be replaced in 1 day.' : `Can be replaced in ${count} days.`;
  }

  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return `Можно заменить через ${count} дней.`;
  if (mod10 === 1) return `Можно заменить через ${count} день.`;
  if (mod10 >= 2 && mod10 <= 4) return `Можно заменить через ${count} дня.`;
  return `Можно заменить через ${count} дней.`;
}

export function isCollectionArtistActive(artist: Pick<MyArchiveArtist, 'isActive'>): boolean {
  return artist.isActive === true;
}

export function isCollectionArtistLocked(
  artist: Pick<MyArchiveArtist, 'isActive' | 'lockedUntil'>,
  now: Date = new Date()
): boolean {
  if (!isCollectionArtistActive(artist)) return false;
  return isArchiveArtistLocked(artist.lockedUntil, now);
}

export function canRemoveCollectionArtist(
  artist: Pick<MyArchiveArtist, 'isActive' | 'lockedUntil'>,
  isPremium: boolean,
  now: Date = new Date()
): boolean {
  if (!isCollectionArtistActive(artist)) return true;
  if (!isPremium) return false;
  return !isCollectionArtistLocked(artist, now);
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
