export type SceneArtist = {
  userId?: string;
  name: string;
  publicSlug: string;
  genreCode: string;
  genreLabel?: { ru: string; en: string };
  headerImages?: string[];
  /** Active payment acceptance for this artist (premium / collection UI). */
  monetizationEnabled?: boolean;
  /** Hex (e.g. 0x4d80ff); overrides palette for cluster tint (hero / custom). */
  clusterColor?: number;
  /** Deduped tags from this artist's published albums (`release.tags`). */
  albumTags?: string[];
};
