import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { EMPTY_BILLING_SNAPSHOT, type BillingSnapshot } from '@shared/api/billing';
import { resolveCollectionBillingScreen } from '@features/premiumSubscription/lib/resolveCollectionBillingScreen';
import { resolveCollectionBillingOverlays } from '@features/premiumSubscription/lib/resolveCollectionBillingOverlays';
import { usePremiumSubscription } from '@features/premiumSubscription';
import { ARCHIVE_CHANGED_EVENT, SUBSCRIPTION_ACTIVATED_EVENT } from '@features/artistArchive';
import { useArchiveAccessModal } from '@shared/lib/archiveAccessModal';
import type { SubscriptionPlanSlug } from '@shared/lib/payment/subscriptionPlans';
import { useSubscriptionBilling } from '@shared/lib/subscription/useSubscriptionBilling';
import { useSubscriptionRebindPayment } from '@shared/lib/subscription/useSubscriptionRebindPayment';
import { isSubscriptionAutoRenewClientEnabled } from '@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled';
import { resolveAutoRenewClientError } from '@shared/lib/subscription/resolveAutoRenewClientError';
import {
  useRenewalCountdown,
  useRenewalCountdownClock,
} from '@shared/lib/subscription/useRenewalCountdown';
import { billingSnapshotFingerprint } from '@shared/lib/subscription/billingSnapshotFingerprint';

import type { BillingAutoRenewModalVariant } from './billingModals';
import type { CollectionBillingCopy } from './CollectionBillingSummary';

type UseSubscriptionTabControllerOptions = {
  active: boolean;
  onContentReady?: () => void;
  onContentBusy?: () => void;
  onMountPinChange?: (pinned: boolean) => void;
};

