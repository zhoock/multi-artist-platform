/**
 * Public album page: band member / producer lines show the role after «—» in lowercase.
 * Stored album data is unchanged; apply only when rendering.
 */

/** Lowercase the first character of the segment after an em dash (—). */
export function formatPublicCreditLineAfterEmDash(line: string): string {
  const match = line.match(/^([\s\S]*?\s—\s)([\s\S])([\s\S]*)$/);
  if (!match) return line;
  const [, prefix, firstChar, rest] = match;
  return `${prefix}${firstChar.toLocaleLowerCase()}${rest}`;
}

/** Lowercase the first character of a standalone role fragment (producing: name + role columns). */
export function formatPublicCreditRoleFragment(role: string): string {
  const trimmed = role.trim();
  if (!trimmed) return role;
  return trimmed.charAt(0).toLocaleLowerCase() + trimmed.slice(1);
}
