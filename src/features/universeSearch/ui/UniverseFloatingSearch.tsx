import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Search as SearchIcon, X as XIcon } from 'lucide-react';
import type { SceneArtist } from '@components/view/Universe3D';
import { useLang } from '@app/providers/lang';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import {
  filterArtistsForSearch,
  matchedSlugsFromQuery,
  UNIVERSE_SEARCH_SUGGESTION_LIMIT,
} from '../lib/filterArtists';
import { UNIVERSE_SCENE_OVERLAY_ATTR } from '@shared/lib/universeSceneOverlay';
import './UniverseFloatingSearch.scss';

type UniverseFloatingSearchProps = {
  artists: SceneArtist[];
  onSearchMatchesChange: (matchedSlugs: string[] | null) => void;
  /** In-scene cinematic navigation (fly-to + card), not profile redirect. */
  onNavigateToArtist: (publicSlug: string) => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function genreSubtitle(artist: SceneArtist, lang: 'ru' | 'en'): string {
  return artist.genreLabel?.[lang] ?? artist.genreCode;
}

export function UniverseFloatingSearch({
  artists,
  onSearchMatchesChange,
  onNavigateToArtist,
}: UniverseFloatingSearchProps) {
  const { lang } = useLang();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;

  const suggestions = useMemo(
    () => filterArtistsForSearch(artists, query, lang).slice(0, UNIVERSE_SEARCH_SUGGESTION_LIMIT),
    [artists, query, lang]
  );

  useEffect(() => {
    if (!hasQuery) {
      onSearchMatchesChange(null);
      return;
    }
    onSearchMatchesChange(matchedSlugsFromQuery(artists, query, lang));
  }, [artists, hasQuery, lang, onSearchMatchesChange, query]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [trimmedQuery]);

  const collapse = useCallback(() => {
    setExpanded(false);
    setActiveIndex(-1);
    inputRef.current?.blur();
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setActiveIndex(-1);
    onSearchMatchesChange(null);
    inputRef.current?.focus();
  }, [onSearchMatchesChange]);

  const selectArtist = useCallback(
    (slug: string) => {
      setQuery('');
      setActiveIndex(-1);
      onSearchMatchesChange(null);
      collapse();
      onNavigateToArtist(slug);
    },
    [collapse, onSearchMatchesChange, onNavigateToArtist]
  );

  const focusSearch = useCallback(() => {
    setExpanded(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        focusSearch();
        return;
      }

      if (event.key === '/' && !isEditableTarget(event.target)) {
        event.preventDefault();
        focusSearch();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusSearch]);

  useEffect(() => {
    if (!expanded) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) {
        if (!hasQuery) collapse();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [collapse, expanded, hasQuery]);

  const showDropdown = expanded && hasQuery && suggestions.length > 0;

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (hasQuery) {
        clearSearch();
      } else {
        collapse();
      }
      return;
    }

    if (!showDropdown || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      return;
    }

    if (event.key === 'Enter' && activeIndex >= 0 && activeIndex < suggestions.length) {
      event.preventDefault();
      selectArtist(suggestions[activeIndex]!.publicSlug);
    }
  };

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  return (
    <div className="universe-search" role="search" {...{ [UNIVERSE_SCENE_OVERLAY_ATTR]: '' }}>
      <div
        ref={shellRef}
        className={['universe-search__shell', expanded ? 'universe-search__shell--expanded' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div
          className="universe-search__field"
          onClick={!expanded ? focusSearch : undefined}
          onKeyDown={
            !expanded
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    focusSearch();
                  }
                }
              : undefined
          }
          role={!expanded ? 'button' : undefined}
          tabIndex={!expanded ? 0 : undefined}
          aria-label={!expanded ? 'Search artists' : undefined}
        >
          <SearchIcon
            {...dashboardActionIconProps({
              size: 16,
              className: 'universe-search__icon',
            })}
          />

          {!expanded ? (
            <span className="universe-search__collapsed-label" aria-hidden>
              Search
            </span>
          ) : (
            <input
              ref={inputRef}
              id={listId}
              className="universe-search__input"
              type="text"
              value={query}
              placeholder="Search artists..."
              autoComplete="off"
              spellCheck={false}
              aria-autocomplete="list"
              aria-controls={`${listId}-list`}
              aria-expanded={showDropdown}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              onBlur={() => {
                if (!hasQuery) setExpanded(false);
              }}
            />
          )}

          {expanded && !hasQuery ? (
            <kbd className="universe-search__kbd">{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
          ) : null}

          {hasQuery ? (
            <button
              type="button"
              className="universe-search__clear"
              aria-label="Clear search"
              onClick={clearSearch}
            >
              <XIcon {...dashboardActionIconProps({ size: 14 })} />
            </button>
          ) : null}
        </div>

        {showDropdown ? (
          <ul
            id={`${listId}-list`}
            className="universe-search__dropdown universe-search__dropdown--open"
            role="listbox"
          >
            {suggestions.map((artist, index) => {
              const subtitle = genreSubtitle(artist, lang);
              const initial = artist.name.trim().charAt(0).toUpperCase() || '?';
              const cover = artist.headerImages?.[0];

              return (
                <li
                  key={artist.publicSlug}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={[
                    'universe-search__option',
                    index === activeIndex ? 'universe-search__option--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectArtist(artist.publicSlug)}
                >
                  {cover ? (
                    <img className="universe-search__avatar" src={cover} alt="" loading="lazy" />
                  ) : (
                    <span className="universe-search__avatar-fallback" aria-hidden>
                      {initial}
                    </span>
                  )}
                  <div className="universe-search__meta">
                    <div className="universe-search__name">{artist.name}</div>
                    {subtitle ? <div className="universe-search__sub">{subtitle}</div> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
