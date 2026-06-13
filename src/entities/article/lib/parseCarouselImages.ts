import type { ArticledetailsProps, CarouselImageItem } from '@models';

import { resolveDetailCaption } from './resolveDetailCaption';

type CarouselDetailSource = Pick<
  ArticledetailsProps,
  'images' | 'img' | 'caption' | 'alt' | 'type'
>;

export function parseCarouselImagesFromDetail(detail: CarouselDetailSource): CarouselImageItem[] {
  const legacyCaption = resolveDetailCaption(detail);
  const raw = detail.images ?? (Array.isArray(detail.img) ? detail.img : []);

  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }

  return raw
    .map((entry, index): CarouselImageItem | null => {
      if (typeof entry === 'string') {
        const imageKey = entry.trim();
        if (!imageKey) return null;
        return {
          imageKey,
          caption: index === 0 && legacyCaption ? legacyCaption : undefined,
        };
      }

      if (entry && typeof entry === 'object') {
        const obj = entry as { imageKey?: unknown; key?: unknown; caption?: unknown };
        const imageKey = String(obj.imageKey ?? obj.key ?? '').trim();
        if (!imageKey) return null;
        const caption =
          typeof obj.caption === 'string' && obj.caption.trim() ? obj.caption.trim() : undefined;
        return { imageKey, caption };
      }

      return null;
    })
    .filter((item): item is CarouselImageItem => item !== null);
}

export function serializeCarouselImagesForDetail(
  items: CarouselImageItem[]
): NonNullable<ArticledetailsProps['images']> {
  return items.map(({ imageKey, caption }) =>
    caption?.trim() ? { imageKey, caption: caption.trim() } : { imageKey }
  );
}

export function mergeCarouselImageKeys(
  previous: CarouselImageItem[],
  imageKeys: string[]
): CarouselImageItem[] {
  const captionByKey = new Map(previous.map((item) => [item.imageKey, item.caption]));
  return imageKeys.map((imageKey) => ({
    imageKey,
    caption: captionByKey.get(imageKey),
  }));
}
