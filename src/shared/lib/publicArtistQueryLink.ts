/**
 * Чистый билдер публичных ссылок с `?artist=slug`.
 *
 * Вынесен из `artistQuery.ts` отдельным модулем без зависимостей: его использует
 * `seo/publicPagePaths.ts`, который бандлится в Netlify-функцию `sitemap`.
 * Импорт из `artistQuery.ts` тянул бы в бандл браузерный код (auth → authIntent → React/SCSS).
 */

/**
 * Сохраняет контекст публичного профиля (?artist=slug) в ссылке.
 * Нужно для /articles/:id и списка статей: иначе после F5 API грузит только дефолтного артиста.
 */
export function withPublicArtistQuery(
  pathWithOptionalQuery: string,
  artistSlug: string | null | undefined
): string {
  const slug = artistSlug?.trim();
  if (!slug) return pathWithOptionalQuery;

  const qMark = pathWithOptionalQuery.indexOf('?');
  const path = qMark === -1 ? pathWithOptionalQuery : pathWithOptionalQuery.slice(0, qMark);
  const queryString = qMark === -1 ? '' : pathWithOptionalQuery.slice(qMark + 1);
  const params = new URLSearchParams(queryString);
  params.set('artist', slug);
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}
