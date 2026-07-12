import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  formatPlanArtistLimitParts,
  formatPlanPricePeriod,
  getPlanDisplayName,
  getPlanPriceDisplayAmount,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { DashboardButton } from '@shared/ui/dashboard';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { Popup, PopupCloseButton } from '@shared/ui/popup';

import './SubscriptionPlanChangeConfirmModal.style.scss';

type Props = {
  isOpen: boolean;
  currentPlanSlug: SubscriptionPlanSlug;
  targetPlanSlug: SubscriptionPlanSlug;
  priceCurrency: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SubscriptionPlanChangeConfirmModal({
  isOpen,
  currentPlanSlug,
  targetPlanSlug,
  priceCurrency,
  loading,
  onCancel,
  onConfirm,
}: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));

  const targetPlanName = getPlanDisplayName(targetPlanSlug);
  const titleTemplate =
    ui?.titles?.subscriptionPlanChangeConfirmTitle ??
    (lang === 'en' ? 'Switch to {plan}?' : 'Перейти на {plan}?');
  const title = titleTemplate.replace('{plan}', targetPlanName);
  const messageLines = [
    ui?.titles?.subscriptionPlanChangeConfirmMessage1 ??
      (lang === 'en'
        ? 'After paying for the new plan, your current collection will be reset.'
        : 'После оплаты коллекция будет сброшена.'),
    ui?.titles?.subscriptionPlanChangeConfirmMessage2 ??
      (lang === 'en'
        ? 'All artists will become inactive, and you can rebuild your collection within the new limit.'
        : 'Сразу после оплаты вы сможете выбрать новую коллекцию.'),
    ui?.titles?.subscriptionPlanChangeConfirmMessage3 ??
      (lang === 'en'
        ? 'Your purchases and history will be preserved.'
        : 'Покупки и подписка сохранятся.'),
  ];
  const proceedLabel =
    ui?.buttons?.subscriptionPlanChangeProceed ??
    (lang === 'en' ? 'Proceed to payment' : 'Перейти к оплате');
  const cancelLabel = ui?.buttons?.cancel ?? (lang === 'en' ? 'Cancel' : 'Отмена');
  const closeLabel = ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть');

  const currentPlanName = getPlanDisplayName(currentPlanSlug);
  const artistLimit = formatPlanArtistLimitParts(targetPlanSlug, lang);
  const priceAmount = getPlanPriceDisplayAmount(targetPlanSlug);
  const pricePeriod = formatPlanPricePeriod(targetPlanSlug, lang);

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
            <div className="subscription-plan-change-modal__heading">
              <h2
                id="subscription-plan-change-confirm-title"
                className="subscription-plan-change-modal__title"
              >
                {title}
              </h2>
              <p
                className="subscription-plan-change-modal__transition"
                aria-label={`${currentPlanName} → ${targetPlanName}`}
              >
                <span>{currentPlanName}</span>
                <span aria-hidden>→</span>
                <span className="subscription-plan-change-modal__transition-to">
                  {targetPlanName}
                </span>
              </p>
            </div>
            <PopupCloseButton
              type="button"
              className="subscription-plan-change-modal__close"
              aria-label={closeLabel}
              disabled={loading}
            >
              <ModalCloseIcon />
            </PopupCloseButton>
          </header>

          <div className="subscription-plan-change-modal__section">
            <div className="subscription-plan-change-modal__messages">
              {messageLines.map((line) => (
                <p key={line} className="subscription-plan-change-modal__message">
                  {line}
                </p>
              ))}
            </div>
          </div>

          <div className="subscription-plan-change-modal__section">
            <div className="subscription-plan-change-modal__details">
              <p className="subscription-plan-change-modal__details-name">{targetPlanName}</p>
              <p className="subscription-plan-change-modal__details-limit">
                {artistLimit.prefix} {artistLimit.count} {artistLimit.suffix}
              </p>
              <p className="subscription-plan-change-modal__details-price">
                {priceAmount} {priceCurrency} {pricePeriod}
              </p>
            </div>
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
