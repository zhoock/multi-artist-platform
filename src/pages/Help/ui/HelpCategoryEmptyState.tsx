import clsx from 'clsx';

import { useLang } from '@app/providers/lang';
import { getHelpCategoryEmptyCopy } from '@shared/lib/i18n/getHelpCategoryEmptyCopy';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { EmptyState } from '@shared/ui/emptyState';

type HelpCategoryEmptyStateProps = {
  className?: string;
};

/** Empty category page — category header stays visible; this fills the article list area. */
export function HelpCategoryEmptyState({ className }: HelpCategoryEmptyStateProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = getHelpCategoryEmptyCopy(ui, lang);

  return (
    <EmptyState
      layout="inline"
      className={clsx('help-center__category-empty', className)}
      title={copy.title}
      description={copy.description}
      actionsVariant="plain"
    />
  );
}
