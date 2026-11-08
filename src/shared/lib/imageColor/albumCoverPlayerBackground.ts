/**
 * Precomputed full-player ambient gradient stops for an album cover.
 * Extracted once at cover upload; not recomputed in the player.
 */

/** Mutable tuple — Redux/Immer `AlbumDetails` draft must be assignable. */
export type RgbTriple = [number, number, number];

export interface AlbumCoverPlayerBackground {
  primary: RgbTriple;
  secondary: RgbTriple;
}

const RGB_TUPLE_PATTERN = /^\d{1,3},\d{1,3},\d{1,3}$/;

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function readRgbTriple(value: unknown): RgbTriple | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const r = clampByte(Number(value[0]));
  const g = clampByte(Number(value[1]));
  const b = clampByte(Number(value[2]));
  return [r, g, b];
}

export function isAlbumCoverPlayerBackground(value: unknown): value is AlbumCoverPlayerBackground {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const primary = readRgbTriple(row.primary);
  const secondary = readRgbTriple(row.secondary);
  return primary !== null && secondary !== null;
}

export function parseAlbumCoverPlayerBackground(value: unknown): AlbumCoverPlayerBackground | null {
  return isAlbumCoverPlayerBackground(value) ? value : null;
}

export function formatRgbTriple([r, g, b]: RgbTriple): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** CSS linear-gradient for Popup full player — matches legacy player gradient syntax. */
export function buildPlayerAmbientGradientCss(bg: AlbumCoverPlayerBackground): string {
  return `linear-gradient(var(--rotate, 132deg), ${formatRgbTriple(bg.primary)}, ${formatRgbTriple(bg.secondary)})`;
}

export function playerAmbientGradientFromBackground(
  bg: AlbumCoverPlayerBackground | null | undefined
): string | null {
  if (!bg) return null;
  return buildPlayerAmbientGradientCss(bg);
}

/** Stable key for React deps / cache. */
export function albumCoverPlayerBackgroundKey(
  bg: AlbumCoverPlayerBackground | null | undefined
): string {
  if (!bg) return '';
  const encode = ([r, g, b]: RgbTriple) => `${r}-${g}-${b}`;
  return `${encode(bg.primary)}|${encode(bg.secondary)}`;
}

/** @internal — validates serialized tuple strings if needed later. */
export function isRgbTripleString(value: string): boolean {
  return RGB_TUPLE_PATTERN.test(value);
}
