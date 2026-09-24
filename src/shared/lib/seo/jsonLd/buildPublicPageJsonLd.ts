import { platformDisplayName, platformSeoForLang } from '@shared/constants/platformBranding';

import { pruneJsonLdNode } from './pruneJsonLdNode';

const SCHEMA_CONTEXT = 'https://schema.org';

export type PlatformHomeJsonLdInput = {
  lang: string;
  siteUrl: string;
  siteName?: string;
  description?: string;
};

export function buildPlatformHomeJsonLd(input: PlatformHomeJsonLdInput): Record<string, unknown>[] {
  const platform = platformSeoForLang(input.lang);
  const name = input.siteName?.trim() || platformDisplayName(input.lang);
  const description = input.description?.trim() || platform.description;
  const url = input.siteUrl.trim();

  const website = pruneJsonLdNode({
    '@context': SCHEMA_CONTEXT,
    '@type': 'WebSite',
    name,
    url,
    description,
  });

  const organization = pruneJsonLdNode({
    '@context': SCHEMA_CONTEXT,
    '@type': 'Organization',
    name,
    url,
    description,
  });

  return [website, organization];
}

export type ArtistJsonLdInput = {
  name: string;
  description: string;
  url: string;
  imageUrl?: string | null;
};

/** MusicGroup unless the product model later exposes an unambiguous solo-artist signal. */
export function buildArtistJsonLd(input: ArtistJsonLdInput): Record<string, unknown> {
  const name = input.name.trim();
  const url = input.url.trim();
  return pruneJsonLdNode({
    '@context': SCHEMA_CONTEXT,
    '@type': 'MusicGroup',
    name,
    description: input.description.trim(),
    url,
    image: input.imageUrl?.trim() || undefined,
  });
}

export type SchemaMusicArtistRef = {
  name: string;
  url: string;
};

export type AlbumJsonLdInput = {
  name: string;
  description?: string | null;
  url: string;
  imageUrl?: string | null;
  artist: SchemaMusicArtistRef;
};

export function buildAlbumJsonLd(input: AlbumJsonLdInput): Record<string, unknown> {
  const artistName = input.artist.name.trim();
  const artistUrl = input.artist.url.trim();
  return pruneJsonLdNode({
    '@context': SCHEMA_CONTEXT,
    '@type': 'MusicAlbum',
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    url: input.url.trim(),
    image: input.imageUrl?.trim() || undefined,
    byArtist: pruneJsonLdNode({
      '@type': 'MusicGroup',
      name: artistName,
      url: artistUrl,
    }),
  });
}

export type ArticleJsonLdInput = {
  headline: string;
  description?: string | null;
  datePublished: string;
  url: string;
  imageUrl?: string | null;
  author: SchemaMusicArtistRef;
};

export function buildArticleJsonLd(input: ArticleJsonLdInput): Record<string, unknown> {
  const authorName = input.author.name.trim();
  const authorUrl = input.author.url.trim();
  return pruneJsonLdNode({
    '@context': SCHEMA_CONTEXT,
    '@type': 'Article',
    headline: input.headline.trim(),
    description: input.description?.trim() || undefined,
    datePublished: input.datePublished.trim(),
    mainEntityOfPage: input.url.trim(),
    url: input.url.trim(),
    image: input.imageUrl?.trim() || undefined,
    author: pruneJsonLdNode({
      '@type': 'MusicGroup',
      name: authorName,
      url: authorUrl,
    }),
  });
}
