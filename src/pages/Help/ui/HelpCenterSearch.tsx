import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Search as SearchIcon, X as XIcon } from 'lucide-react';
import clsx from 'clsx';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

import './HelpCenterSearch.scss';

type HelpCenterSearchProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function HelpCenterSearch({ value, onChange, className }: HelpCenterSearchProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const inputRef = useRef<HTMLInputElement>(null);
  const searchCopy = ui?.search;

  const placeholder =
    searchCopy?.helpPlaceholder ??
    (lang === 'ru' ? 'Поиск по справочному центру...' : 'Search the help center...');
  const clearLabel = searchCopy?.clearSearch ?? (lang === 'ru' ? 'Очистить поиск' : 'Clear search');

  const trimmedValue = value.trim();
  const hasQuery = trimmedValue.length > 0;

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && hasQuery) {
      event.preventDefault();
      onChange('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className={clsx('help-center-search', className)} role="search">
      <div className="help-center-search__field">
        <SearchIcon
          {...dashboardActionIconProps({
            size: 18,
            className: 'help-center-search__icon',
          })}
        />
        <input
          ref={inputRef}
          className="help-center-search__input"
          type="search"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {hasQuery ? (
          <button
            type="button"
            className="help-center-search__clear"
            aria-label={clearLabel}
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
          >
            <XIcon {...dashboardActionIconProps({ size: 14 })} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
