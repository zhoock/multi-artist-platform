import { useMemo } from 'react';
import { CreditCard } from 'lucide-react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  formatPlanArtistLimitParts,
  getPlanDisplayName,
  getPlanPriceCurrencyDisplay,
  getPlanPriceDisplayAmount,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { SubscriptionCheckoutAutopaymentDisclosure } from '@shared/lib/archiveAccessModal/SubscriptionCheckoutAutopaymentDisclosure';
import { isSubscriptionAutoRenewClientEnabled } from '@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled';

import {
  BillingModalDateHighlight,
  BillingModalInfoCard,
  BillingModalInfoText,
  BillingModalIntro,
  BillingModalShell,
} from './BillingModalShell';

export type SubscriptionCheckoutConfirmModalProps = {
  isOpen: boolean;
  planSlug: SubscriptionPlanSlug;
  mode: 'subscribe' | 'renew';
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SubscriptionCheckoutConfirmModal({
  isOpen,
  planSlug,
  mode,
  loading = false,
  onCancel,
  onConfirm,
}: SubscriptionCheckoutConfirmModalProps) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const t = ui?.titles;

  const planName = getPlanDisplayName(planSlug);
  const priceAmount = getPlanPriceDisplayAmount(planSlug);
  const priceCurrency = getPlanPriceCurrencyDisplay();
  const artistLimit = formatPlanArtistLimitParts(planSlug, lang);

  const copy = useMemo(
    () => ({
      subscribeTitleTemplate:
        t?.subscriptionCheckoutConfirmSubscribeTitle ??
        (lang === 'en' ? 'Subscribe to {plan}?' : 'Оформить {plan}?'),
      renewTitleTemplate:
        t?.subscriptionCheckoutConfirmRenewTitle ??
        (lang === 'en' ? 'Renew {plan}?' : 'Возобновить {plan}?'),
      intro:
        t?.subscriptionCheckoutConfirmIntro ??
        (lang === 'en'
          ? 'You will be redirected to YooKassa to complete payment.'
          : 'Вы будете перенаправлены на YooKassa для оплаты.'),
      chargeTitle:
        t?.subscriptionCheckoutConfirmChargeTitle ??
        (lang === 'en' ? 'Due today' : 'К оплате сегодня'),
      chargeLineTemplate:
        t?.subscriptionCheckoutConfirmChargeLine ??
        (lang === 'en' ? '{price} {currency} — {plan} plan' : '{price} {currency} — тариф {plan}'),
      slotsBodyTemplate:
        t?.subscriptionCheckoutConfirmSlotsBody ??
        (lang === 'en'
          ? 'Up to {count} artists in your collection.'
          : 'До {count} артистов в коллекции.'),
      confirm:
        t?.subscriptionCheckoutConfirmProceed ??
        (lang === 'en' ? 'Proceed to payment' : 'Перейти к оплате'),
      cancel: ui?.buttons?.cancel ?? (lang === 'en' ? 'Cancel' : 'Отмена'),
      close: ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть'),
    }),
    [lang, t, ui?.buttons?.articleLockedDialogClose, ui?.buttons?.cancel]
  );

  const titleTemplate = mode === 'renew' ? copy.renewTitleTemplate : copy.subscribeTitleTemplate;
  const title = titleTemplate.replace('{plan}', planName);
  const chargeLine = copy.chargeLineTemplate
    .replace('{price}', priceAmount)
    .replace('{currency}', priceCurrency)
    .replace('{plan}', planName);
  const slotsBody = copy.slotsBodyTemplate.replace('{count}', artistLimit.count);
  const showCheckoutAutopaymentDisclosure = isSubscriptionAutoRenewClientEnabled();

  return (
    <BillingModalShell
      isOpen={isOpen}
      titleId="subscription-checkout-confirm-title"
      headerIcon={CreditCard}
      title={title}
      closeLabel={copy.close}
      loading={loading}
      onClose={onCancel}
      cancelLabel={copy.cancel}
      confirmLabel={copy.confirm}
      onConfirm={onConfirm}
    >
      <BillingModalIntro>{copy.intro}</BillingModalIntro>

      <BillingModalInfoCard icon={CreditCard} title={copy.chargeTitle}>
        <BillingModalInfoText>
          <BillingModalDateHighlight>{chargeLine}</BillingModalDateHighlight>
        </BillingModalInfoText>
        <BillingModalInfoText>{slotsBody}</BillingModalInfoText>
      </BillingModalInfoCard>

      {showCheckoutAutopaymentDisclosure ? (
        <SubscriptionCheckoutAutopaymentDisclosure
          planSlug={planSlug}
          lang={lang}
          ui={ui}
          className="billing-modal__checkout-autopayment"
        />
      ) : null}
    </BillingModalShell>
  );
}
