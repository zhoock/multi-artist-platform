import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
} as const;

const NOT_FOUND_CACHE_HEADERS = {
  ...HTML_HEADERS,
  'Cache-Control': 'public, max-age=60',
} as const;

function documentDir(): string {
  const candidates = [resolve(__dirname, '../../_document'), resolve(__dirname, '_document')];
  for (const dir of candidates) {
    if (existsSync(resolve(dir, '404.html'))) {
      return dir;
    }
  }
  return candidates[0];
}

let cachedIndexHtml: string | null = null;
let cachedNotFoundHtml: string | null = null;

export function getIndexHtml(): string {
  if (cachedIndexHtml === null) {
    cachedIndexHtml = readFileSync(resolve(documentDir(), 'index.html'), 'utf8');
  }
  return cachedIndexHtml;
}

export function getNotFoundHtml(): string {
  if (cachedNotFoundHtml === null) {
    cachedNotFoundHtml = readFileSync(resolve(documentDir(), '404.html'), 'utf8');
  }
  return cachedNotFoundHtml;
}

export function buildDocument200Response(body: string) {
  return {
    statusCode: 200,
    headers: HTML_HEADERS,
    body,
  };
}

export function buildDocument404Response(body: string) {
  return {
    statusCode: 404,
    headers: NOT_FOUND_CACHE_HEADERS,
    body,
  };
}

/** Test helper — reset memoized HTML between tests. */
export function resetDocumentHtmlCacheForTests(): void {
  cachedIndexHtml = null;
  cachedNotFoundHtml = null;
}
