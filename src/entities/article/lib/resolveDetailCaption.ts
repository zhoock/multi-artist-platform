import type { ArticledetailsProps } from '@models';

/** Подпись блока медиа: caption в приоритете, alt — для legacy-данных. */
export function resolveDetailCaption(
  detail: Pick<ArticledetailsProps, 'caption' | 'alt'>
): string | undefined {
  const caption = detail.caption?.trim();
  if (caption) return caption;
  const legacyAlt = detail.alt?.trim();
  return legacyAlt || undefined;
}
