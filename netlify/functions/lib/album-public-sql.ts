/**
 * Shared SQL fragment: album row is visible for public catalog / discovery / SEO.
 * Copyright admin may set copyright_restricted without changing is_published.
 */
export const albumRowPublicDiscoverySql = (alias: string): string =>
  `${alias}.copyright_restricted = false`;
