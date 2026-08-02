import type { ArticledetailsProps } from '@models';

export function resolveDetailCaption(
  detail: Pick<ArticledetailsProps, 'caption'>
): string | undefined {
  const caption = detail.caption?.trim();
  return caption || undefined;
}
