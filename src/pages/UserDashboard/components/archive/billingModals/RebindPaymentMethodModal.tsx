import { useMemo } from 'react';
import { CreditCard, Lock } from 'lucide-react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';

import {
  BillingModalInfoCard,
  BillingModalInfoText,
  BillingModalIntro,
  BillingModalShell,
} from './BillingModalShell';

export type RebindPaymentMethodModalProps = {
  isOpen: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RebindPaymentMethodModal({
  isOpen,
  loading = false,
  onCancel,
  onConfirm,
}: RebindPaymentMethodModalProps) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const t = ui?.dashboard?.collection;

  const copy = useMemo(
    () => ({
      title: t?.billingRebindPaymentTitle ?? 'Обновить способ оплаты',
      intro:
        t?.billingRebindPaymentIntro ??
        'Чтобы возобновить автопродление, добавьте или обновите способ оплаты для вашей подписки.',
      emptyTitle: t?.billingRebindPaymentEmptyTitle ?? 'Способ оплаты не добавлен',
      emptyBody:
        t?.billingRebindPaymentEmptyBody ??
        'Добавьте банковскую карту, чтобы возобновить автопродление.',
      secureTitle: t?.billingRebindPaymentSecureTitle ?? 'Безопасные платежи',
      secureBody:
        t?.billingRebindPaymentSecureBody ??
        'Ваши данные защищены. Мы не храним реквизиты карты и используем безопасное соединение.',
      confirm: t?.billingRebindPaymentConfirm ?? 'Добавить способ оплаты',
      cancel: ui?.buttons?.cancel ?? (lang === 'en' ? 'Cancel' : 'Отмена'),
      close: ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть'),
    }),
    [lang, t, ui?.buttons?.articleLockedDialogClose, ui?.buttons?.cancel]
  );

  return (
    <BillingModalShell
      isOpen={isOpen}
      titleId="billing-rebind-payment-title"
      headerIcon={CreditCard}
      title={copy.title}
      closeLabel={copy.close}
      loading={loading}
      onClose={onCancel}
      cancelLabel={copy.cancel}
      confirmLabel={copy.confirm}
      onConfirm={onConfirm}
    >
      <BillingModalIntro>{copy.intro}</BillingModalIntro>

      <BillingModalInfoCard icon={CreditCard} title={copy.emptyTitle} variant="neutral" mutedIcon>
        <BillingModalInfoText>{copy.emptyBody}</BillingModalInfoText>
      </BillingModalInfoCard>

      <BillingModalInfoCard icon={Lock} title={copy.secureTitle} variant="neutral" mutedIcon>
        <BillingModalInfoText>{copy.secureBody}</BillingModalInfoText>
      </BillingModalInfoCard>
    </BillingModalShell>
  );
}
