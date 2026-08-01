import { useEffect } from 'react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';

import { toast } from './toastApi';
import { setPendingPurchaseSuccessReturnPath } from './pendingPurchaseSuccessToast';
import { consumeNavigationToastIntent } from './toastNavigationPersistence';

export function useHydrateNavigationToasts(): void {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  useEffect(() => {
    const intent = consumeNavigationToastIntent();
    if (!intent) {
      return;
    }

    if (intent.kind === 'purchase-success') {
      setPendingPurchaseSuccessReturnPath(intent.returnPath);
      return;
    }

    const en = lang !== 'ru';
    toast.show({
      variant: 'success',
      title:
        ui?.dashboard?.deleteAccountSuccessToast ?? (en ? 'Account deleted' : 'Аккаунт удалён'),
      description:
        ui?.dashboard?.deleteAccountSuccessToastDescription ??
        (en ? 'Account data is no longer available.' : 'Данные аккаунта больше недоступны.'),
      placement: 'bottom-center',
      duration: null,
      dismissible: true,
    });
  }, [lang, ui]);
}

export function NavigationToastHydrator() {
  useHydrateNavigationToasts();
  return null;
}
