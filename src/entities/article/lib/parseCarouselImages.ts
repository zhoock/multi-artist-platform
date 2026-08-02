import type { ArticledetailsProps, CarouselImageItem } from '@models';

type CarouselDetailSource = Pick<ArticledetailsProps, 'images' | 'img' | 'caption' | 'type'>;

export function parseCarouselImagesFromDetail(detail: CarouselDetailSource): CarouselImageItem[] {
  const detailCaption = detail.caption?.trim() || undefined;
  const raw = detail.images ?? (Array.isArray(detail.img) ? detail.img : []);

  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }

  return raw
    .map((entry, index): CarouselImageItem | null => {
      if (!entry || typeof entry !== 'object') return null;

      const obj = entry as { imageKey?: unknown; key?: unknown; caption?: unknown };
      const imageKey = String(obj.imageKey ?? obj.key ?? '').trim();
      if (!imageKey) return null;
      const caption =
        typeof obj.caption === 'string' && obj.caption.trim()
          ? obj.caption.trim()
          : index === 0
            ? detailCaption
            : undefined;
      return { imageKey, caption };
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
