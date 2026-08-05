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

import {
  BillingModalDateHighlight,
  BillingModalInfoCard,
  BillingModalInfoText,
  BillingModalIntro,
  BillingModalNote,
  BillingModalShell,
} from './BillingModalShell';

export type ScheduleDowngradeConfirmModalProps = {
  isOpen: boolean;
  currentPlanSlug: SubscriptionPlanSlug;
  targetPlanSlug: SubscriptionPlanSlug;
  effectiveDateLabel: string | null;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ScheduleDowngradeConfirmModal({
  isOpen,
  currentPlanSlug,
  targetPlanSlug,
  effectiveDateLabel,
  loading = false,
  onCancel,
  onConfirm,
}: ScheduleDowngradeConfirmModalProps) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const t = ui?.dashboard?.collection;

  const targetPlanName = getPlanDisplayName(targetPlanSlug);
  const currentPlanName = getPlanDisplayName(currentPlanSlug);
  const artistLimit = formatPlanArtistLimitParts(targetPlanSlug, lang);
  const effectiveDate = effectiveDateLabel ?? '—';

  const copy = useMemo(
    () => ({
      titleTemplate:
        t?.billingDowngradePlanTitle ??
        (lang === 'en'
          ? 'Switch to {plan} next period?'
          : 'Перейти на {plan} со следующего периода?'),
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
      confirm:
        t?.billingDowngradePlanConfirm ??
        (lang === 'en' ? 'Schedule change' : 'Запланировать смену'),
      footerNote:
        t?.billingDowngradePlanFooterNote ??
        (lang === 'en'
          ? 'You can cancel the scheduled change anytime'
          : 'Запланированную смену можно отменить в любой момент'),
      cancel: ui?.buttons?.cancel ?? (lang === 'en' ? 'Cancel' : 'Отмена'),
      close: ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть'),
    }),
    [lang, t, ui?.buttons?.articleLockedDialogClose, ui?.buttons?.cancel]
  );

  const title = copy.titleTemplate.replace('{plan}', targetPlanName);
  const effectiveBody = copy.effectiveBodyTemplate
    .replace('{date}', effectiveDate)
    .replace('{plan}', targetPlanName);
  const keepBody = copy.keepBodyTemplate.replace('{plan}', currentPlanName);
  const slotsBody = copy.slotsBodyTemplate.replace('{count}', artistLimit.count);

  return (
    <BillingModalShell
      isOpen={isOpen}
      titleId="billing-downgrade-plan-title"
      headerIcon={ArrowDownCircle}
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

      <BillingModalInfoCard icon={Calendar} title={copy.effectiveTitle}>
        <BillingModalInfoText>
          {effectiveBody.split(effectiveDate)[0]}
          <BillingModalDateHighlight>{effectiveDate}</BillingModalDateHighlight>
          {effectiveBody.split(effectiveDate)[1] ?? ''}
        </BillingModalInfoText>
      </BillingModalInfoCard>

      <BillingModalInfoCard icon={Calendar} title={copy.keepTitle} variant="neutral" mutedIcon>
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
    </BillingModalShell>
  );
}
