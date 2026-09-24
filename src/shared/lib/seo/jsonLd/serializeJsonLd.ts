/**
 * Safe JSON-LD serialization for `<script type="application/ld+json">`.
 * Escapes characters that could break out of a script context.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
