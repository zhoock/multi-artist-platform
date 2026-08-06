import { useMemo } from 'react';
import { ArrowUpCircle, Calendar, CreditCard } from 'lucide-react';

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

import {
  BillingModalDateHighlight,
  BillingModalInfoCard,
  BillingModalInfoText,
  BillingModalIntro,
  BillingModalNote,
  BillingModalShell,
} from './BillingModalShell';

export type UpgradePlanConfirmModalProps = {
  isOpen: boolean;
  currentPlanSlug: SubscriptionPlanSlug;
  targetPlanSlug: SubscriptionPlanSlug;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function UpgradePlanConfirmModal({
  isOpen,
  currentPlanSlug,
  targetPlanSlug,
  loading = false,
  onCancel,
  onConfirm,
}: UpgradePlanConfirmModalProps) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const t = ui?.dashboard?.collection;

  const targetPlanName = getPlanDisplayName(targetPlanSlug);
  const currentPlanName = getPlanDisplayName(currentPlanSlug);
  const priceAmount = getPlanPriceDisplayAmount(targetPlanSlug);
  const priceCurrency = getPlanPriceCurrencyDisplay();
  const artistLimit = formatPlanArtistLimitParts(targetPlanSlug, lang);

  const copy = useMemo(
    () => ({
      titleTemplate:
        t?.billingUpgradePlanTitle ??
        (lang === 'en' ? 'Upgrade to {plan}?' : 'Повысить до {plan}?'),
      intro:
        t?.billingUpgradePlanIntro ??
        (lang === 'en'
          ? 'You will pay the full price of the new plan. A new support period starts immediately after payment. Remaining time on your current plan is not carried over.'
          : 'Вы оплатите полную стоимость нового тарифа. Новый период поддержки начнётся сразу после оплаты. Оставшееся время текущего периода не переносится.'),
      chargeTitle:
        t?.billingUpgradePlanChargeTitle ?? (lang === 'en' ? 'Due today' : 'К оплате сегодня'),
      chargeLineTemplate:
        t?.billingUpgradePlanChargeLine ??
        (lang === 'en'
          ? '{price} {currency} — full plan price'
          : '{price} {currency} — полная стоимость тарифа'),
      periodTitle:
        t?.billingUpgradePlanPeriodTitle ??
        (lang === 'en' ? 'New support period' : 'Новый период поддержки'),
      periodBody:
        t?.billingUpgradePlanPeriodBody ??
        (lang === 'en'
          ? '30 days from the moment of successful payment.'
          : '30 дней с момента успешной оплаты.'),
      slotsTitle:
        t?.billingUpgradePlanSlotsTitle ?? (lang === 'en' ? 'Collection limit' : 'Лимит коллекции'),
      slotsBodyTemplate:
        t?.billingUpgradePlanSlotsBody ??
        (lang === 'en'
          ? 'Up to {count} artists — available immediately after payment.'
          : 'До {count} артистов — доступно сразу после оплаты.'),
      fromPlanLabel:
        t?.billingUpgradePlanFromLabel ?? (lang === 'en' ? 'Current plan' : 'Текущий тариф'),
      toPlanLabel: t?.billingUpgradePlanToLabel ?? (lang === 'en' ? 'New plan' : 'Новый тариф'),
      note:
        t?.billingUpgradePlanNote ??
        (lang === 'en'
          ? 'Your supported artists stay in the collection. No artists are removed when upgrading.'
          : 'Поддерживаемые артисты остаются в коллекции. При повышении тарифа артисты не удаляются.'),
      confirm:
        t?.billingUpgradePlanConfirm ?? (lang === 'en' ? 'Proceed to payment' : 'Перейти к оплате'),
      footerNote:
        t?.billingUpgradePlanRedirectNote ??
        (lang === 'en'
          ? 'You will be redirected to a secure payment page'
          : 'Вы будете перенаправлены на безопасную страницу оплаты'),
      cancel: ui?.buttons?.cancel ?? (lang === 'en' ? 'Cancel' : 'Отмена'),
      close: ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть'),
    }),
    [lang, t, ui?.buttons?.articleLockedDialogClose, ui?.buttons?.cancel]
  );

  const title = copy.titleTemplate.replace('{plan}', targetPlanName);
  const chargeLine = copy.chargeLineTemplate
    .replace('{price}', priceAmount)
    .replace('{currency}', priceCurrency);
  const slotsBody = copy.slotsBodyTemplate.replace('{count}', artistLimit.count);

  return (
    <BillingModalShell
      isOpen={isOpen}
      titleId="billing-upgrade-plan-title"
      headerIcon={ArrowUpCircle}
      title={title}
      closeLabel={copy.close}
      loading={loading}
      onClose={onCancel}
      footerNote={copy.footerNote}
      cancelLabel={copy.cancel}
      confirmLabel={copy.confirm}
      onConfirm={onConfirm}
    >
      <BillingModalIntro>{copy.intro}</BillingModalIntro>

      <BillingModalInfoCard icon={CreditCard} title={copy.chargeTitle}>
        <BillingModalInfoText>
          <BillingModalDateHighlight>{chargeLine}</BillingModalDateHighlight>
        </BillingModalInfoText>
        <BillingModalInfoText>
          {copy.fromPlanLabel}: {currentPlanName} → {copy.toPlanLabel}: {targetPlanName}
        </BillingModalInfoText>
      </BillingModalInfoCard>

      <BillingModalInfoCard icon={Calendar} title={copy.periodTitle}>
        <BillingModalInfoText>{copy.periodBody}</BillingModalInfoText>
      </BillingModalInfoCard>

      <BillingModalInfoCard
        icon={ArrowUpCircle}
        title={copy.slotsTitle}
        variant="neutral"
        mutedIcon
      >
        <BillingModalInfoText>{slotsBody}</BillingModalInfoText>
      </BillingModalInfoCard>

      <BillingModalNote>{copy.note}</BillingModalNote>
    </BillingModalShell>
  );
}
