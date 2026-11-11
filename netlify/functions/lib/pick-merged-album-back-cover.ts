export type AlbumCoverMergeLocale = {
  updatedAt?: string;
  backCover?: string;
};

/** Preserves optional back cover when merging locale rows for GET /api/albums. */
export function pickMergedAlbumBackCover(payloads: AlbumCoverMergeLocale[]): string | undefined {
  const sortedForShared = [...payloads].sort((a, b) => {
    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return tb - ta;
  });
  const fromShared = sortedForShared[0]?.backCover?.trim();
  if (fromShared) return fromShared;
  return payloads.map((p) => p.backCover?.trim()).find((b) => Boolean(b));
}
