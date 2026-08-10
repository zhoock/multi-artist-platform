import { ArrowRight } from 'lucide-react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  formatPlanArtistLimitParts,
  formatPlanPricePeriod,
  getPlanDisplayName,
  getPlanPriceCurrencyDisplay,
  getPlanPriceDisplayAmount,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { SubscriptionCheckoutAutopaymentDisclosure } from '@shared/lib/archiveAccessModal/SubscriptionCheckoutAutopaymentDisclosure';
import { isSubscriptionAutoRenewClientEnabled } from '@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled';
import { DashboardButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { Popup, PopupCloseButton } from '@shared/ui/popup';

import './SubscriptionPlanChangeConfirmModal.style.scss';

type Props = {
  isOpen: boolean;
  currentPlanSlug: SubscriptionPlanSlug;
  targetPlanSlug: SubscriptionPlanSlug;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

type PlanColumnProps = {
  label: string;
  planSlug: SubscriptionPlanSlug;
  lang: 'en' | 'ru';
};

function PlanCompareColumn({ label, planSlug, lang }: PlanColumnProps) {
  const planName = getPlanDisplayName(planSlug);
  const artistLimit = formatPlanArtistLimitParts(planSlug, lang);
  const priceAmount = getPlanPriceDisplayAmount(planSlug);
  const priceCurrency = getPlanPriceCurrencyDisplay();
  const pricePeriod = formatPlanPricePeriod(planSlug, lang);

  return (
    <div className="subscription-plan-change-modal__plan-column">
      <p className="subscription-plan-change-modal__plan-label">{label}</p>
      <p className="subscription-plan-change-modal__plan-name">{planName}</p>
      <p className="subscription-plan-change-modal__plan-meta">
        {artistLimit.prefix} {artistLimit.count} {artistLimit.suffix}
      </p>
      <p className="subscription-plan-change-modal__plan-meta">
        {priceAmount} {priceCurrency} {pricePeriod}
      </p>
    </div>
  );
}

export function SubscriptionPlanChangeConfirmModal({
  isOpen,
  currentPlanSlug,
  targetPlanSlug,
  loading,
  onCancel,
  onConfirm,
}: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const targetPlanName = getPlanDisplayName(targetPlanSlug);
  const titleTemplate =
    ui?.titles?.subscriptionPlanChangeConfirmTitle ??
    (lang === 'en' ? 'Switch to the {plan} plan?' : 'Перейти на тариф {plan}?');
  const title = titleTemplate.replace('{plan}', targetPlanName);
  const messageLines = [
    ui?.titles?.subscriptionPlanChangeConfirmMessage1 ??
      (lang === 'en'
        ? 'After payment, your current collection will become inactive.'
        : 'После оплаты текущая коллекция станет неактивной.'),
    ui?.titles?.subscriptionPlanChangeConfirmMessage2 ??
      (lang === 'en'
        ? 'You can rebuild it within the limits of your new plan.'
        : 'Вы сможете заново собрать её в рамках нового тарифа.'),
    ui?.titles?.subscriptionPlanChangeConfirmMessage3 ??
      (lang === 'en'
        ? 'Your purchases will remain available.'
        : 'Ваши покупки останутся доступными.'),
  ];
  const currentPlanLabel =
    ui?.titles?.subscriptionPlanChangeCurrentPlanLabel ??
    (lang === 'en' ? 'Current plan' : 'Текущий тариф');
  const newPlanLabel =
    ui?.titles?.subscriptionPlanChangeNewPlanLabel ?? (lang === 'en' ? 'New plan' : 'Новый тариф');
  const proceedLabel =
    ui?.buttons?.subscriptionPlanChangeProceed ??
    (lang === 'en' ? 'Proceed to payment' : 'Перейти к оплате');
  const cancelLabel = ui?.buttons?.cancel ?? (lang === 'en' ? 'Cancel' : 'Отмена');
  const closeLabel = ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть');
  const showCheckoutAutopaymentDisclosure = isSubscriptionAutoRenewClientEnabled();

  return (
    <Popup
      isActive={isOpen}
      onClose={onCancel}
      closeBlocked={loading}
      publicBackdrop
      aria-labelledby="subscription-plan-change-confirm-title"
    >
      <div className="subscription-plan-change-modal">
        <div className="subscription-plan-change-modal__card">
          <header className="subscription-plan-change-modal__header">
            <h2
              id="subscription-plan-change-confirm-title"
              className="subscription-plan-change-modal__title"
            >
              {title}
            </h2>
            <PopupCloseButton
              type="button"
              className="subscription-plan-change-modal__close"
              aria-label={closeLabel}
              disabled={loading}
            >
              <ModalCloseIcon />
            </PopupCloseButton>
          </header>

          <div className="subscription-plan-change-modal__body">
            <div className="subscription-plan-change-modal__messages">
              {messageLines.map((line) => (
                <p key={line} className="subscription-plan-change-modal__message">
                  {line}
                </p>
              ))}
            </div>

            <div
              className="subscription-plan-change-modal__compare"
              aria-label={`${currentPlanLabel} → ${newPlanLabel}`}
            >
              <PlanCompareColumn label={currentPlanLabel} planSlug={currentPlanSlug} lang={lang} />
              <span className="subscription-plan-change-modal__compare-arrow" aria-hidden>
                <ArrowRight {...dashboardActionIconProps({ size: 16 })} />
              </span>
              <PlanCompareColumn label={newPlanLabel} planSlug={targetPlanSlug} lang={lang} />
            </div>

            {showCheckoutAutopaymentDisclosure ? (
              <SubscriptionCheckoutAutopaymentDisclosure
                planSlug={targetPlanSlug}
                lang={lang}
                ui={ui}
                className="billing-modal__checkout-autopayment"
              />
            ) : null}
          </div>

          <footer className="dashboard-modal-footer subscription-plan-change-modal__footer">
            <DashboardButton variant="outline" disabled={loading} onClick={onCancel}>
              {cancelLabel}
            </DashboardButton>
            <DashboardButton
              variant="primary"
              loading={loading}
              disabled={loading}
              onClick={onConfirm}
            >
              {proceedLabel}
            </DashboardButton>
          </footer>
        </div>
      </div>
    </Popup>
  );
}
