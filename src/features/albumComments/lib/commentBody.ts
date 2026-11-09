export const MAX_ALBUM_COMMENT_CHARS = 1000;

export function isSubmittableCommentBody(value: string): boolean {
  return value.trim().length > 0 && value.length <= MAX_ALBUM_COMMENT_CHARS;
}
