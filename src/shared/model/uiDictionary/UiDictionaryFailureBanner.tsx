import { TriangleAlert as TriangleAlertIcon } from 'lucide-react';

import { useLang } from '@app/providers/lang';
import { useAppDispatch } from '@shared/lib/hooks/useAppDispatch';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { DashboardButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

import { selectUiDictionaryStatus } from './selectors';
import { fetchUiDictionary } from './uiDictionarySlice';
import './UiDictionaryFailureBanner.scss';

const COPY = {
  en: {
    message: 'Some interface content could not be loaded.',
    retry: 'Retry',
  },
  ru: {
    message: 'Не удалось загрузить часть интерфейса.',
    retry: 'Повторить',
  },
} as const;

export function UiDictionaryFailureBanner() {
  const { lang } = useLang();
  const dispatch = useAppDispatch();
  const status = useAppSelector((state) => selectUiDictionaryStatus(state, lang));

  if (status !== 'failed') {
    return null;
  }

  const copy = COPY[lang];

  return (
    <div className="ui-dictionary-failure-banner" role="alert" aria-live="polite">
      <div className="ui-dictionary-failure-banner__inner">
        <span className="ui-dictionary-failure-banner__icon" aria-hidden="true">
          <TriangleAlertIcon {...dashboardActionIconProps({ size: 20, strokeWidth: 1.75 })} />
        </span>
        <p className="ui-dictionary-failure-banner__message">{copy.message}</p>
        <DashboardButton
          type="button"
          variant="outline"
          className="ui-dictionary-failure-banner__retry"
          onClick={() => {
            void dispatch(fetchUiDictionary({ lang }));
          }}
        >
          {copy.retry}
        </DashboardButton>
      </div>
    </div>
  );
}
