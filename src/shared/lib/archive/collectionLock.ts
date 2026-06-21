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
