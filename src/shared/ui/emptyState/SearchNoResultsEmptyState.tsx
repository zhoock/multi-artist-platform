import clsx from 'clsx';

import { useLang } from '@app/providers/lang';
import { getSearchNoResultsCopy } from '@shared/lib/i18n/getSearchNoResultsCopy';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';

import { EmptyState } from './EmptyState';

type SearchNoResultsEmptyStateProps = {
  className?: string;
  /** `panel` — compact dropdown; `content` — main content area (Help). */
  variant?: 'panel' | 'content';
};

/** Minimal "nothing found" preset for search surfaces — uses shared EmptyState + i18n copy. */
export function SearchNoResultsEmptyState({
  className,
  variant = 'panel',
}: SearchNoResultsEmptyStateProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = getSearchNoResultsCopy(ui, lang);

  return (
    <EmptyState
      layout="inline"
      className={clsx(
        'empty-state--search-no-results',
        variant === 'content' && 'empty-state--search-no-results-content',
        className
      )}
      title={copy.title}
      description={copy.description}
      actionsVariant="plain"
    />
  );
}
