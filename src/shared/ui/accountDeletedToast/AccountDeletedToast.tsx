import { useEffect, useState } from 'react';
import { X as XIcon } from 'lucide-react';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { consumeAccountDeletedToast } from '@shared/lib/accountDeletedToast';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import './style.scss';

function SuccessIcon() {
  return (
    <svg
      className="account-deleted-toast__icon-svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M5 10.5L8.5 14L15 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AccountDeletedToast() {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (consumeAccountDeletedToast()) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const en = lang !== 'ru';
  const title =
    ui?.dashboard?.deleteAccountSuccessToast ?? (en ? 'Account deleted' : 'Аккаунт удалён');
  const description =
    ui?.dashboard?.deleteAccountSuccessToastDescription ??
    (en ? 'Account data is no longer available.' : 'Данные аккаунта больше недоступны.');

  return (
    <div className="account-deleted-toast" role="status">
      <div className="account-deleted-toast__icon">
        <SuccessIcon />
      </div>
      <div className="account-deleted-toast__body">
        <p className="account-deleted-toast__title">{title}</p>
        <p className="account-deleted-toast__description">{description}</p>
      </div>
      <button
        type="button"
        className="account-deleted-toast__close"
        onClick={() => setVisible(false)}
        aria-label={ui?.dashboard?.close ?? 'Close'}
      >
        <XIcon {...dashboardActionIconProps({ size: 18 })} />
      </button>
    </div>
  );
}
