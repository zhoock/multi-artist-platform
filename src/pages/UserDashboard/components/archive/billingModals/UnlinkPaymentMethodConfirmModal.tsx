import { useMemo } from 'react';
import { Calendar, CreditCard } from 'lucide-react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { useRenewalCountdown } from '@shared/lib/subscription/useRenewalCountdown';

import {
  BillingModalDateHighlight,
  BillingModalInfoCard,
  BillingModalInfoText,
  BillingModalIntro,
  BillingModalNote,
  BillingModalShell,
} from './BillingModalShell';

export type UnlinkPaymentMethodConfirmModalProps = {
  isOpen: boolean;
  paymentMethodTitle: string | null;
  expiresAt?: string | null;
  /** When true, show note that auto-renew will be disabled (ACTIVE subscription). */
  showAutoRenewDisableNote?: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function UnlinkPaymentMethodConfirmModal({
  isOpen,
  paymentMethodTitle,
  expiresAt,
  showAutoRenewDisableNote = false,
  loading = false,
  errorMessage = null,
  onCancel,
  onConfirm,
}: UnlinkPaymentMethodConfirmModalProps) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const t = ui?.dashboard?.collection;
  const accessCountdown = useRenewalCountdown(null, expiresAt, lang);

  const copy = useMemo(
    () => ({
      title: t?.billingUnlinkPaymentTitle ?? 'Отвязать карту?',
      intro:
        t?.billingUnlinkPaymentIntro ??
        'Сохранённая карта будет удалена из вашего аккаунта. Мы перестанем хранить её для автоплатежей.',
      cardTitle: t?.billingUnlinkPaymentCardTitle ?? 'Привязанная карта',
      accessTitle: t?.billingUnlinkPaymentAccessTitle ?? 'Доступ сохранится до конца периода',
      accessBodyAbsolute:
        t?.billingUnlinkPaymentAccessBodyAbsolute ?? 'Доступ сохранится до {date}',
      autoRenewNote:
        t?.billingUnlinkPaymentAutoRenewNote ??
        'Автопродление будет отключено. Новые списания выполняться не будут.',
      confirm: t?.billingUnlinkPaymentConfirm ?? 'Отвязать карту',
      cancel: ui?.buttons?.cancel ?? (lang === 'en' ? 'Cancel' : 'Отмена'),
      close: ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть'),
    }),
    [lang, t, ui?.buttons?.articleLockedDialogClose, ui?.buttons?.cancel]
  );

  const accessDateLabel = accessCountdown.label ?? '—';

  return (
    <BillingModalShell
      isOpen={isOpen}
      titleId="billing-unlink-payment-title"
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

      {paymentMethodTitle?.trim() ? (
        <BillingModalInfoCard icon={CreditCard} title={copy.cardTitle} variant="neutral" mutedIcon>
          <BillingModalInfoText>{paymentMethodTitle}</BillingModalInfoText>
        </BillingModalInfoCard>
      ) : null}

      <BillingModalInfoCard icon={Calendar} title={copy.accessTitle}>
        <BillingModalInfoText title={accessCountdown.title ?? undefined}>
          {copy.accessBodyAbsolute.split('{date}')[0]}
          <BillingModalDateHighlight>{accessDateLabel}</BillingModalDateHighlight>
          {copy.accessBodyAbsolute.split('{date}')[1] ?? ''}
        </BillingModalInfoText>
      </BillingModalInfoCard>

      {showAutoRenewDisableNote ? <BillingModalNote>{copy.autoRenewNote}</BillingModalNote> : null}

      {errorMessage ? (
        <p className="billing-modal__inline-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </BillingModalShell>
  );
}
