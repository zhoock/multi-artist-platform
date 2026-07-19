/** Ключ кэша thin public catalog (`artistAlbumCatalog` / CatalogAlbum). */
export function buildPublicAlbumsFetchContextKey(publicSlug: string | null | undefined): string {
  const trimmed = publicSlug?.trim() ?? '';
  return trimmed ? `public:${trimmed}` : 'public:no-slug';
}
