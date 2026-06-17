export type NavListSection = 'albums' | 'articles' | 'mixer';

export type ContextNavMode = 'artist-only' | 'list-and-artist';

export interface NavigationOrigin {
  /** Пользователь пришёл с главной страницы артиста. */
  isArtistHubOrigin: boolean;
  /** Раздел списка для двухссылочного режима. */
  listSection: NavListSection | null;
  /** Прямой вход (нет распознанного контекста). */
  isDirectEntry: boolean;
}

function isArtistHubPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/en' || pathname === '/en/';
}

function pathToListSection(pathname: string): NavListSection | null {
  if (pathname === '/albums' || pathname === '/en/albums') return 'albums';
  if (pathname === '/articles' || pathname === '/en/articles') return 'articles';
  if (pathname === '/stems' || pathname.startsWith('/stems/')) return 'mixer';
  if (pathname === '/en/stems' || pathname.startsWith('/en/stems/')) return 'mixer';
  return null;
}

function readPreviousPathFromReferrer(): string | null {
  if (typeof document === 'undefined' || !document.referrer) return null;

  try {
    const origin = window.location.origin;
    const referrerUrl = new URL(document.referrer);
    if (referrerUrl.origin !== origin) return null;
    return referrerUrl.pathname;
  } catch {
    return null;
  }
}

export function readPreviousPath(): string | null {
  if (typeof window === 'undefined') return null;

  const fromStorage = sessionStorage.getItem('previousPath');
  if (fromStorage) return fromStorage;

  return readPreviousPathFromReferrer();
}

export function resolveNavigationOrigin(previousPath?: string | null): NavigationOrigin {
  const path = previousPath ?? readPreviousPath();

  if (!path) {
    return { isArtistHubOrigin: false, listSection: null, isDirectEntry: true };
  }

  if (isArtistHubPath(path)) {
    return { isArtistHubOrigin: true, listSection: null, isDirectEntry: false };
  }

  const listSection = pathToListSection(path);
  if (listSection) {
    return { isArtistHubOrigin: false, listSection, isDirectEntry: false };
  }

  if (/^\/(?:en\/)?albums\/[^/]+/.test(path)) {
    return { isArtistHubOrigin: false, listSection: 'albums', isDirectEntry: false };
  }

  if (/^\/(?:en\/)?articles\/[^/]+/.test(path)) {
    return { isArtistHubOrigin: false, listSection: 'articles', isDirectEntry: false };
  }

  return { isArtistHubOrigin: false, listSection: null, isDirectEntry: true };
}

export function resolveChildContextNavMode(origin: NavigationOrigin): ContextNavMode {
  return origin.isArtistHubOrigin ? 'artist-only' : 'list-and-artist';
}

/** @deprecated Prefer resolveChildContextNavMode for Album/Article child pages. */
export function resolveContextNavMode(
  origin: NavigationOrigin,
  options: {
    fallbackSection?: NavListSection;
    directEntryMode?: ContextNavMode;
  } = {}
): ContextNavMode {
  const { fallbackSection = 'albums', directEntryMode = 'list-and-artist' } = options;

  if (origin.isArtistHubOrigin) return 'artist-only';
  if (origin.listSection) return 'list-and-artist';
  if (origin.isDirectEntry) return directEntryMode;
  return fallbackSection ? 'list-and-artist' : 'artist-only';
}

export function resolveContextNavListSection(
  origin: NavigationOrigin,
  fallbackSection: NavListSection
): NavListSection {
  return origin.listSection ?? fallbackSection;
}
