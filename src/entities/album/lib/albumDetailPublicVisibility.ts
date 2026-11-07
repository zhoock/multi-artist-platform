import type { detailsProps } from '@models';
import type { AlbumDetails } from '../model/albumDetails';

function isNonemptyTrimmedString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecordingContentItemVisible(item: Record<string, unknown>): boolean {
  const dateFrom = item.dateFrom;
  const hasDateFromField = dateFrom !== null && dateFrom !== undefined;
  const dateFromText = typeof dateFrom === 'string' ? dateFrom.trim() : '';
  const dateTo = typeof item.dateTo === 'string' ? item.dateTo.trim() : '';
  const studio = typeof item.studioText === 'string' ? item.studioText.trim() : '';
  const city = typeof item.city === 'string' ? item.city.trim() : '';

  if (!hasDateFromField) {
    return studio.length > 0 || city.length > 0;
  }

  return dateFromText.length > 0 || dateTo.length > 0 || studio.length > 0 || city.length > 0;
}

function isTextDetailContentItemVisible(item: { text?: unknown; link?: unknown }): boolean {
  const textValue = item.text;
  if (typeof textValue === 'string') {
    return isNonemptyTrimmedString(textValue);
  }

  if (!Array.isArray(textValue)) return false;

  if (textValue.length === 2) {
    const name = String(textValue[0] ?? '').trim();
    const role = String(textValue[1] ?? '').trim();
    return name.length > 0 || role.length > 0;
  }

  if (textValue.length >= 3 && isNonemptyTrimmedString(item.link)) {
    const linkedText = String(textValue[1] ?? '').trim();
    const textAfter = String(textValue[2] ?? '').trim();
    const textBefore = String(textValue[0] ?? '').trim();
    return linkedText.length > 0 || textAfter.length > 0 || textBefore.length > 0;
  }

  const joined = textValue.map((part) => String(part ?? '').trim()).join('');
  return joined.length > 0;
}

/** Whether a single `details[].content` entry would produce visible album-page copy. */
export function isAlbumDetailContentItemPubliclyVisible(item: unknown): boolean {
  if (item == null) return false;
  if (typeof item === 'string') return isNonemptyTrimmedString(item);

  if (typeof item !== 'object') return false;

  const record = item as Record<string, unknown>;
  if ('dateFrom' in record && !('text' in record)) {
    return isRecordingContentItemVisible(record);
  }

  if ('text' in record) {
    return isTextDetailContentItemVisible(record as { text?: unknown; link?: unknown });
  }

  return false;
}

type AlbumDetailContentItem = detailsProps['content'][number];

export function filterAlbumDetailContentForPublicDisplay(
  content: detailsProps['content'] | unknown
): AlbumDetailContentItem[] {
  if (!Array.isArray(content)) return [];
  return content.filter((item): item is AlbumDetailContentItem =>
    isAlbumDetailContentItemPubliclyVisible(item)
  );
}

export function isAlbumDetailBlockPubliclyVisible(block: detailsProps): boolean {
  return filterAlbumDetailContentForPublicDisplay(block.content).length > 0;
}

export function pruneEmptyAlbumDetailBlocksForPublicDisplay(
  details: detailsProps[]
): detailsProps[] {
  return details
    .map((block) => ({
      ...block,
      content: filterAlbumDetailContentForPublicDisplay(block.content),
    }))
    .filter((block) => block.content.length > 0);
}

export function hasPublicAlbumArtworkPhotographer(
  artwork: AlbumDetails['artwork'] | undefined
): boolean {
  return isNonemptyTrimmedString(artwork?.photographer);
}

export function hasPublicAlbumArtworkDesigner(
  artwork: AlbumDetails['artwork'] | undefined
): boolean {
  return isNonemptyTrimmedString(artwork?.designer);
}

export function hasPublicAlbumArtworkCredits(
  artwork: AlbumDetails['artwork'] | undefined
): boolean {
  return hasPublicAlbumArtworkPhotographer(artwork) || hasPublicAlbumArtworkDesigner(artwork);
}
