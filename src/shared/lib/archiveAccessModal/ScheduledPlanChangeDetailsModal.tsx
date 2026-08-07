import { useMemo } from 'react';
import { ArrowDownCircle, Calendar } from 'lucide-react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  formatPlanArtistLimitParts,
  getPlanDisplayName,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { DashboardButton } from '@shared/ui/dashboard';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';
import { ModalCloseIcon } from '@shared/ui/icons/ModalCloseIcon';
import { Popup, PopupCloseButton } from '@shared/ui/popup';

import {
  BillingModalDateHighlight,
  BillingModalInfoCard,
  BillingModalInfoText,
  BillingModalIntro,
  BillingModalNote,
} from '@pages/UserDashboard/components/archive/billingModals/BillingModalShell';

import '@pages/UserDashboard/components/archive/billingModals/billingModals.scss';

type Props = {
  isOpen: boolean;
  currentPlanSlug: SubscriptionPlanSlug;
  targetPlanSlug: SubscriptionPlanSlug;
  effectiveDateLabel: string | null;
  onClose: () => void;
};

export function ScheduledPlanChangeDetailsModal({
  isOpen,
  currentPlanSlug,
  targetPlanSlug,
  effectiveDateLabel,
  onClose,
}: Props) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const t = ui?.dashboard?.collection;

  const targetPlanName = getPlanDisplayName(targetPlanSlug);
  const currentPlanName = getPlanDisplayName(currentPlanSlug);
  const artistLimit = formatPlanArtistLimitParts(targetPlanSlug, lang);
  const effectiveDate = effectiveDateLabel ?? '—';

  const copy = useMemo(
    () => ({
      title:
        ui?.titles?.subscriptionPlanScheduledDetailsTitle ??
        (lang === 'en' ? 'Scheduled plan change' : 'Запланированная смена тарифа'),
      intro:
        t?.billingDowngradePlanIntro ??
        (lang === 'en'
          ? 'Your current plan and collection limit stay the same until the end of the paid period. No charge today.'
          : 'Текущий тариф и лимит коллекции сохраняются до конца оплаченного периода. Сегодня списания не будет.'),
      effectiveTitle:
        t?.billingDowngradePlanEffectiveTitle ??
        (lang === 'en' ? 'Effective from' : 'Вступит в силу'),
      effectiveBodyTemplate:
        t?.billingDowngradePlanEffectiveBody ??
        (lang === 'en'
          ? 'Starting {date} your plan will change to {plan}.'
          : 'С {date} ваш тариф изменится на {plan}.'),
      keepTitle:
        t?.billingDowngradePlanKeepTitle ?? (lang === 'en' ? 'Until then' : 'До этой даты'),
      keepBodyTemplate:
        t?.billingDowngradePlanKeepBody ??
        (lang === 'en'
          ? 'You keep {plan} with your current collection limit.'
          : 'Вы сохраняете {plan} с текущим лимитом коллекции.'),
      slotsTitle:
        t?.billingDowngradePlanSlotsTitle ??
        (lang === 'en' ? 'New collection limit' : 'Новый лимит коллекции'),
      slotsBodyTemplate:
        t?.billingDowngradePlanSlotsBody ??
        (lang === 'en'
          ? 'Up to {count} artists from the next period.'
          : 'До {count} артистов — со следующего периода.'),
      note:
        t?.billingDowngradePlanNote ??
        (lang === 'en'
          ? 'If you have more active artists than the new limit allows, you will need to deactivate extras before the next renewal.'
          : 'Если активных артистов больше, чем позволяет новый лимит, перед следующим продлением нужно будет деактивировать лишних.'),
      close: ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть'),
    }),
    [
      lang,
      t,
      ui?.buttons?.articleLockedDialogClose,
      ui?.titles?.subscriptionPlanScheduledDetailsTitle,
    ]
  );

  const effectiveBody = copy.effectiveBodyTemplate
    .replace('{date}', effectiveDate)
    .replace('{plan}', targetPlanName);
  const keepBody = copy.keepBodyTemplate.replace('{plan}', currentPlanName);
  const slotsBody = copy.slotsBodyTemplate.replace('{count}', artistLimit.count);

  return (
    <Popup
      isActive={isOpen}
      onClose={onClose}
      publicBackdrop
      aria-labelledby="scheduled-plan-change-details-title"
    >
      <div className="billing-modal">
        <div className="billing-modal__card">
          <header className="billing-modal__header">
            <div className="billing-modal__header-main">
              <span className="billing-modal__header-icon" aria-hidden>
                <ArrowDownCircle {...dashboardActionIconProps({ size: 20 })} />
              </span>
              <h2 id="scheduled-plan-change-details-title" className="billing-modal__title">
                {copy.title}
              </h2>
            </div>
            <PopupCloseButton
              type="button"
              className="billing-modal__close"
              aria-label={copy.close}
              onClick={onClose}
            >
              <ModalCloseIcon />
            </PopupCloseButton>
          </header>

          <div className="billing-modal__body">
            <BillingModalIntro>{copy.intro}</BillingModalIntro>

            <BillingModalInfoCard icon={Calendar} title={copy.effectiveTitle}>
              <BillingModalInfoText>
                {effectiveBody.split(effectiveDate)[0]}
                <BillingModalDateHighlight>{effectiveDate}</BillingModalDateHighlight>
                {effectiveBody.split(effectiveDate)[1] ?? ''}
              </BillingModalInfoText>
            </BillingModalInfoCard>

            <BillingModalInfoCard
              icon={Calendar}
              title={copy.keepTitle}
              variant="neutral"
              mutedIcon
            >
              <BillingModalInfoText>{keepBody}</BillingModalInfoText>
            </BillingModalInfoCard>

            <BillingModalInfoCard
              icon={ArrowDownCircle}
              title={copy.slotsTitle}
              variant="neutral"
              mutedIcon
            >
              <BillingModalInfoText>{slotsBody}</BillingModalInfoText>
            </BillingModalInfoCard>

            <BillingModalNote>{copy.note}</BillingModalNote>
          </div>

          <footer className="dashboard-modal-footer">
            <DashboardButton variant="outline" onClick={onClose}>
              {copy.close}
            </DashboardButton>
          </footer>
        </div>
      </div>
    </Popup>
  );
}
