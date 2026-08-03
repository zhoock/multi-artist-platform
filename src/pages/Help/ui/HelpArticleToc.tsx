import type { HelpArticleNavItem } from '@entities/help/lib/buildHelpArticleNavigation';

import { useLang } from '@app/providers/lang';

type HelpArticleTocProps = {
  items: HelpArticleNavItem[];
  activeSectionIndex?: number;
  onNavigate: (sectionIndex: number) => void;
  className?: string;
};

export function HelpArticleToc({
  items,
  activeSectionIndex = -1,
  onNavigate,
  className,
}: HelpArticleTocProps) {
  const { lang } = useLang();

  if (items.length === 0) {
    return null;
  }

  const label = lang === 'en' ? 'In this article' : 'В этой статье';

  return (
    <nav className={['help-center__toc', className].filter(Boolean).join(' ')} aria-label={label}>
      <h2 className="help-center__toc-title">{label}</h2>
      <ol className="help-center__toc-list">
        {items.map((item, index) => {
          const isActive = index === activeSectionIndex;

          return (
            <li
              key={`${item.text}-${index}`}
              className={`help-center__toc-item help-center__toc-item--level-${item.level}`}
            >
              <button
                type="button"
                className={[
                  'help-center__toc-link',
                  isActive ? 'help-center__toc-link--active' : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-current={isActive ? 'location' : undefined}
                onClick={() => onNavigate(index)}
              >
                {item.text}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
