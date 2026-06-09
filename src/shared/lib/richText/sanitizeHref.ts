// src/shared/lib/richText/sanitizeHref.ts

/**
 * Единый источник правил безопасности для inline-ссылок.
 *
 * Разрешаем только безопасные схемы (http, https, mailto, tel). Всё потенциально
 * опасное (javascript:, data:, vbscript: и т.п.) отбрасываем, чтобы не было XSS.
 * Относительные ссылки, якоря и protocol-relative считаются безопасными.
 *
 * Используется и `renderInlineMarkdown` (markdown-рендер), и `renderRichText`
 * (node-based рендер) — правила XSS должны быть едиными.
 */
export function sanitizeHref(rawHref: string): string | null {
  const href = rawHref.trim();
  if (href === '') return null;

  // Относительные пути, якоря и protocol-relative — безопасны.
  if (/^(\/|#|\.|\?)/.test(href) || /^\/\//.test(href)) {
    return href;
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(href);
  if (!schemeMatch) {
    // Нет схемы (например, "example.com/path") — трактуем как внешнюю https-ссылку.
    return `https://${href}`;
  }

  const scheme = schemeMatch[1].toLowerCase();
  const allowed = ['http', 'https', 'mailto', 'tel'];
  return allowed.includes(scheme) ? href : null;
}
