import type { MyArchiveArtist } from '@shared/api/archive';

export function isArchiveArtistLocked(
  lockedUntil: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lockedUntil) return false;
  const ts = new Date(lockedUntil);
  if (Number.isNaN(ts.getTime())) return false;
  return ts.getTime() > now.getTime();
}

export function canRemoveCollectionArtist(
  artist: Pick<MyArchiveArtist, 'isActive' | 'lockedUntil'>,
  isPremium: boolean,
  now: Date = new Date()
): boolean {
  if (!artist.isActive) return true;
  if (!isPremium) return false;
  return !isArchiveArtistLocked(artist.lockedUntil, now);
}