export function useSubscriptionTabController({
  active,
  onContentReady,
  onContentBusy,
  onMountPinChange,
}: UseSubscriptionTabControllerOptions) {
  const { lang } = useLang() as { lang: 'ru' | 'en' };
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const { open: openSupportModal, startCheckout } = useArchiveAccessModal();
  const { billing, slotsUsed, refetch } = usePremiumSubscription();

  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [alertModalMessage, setAlertModalMessage] = useState<string | null>(null);
  const [renewLoading, setRenewLoading] = useState(false);
  const [autoRenewModal, setAutoRenewModal] = useState<BillingAutoRenewModalVariant | null>(null);
  const [unlinkModalOpen, setUnlinkModalOpen] = useState(false);
  const [unlinkModalError, setUnlinkModalError] = useState<string | null>(null);
  const [billingPatch, setBillingPatch] = useState<BillingSnapshot | null>(null);

  const {
    patchAutoRenew,
    cancelScheduledDowngrade,
    unlinkPaymentMethod,
    loading: autoRenewPatchLoading,
  } = useSubscriptionBilling();
  const { startRebind } = useSubscriptionRebindPayment();

  const onContentReadyRef = useRef(onContentReady);
  const onContentBusyRef = useRef(onContentBusy);
  onContentReadyRef.current = onContentReady;
  onContentBusyRef.current = onContentBusy;

  const t = ui?.dashboard?.collection;
  const alertModalTitle = ui?.dashboard?.error ?? (lang === 'en' ? 'Error' : 'Ошибка');
  const alertModalCloseLabel =
    ui?.buttons?.articleLockedDialogClose ?? (lang === 'en' ? 'Close' : 'Закрыть');
  const autoRenewActionsEnabled = isSubscriptionAutoRenewClientEnabled();
  const autoRenewPatchErrorText =
    t?.billingAutoRenewPatchError ?? 'Не удалось обновить автопродление';
  const unlinkPaymentErrorText = t?.billingUnlinkPaymentError ?? 'Не удалось отвязать карту';
  const choosePlanCta =
    t?.billingExpiredBannerCta ??
    t?.changePlanButton ??
    (lang === 'en' ? 'Choose plan' : 'Выбрать тариф');

  const showErrorAlert = useCallback((message: string) => {
    setAlertModalMessage(message);
  }, []);

  const refreshBilling = useCallback(async () => {
    if (!active) return;
    try {
      await refetch();
    } catch (err) {
      console.error('[SubscriptionContent] billing refresh failed', err);
    }
  }, [active, refetch]);

  useEffect(() => {
    if (!active) return;
    onContentBusyRef.current?.();
    setHasLoadedOnce(false);
    void refetch().finally(() => {
      setHasLoadedOnce(true);
    });
  }, [active, refetch]);

  useEffect(() => {
    if (!onMountPinChange) return;
    onMountPinChange(renewLoading || autoRenewPatchLoading);
  }, [autoRenewPatchLoading, onMountPinChange, renewLoading]);

  useLayoutEffect(() => {
    if (hasLoadedOnce) {
      onContentReadyRef.current?.();
    }
  }, [hasLoadedOnce]);

  useEffect(() => {
    if (!active) return;
    const onSubscriptionActivated = () => {
      void refreshBilling();
    };
    window.addEventListener(SUBSCRIPTION_ACTIVATED_EVENT, onSubscriptionActivated);
    return () => window.removeEventListener(SUBSCRIPTION_ACTIVATED_EVENT, onSubscriptionActivated);
  }, [active, refreshBilling]);

  useEffect(() => {
    if (!billingPatch) return;
    if (billingSnapshotFingerprint(billing) === billingSnapshotFingerprint(billingPatch)) {
      setBillingPatch(null);
    }
  }, [billing, billingPatch]);

  const billingSnapshot = billingPatch ?? billing ?? EMPTY_BILLING_SNAPSHOT;
  const renewalCountdown = useRenewalCountdown(
    billingSnapshot.nextChargeAt,
    billingSnapshot.expiresAt,
    lang
  );
  const billingChargeLabel = renewalCountdown.label;
  const billingNow = useRenewalCountdownClock();
  const billingScreen = useMemo(
    () => resolveCollectionBillingScreen(billingSnapshot, billingNow),
    [billingSnapshot, billingNow]
  );

  const billingOverlays = useMemo(
    () =>
      resolveCollectionBillingOverlays({
        billing: billingSnapshot,
        billingScreen,
        slotsUsed,
      }),
    [billingSnapshot, billingScreen, slotsUsed]
  );

  const planSlug: SubscriptionPlanSlug | null = billingSnapshot.plan;

  const billingCopy = useMemo((): CollectionBillingCopy => {
    return {
      billingCurrentPlanSection: t?.billingCurrentPlanSection ?? 'ТЕКУЩИЙ ПЛАН',
      billingLastPlanSection: t?.billingLastPlanSection ?? 'ПОСЛЕДНИЙ ПЛАН',
      billingSupportSection: t?.billingSupportSection ?? 'ПОДДЕРЖКА',
      billingSupportActiveUntil: t?.billingSupportActiveUntil ?? 'Поддержка активна до {date}',
      billingSupportRemainingRelative:
        t?.billingSupportRemainingRelative ?? 'Поддержка сохранится ещё {remaining} (до {until})',
      billingSupportRemainingAbsolute:
        t?.billingSupportRemainingAbsolute ?? 'Поддержка сохранится до {date}',
      billingNextChargeOn: t?.billingNextChargeOn ?? 'Следующее списание — {date}',
      billingSupportExpiredOn: t?.billingSupportExpiredOn ?? 'Истёк {date}',
      billingChangePlanButton: t?.billingChangePlanButton ?? t?.changePlanButton ?? 'Сменить',
      billingRecommendedPlanSection: t?.billingRecommendedPlanSection ?? 'РЕКОМЕНДУЕМЫЙ ПЛАН',
      billingUpgradePlanButton: t?.billingUpgradePlanButton ?? 'Повысить тариф',
      billingCollectionUsageSection: t?.billingCollectionUsageSection ?? 'Использование коллекции',
      billingCollectionUsageCount: t?.billingCollectionUsageCount ?? '{used} из {limit}',
      billingCancelledBannerTitle: t?.billingCancelledBannerTitle ?? 'Поддержка отменена',
      billingCancelledBannerBody:
        t?.billingCancelledBannerBody ??
        'Автопродление отключено. Поддержка артистов сохранится до окончания оплаченного периода.',
      billingCancelledBannerCta: t?.billingCancelledBannerCta ?? 'Возобновить поддержку',
      billingExpiredBannerTitle: t?.billingExpiredBannerTitle ?? 'Поддержка завершена',
      billingExpiredBannerBody:
        t?.billingExpiredBannerBody ??
        'Срок оплаченного периода закончился. Чтобы снова поддерживать любимых артистов и пользоваться премиум-функциями, выберите тариф.',
      billingExpiredBannerCta: t?.billingExpiredBannerCta ?? 'Выбрать тариф',
      billingPaymentFailedBannerTitle:
        t?.billingPaymentFailedBannerTitle ?? 'Не удалось продлить поддержку',
      billingPaymentFailedBannerBody:
        t?.billingPaymentFailedBannerBody ??
        'Не удалось списать ежемесячный платёж. Обновите платёжные данные, чтобы возобновить поддержку.',
      billingPaymentFailedBannerCta:
        t?.billingPaymentFailedBannerCta ?? 'Обновить платёжные данные',
      billingPaymentFailedNextRetry:
        t?.billingPaymentFailedNextRetry ?? 'Следующая попытка: {date}',
      billingPaymentFailedGraceEnds:
        t?.billingPaymentFailedGraceEnds ?? 'Доступ сохранится до: {date}',
      billingDowngradeSlotsBannerTitle:
        t?.billingDowngradeSlotsBannerTitle ?? 'Запланировано понижение тарифа',
      billingDowngradeSlotsBannerBody:
        t?.billingDowngradeSlotsBannerBody ??
        'С {date} тариф изменится на {plan} ({limit} артистов). Сейчас в коллекции {used} артистов — удалите лишних или отмените понижение.',
      billingDowngradeSlotsBannerCta:
        t?.billingDowngradeSlotsBannerCta ?? 'Отменить плановое понижение',
      billingDisableAutoRenewLink: t?.billingDisableAutoRenewLink ?? 'Отключить автопродление',
      billingPaymentMethodSection: t?.billingPaymentMethodSection ?? 'Способ оплаты',
      billingPaymentMethodChangeLink: t?.billingPaymentMethodChangeLink ?? 'Изменить способ оплаты',
      billingUnlinkPaymentLink: t?.billingUnlinkPaymentLink ?? 'Отвязать карту',
      activeSlotsLabel: t?.activeSlotsLabel ?? 'артистов в коллекции',
    };
  }, [t]);

  const notifyArchiveChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent(ARCHIVE_CHANGED_EVENT));
  }, []);

  const handleBillingBannerAction = useCallback(async () => {
    if (renewLoading || autoRenewPatchLoading) return;

    if (billingScreen === 'CANCELLED') {
      setAutoRenewModal('enable');
      return;
    }

    if (billingScreen === 'PAYMENT_FAILED') {
      setAutoRenewModal('enable-rebind');
      return;
    }

    if (billingScreen === 'EXPIRED' || !planSlug) {
      openSupportModal();
      return;
    }

    setRenewLoading(true);
    setAlertModalMessage(null);

    const result = await startCheckout(planSlug);

    if (!result.ok) {
      showErrorAlert(result.error);
      setRenewLoading(false);
      return;
    }

    if (result.redirected === 'auth') {
      setRenewLoading(false);
    }
  }, [
    autoRenewPatchLoading,
    billingScreen,
    openSupportModal,
    planSlug,
    renewLoading,
    showErrorAlert,
    startCheckout,
  ]);

  const handleRenewCurrentPlan = useCallback(async () => {
    if (renewLoading || autoRenewPatchLoading) return;

    if (billingScreen === 'CANCELLED') {
      setAutoRenewModal('enable');
      return;
    }

    if (billingScreen === 'PAYMENT_FAILED') {
      setAutoRenewModal('enable-rebind');
      return;
    }

    if (!planSlug) {
      openSupportModal();
      return;
    }

    setRenewLoading(true);
    setAlertModalMessage(null);

    const result = await startCheckout(planSlug);

    if (!result.ok) {
      showErrorAlert(result.error);
      setRenewLoading(false);
      return;
    }

    if (result.redirected === 'auth') {
      setRenewLoading(false);
    }
  }, [
    autoRenewPatchLoading,
    billingScreen,
    openSupportModal,
    planSlug,
    renewLoading,
    showErrorAlert,
    startCheckout,
  ]);

  const handleConfirmAutoRenewPatch = useCallback(async () => {
    if (!autoRenewModal || autoRenewModal === 'enable-rebind') return;

    setAlertModalMessage(null);
    const enable = autoRenewModal === 'enable';
    const result = await patchAutoRenew(enable);

    if (!result.ok) {
      if (enable && result.code === 'PAYMENT_METHOD_REQUIRED') {
        setAutoRenewModal('enable-rebind');
        return;
      }
      showErrorAlert(resolveAutoRenewClientError(result, autoRenewPatchErrorText));
      return;
    }

    setBillingPatch(result.archive.billing);
    notifyArchiveChanged();
    void refetch();
    setAutoRenewModal(null);
  }, [
    autoRenewModal,
    autoRenewPatchErrorText,
    notifyArchiveChanged,
    patchAutoRenew,
    refetch,
    showErrorAlert,
  ]);

  const handleConfirmAutoRenewRebind = useCallback(async () => {
    setRenewLoading(true);
    setAlertModalMessage(null);

    const result = await startRebind({
      resumeAutoRenew: autoRenewModal === 'enable-rebind',
    });

    if (!result.ok) {
      showErrorAlert(resolveAutoRenewClientError(result, autoRenewPatchErrorText));
      setRenewLoading(false);
    }
  }, [autoRenewModal, autoRenewPatchErrorText, showErrorAlert, startRebind]);

  const handleOpenChangePaymentMethod = useCallback(() => {
    setAutoRenewModal('rebind');
  }, []);

  const handleOpenUnlinkPaymentMethod = useCallback(() => {
    setUnlinkModalError(null);
    setUnlinkModalOpen(true);
  }, []);

  const handleConfirmUnlinkPaymentMethod = useCallback(async () => {
    setUnlinkModalError(null);
    setAlertModalMessage(null);

    const result = await unlinkPaymentMethod();

    if (!result.ok) {
      setUnlinkModalError(resolveAutoRenewClientError(result, unlinkPaymentErrorText));
      return;
    }

    setBillingPatch(result.billing);
    notifyArchiveChanged();
    void refetch();
    setUnlinkModalOpen(false);
    setUnlinkModalError(null);
  }, [notifyArchiveChanged, refetch, unlinkPaymentErrorText, unlinkPaymentMethod]);

  const handleDisableAutoRenew = useCallback(() => {
    setAutoRenewModal('disable');
  }, []);

  const handleChangePlan = useCallback(() => {
    openSupportModal();
  }, [openSupportModal]);

  const handleUpgradePlan = useCallback(() => {
    openSupportModal();
  }, [openSupportModal]);

  const handleCancelScheduledDowngrade = useCallback(async () => {
    if (autoRenewPatchLoading || renewLoading) return;

    setAlertModalMessage(null);
    const result = await cancelScheduledDowngrade();

    if (!result.ok) {
      showErrorAlert(result.error);
      return;
    }

    setBillingPatch(result.archive.billing);
    notifyArchiveChanged();
    void refetch();
  }, [
    autoRenewPatchLoading,
    cancelScheduledDowngrade,
    notifyArchiveChanged,
    refetch,
    renewLoading,
    showErrorAlert,
  ]);

  const autoRenewModalLoading = autoRenewPatchLoading || renewLoading;
  const shouldBlockShell = !hasLoadedOnce;

  return {
    lang,
    billing: billingSnapshot,
    billingScreen,
    billingOverlays,
    billingCopy,
    billingChargeLabel,
    planSlug,
    slotsUsed,
    autoRenewModal,
    setAutoRenewModal,
    unlinkModalOpen,
    setUnlinkModalOpen,
    unlinkModalError,
    setUnlinkModalError,
    renewLoading,
    autoRenewPatchLoading,
    autoRenewModalLoading,
    autoRenewActionsEnabled,
    alertModalMessage,
    setAlertModalMessage,
    alertModalTitle,
    alertModalCloseLabel,
    choosePlanCta,
    shouldBlockShell,
    handleBillingBannerAction,
    handleRenewCurrentPlan,
    handleConfirmAutoRenewPatch,
    handleConfirmAutoRenewRebind,
    handleOpenChangePaymentMethod,
    handleOpenUnlinkPaymentMethod,
    handleConfirmUnlinkPaymentMethod,
    handleDisableAutoRenew,
    handleChangePlan,
    handleUpgradePlan,
    handleCancelScheduledDowngrade,
    openSupportModal,
  };
}
