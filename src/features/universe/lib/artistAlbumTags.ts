/** Max tag badges shown on the home artist card; full list stays on `SceneArtist.albumTags` for search. */
export const UNIVERSE_ARTIST_CARD_VISIBLE_TAG_LIMIT = 4;

export function splitVisibleAlbumTags(allTags: string[] | undefined): {
  visible: string[];
  overflow: string[];
} {
  const tags = (allTags ?? []).map((t) => t.trim()).filter(Boolean);
  if (tags.length <= UNIVERSE_ARTIST_CARD_VISIBLE_TAG_LIMIT) {
    return { visible: tags, overflow: [] };
  }
  return {
    visible: tags.slice(0, UNIVERSE_ARTIST_CARD_VISIBLE_TAG_LIMIT),
    overflow: tags.slice(UNIVERSE_ARTIST_CARD_VISIBLE_TAG_LIMIT),
  };
}
