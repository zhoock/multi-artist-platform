import { useMemo } from 'react';
import { Calendar, CreditCard, RefreshCw } from 'lucide-react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  getPlanPriceCurrencyDisplay,
  getPlanPriceDisplayAmount,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { formatRenewalChargeDateTime } from '@shared/lib/subscription/renewalCountdown';

import {
  BillingModalDateHighlight,
  BillingModalInfoCard,
  BillingModalInfoText,
  BillingModalIntro,
  BillingModalLinkButton,
  BillingModalNote,
  BillingModalShell,
} from './BillingModalShell';

export type EnableAutoRenewConfirmModalProps = {
  isOpen: boolean;
  planSlug: SubscriptionPlanSlug | null;
  chargeDateLabel: string | null;
  /** Used for absolute-date tooltip on the charge line. */
  nextChargeAt?: string | null;
  paymentMethodTitle: string | null;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onChangePaymentMethod: () => void;
};

export function EnableAutoRenewConfirmModal({
  isOpen,
  planSlug,
  chargeDateLabel,
  nextChargeAt,
  paymentMethodTitle,
  loading = false,
  onCancel,
  onConfirm,
  onChangePaymentMethod,
}: EnableAutoRenewConfirmModalProps) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const t = ui?.dashboard?.collection;

  const copy = useMemo(
    () => ({
      title: t?.billingEnableAutoRenewTitle ?? 'Возобновить автопродление?',
      intro:
        t?.billingEnableAutoRenewIntro ??
        'Подписка будет автоматически продлеваться по окончании текущего периода, и ваша поддержка не прервётся.',
      nextChargeTitle: t?.billingEnableAutoRenewNextChargeTitle ?? 'Следующее списание',
      nextChargePriceLine:
        t?.billingEnableAutoRenewNextChargePriceLine ??
        'При продлении будет списано {price} {currency}.',
      nextChargeDateLine: t?.billingEnableAutoRenewNextChargeDateLine ?? 'Ориентировочно {date}.',
      paymentTitle: t?.billingEnableAutoRenewPaymentTitle ?? 'Способ оплаты',
      paymentEmptyTitle: t?.billingRebindPaymentEmptyTitle ?? 'Способ оплаты не добавлен',
      paymentEmptyBody:
        t?.billingRebindPaymentEmptyBody ??
        'Добавьте новую карту или выберите другой доступный способ оплаты.',
      changePayment: t?.billingEnableAutoRenewChangePayment ?? 'Изменить способ оплаты',
      cancelNote:
        t?.billingEnableAutoRenewCancelNote ??
        'Вы можете отменить автопродление в любой момент. Доступ сохранится до конца оплаченного периода.',
      confirm: t?.billingEnableAutoRenewConfirm ?? 'Возобновить автопродление',
      footerNote: t?.billingModalImmediateEffect ?? 'Изменения вступят в силу немедленно',
      cancel: ui?.buttons?.cancel ?? (lang === 'en' ? 'Cancel' : 'Отмена'),
      close: ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть'),
    }),
    [lang, t, ui?.buttons?.articleLockedDialogClose, ui?.buttons?.cancel]
  );

  const priceAmount = planSlug ? getPlanPriceDisplayAmount(planSlug) : '—';
  const priceCurrency = getPlanPriceCurrencyDisplay();
  const chargeDate = chargeDateLabel ?? '—';
  const chargeDateTooltip = nextChargeAt ? formatRenewalChargeDateTime(nextChargeAt, lang) : null;
  const hasPaymentMethod = Boolean(paymentMethodTitle?.trim());

  const priceLineParts = copy.nextChargePriceLine.split('{price}');
  const priceLineAfterPrice = (priceLineParts[1] ?? '').split('{currency}');

  return (
    <BillingModalShell
      isOpen={isOpen}
      titleId="billing-enable-autorenew-title"
      headerIcon={RefreshCw}
      title={copy.title}
      closeLabel={copy.close}
      loading={loading}
      onClose={onCancel}
      footerNote={copy.footerNote}
      cancelLabel={copy.cancel}
      confirmLabel={copy.confirm}
      onConfirm={onConfirm}
    >
      <BillingModalIntro>{copy.intro}</BillingModalIntro>

      <BillingModalInfoCard icon={Calendar} title={copy.nextChargeTitle}>
        <BillingModalInfoText>
          {priceLineParts[0]}
          <BillingModalDateHighlight>
            {priceAmount} {priceCurrency}
          </BillingModalDateHighlight>
          {priceLineAfterPrice[1] ?? ''}
        </BillingModalInfoText>
        <BillingModalInfoText>
          {copy.nextChargeDateLine.split('{date}')[0]}
          <BillingModalDateHighlight title={chargeDateTooltip ?? undefined}>
            {chargeDate}
          </BillingModalDateHighlight>
          {copy.nextChargeDateLine.split('{date}')[1] ?? ''}
        </BillingModalInfoText>
      </BillingModalInfoCard>

      <BillingModalInfoCard icon={CreditCard} title={copy.paymentTitle} variant="neutral" mutedIcon>
        {hasPaymentMethod ? (
          <>
            <BillingModalInfoText>{paymentMethodTitle}</BillingModalInfoText>
            <BillingModalLinkButton disabled={loading} onClick={onChangePaymentMethod}>
              {copy.changePayment}
            </BillingModalLinkButton>
          </>
        ) : (
          <>
            <p className="billing-modal__info-title">{copy.paymentEmptyTitle}</p>
            <BillingModalInfoText>{copy.paymentEmptyBody}</BillingModalInfoText>
          </>
        )}
      </BillingModalInfoCard>

      <BillingModalNote>{copy.cancelNote}</BillingModalNote>
    </BillingModalShell>
  );
}
