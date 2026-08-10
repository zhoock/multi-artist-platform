import clsx from 'clsx';

import type { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  formatPlanArtistLimitParts,
  formatPlanPricePeriod,
  getPlanDisplayName,
  getPlanPriceCurrencyDisplay,
  getPlanPriceDisplayAmount,
  getPlanCardBadgeLabel,
  resolvePlanCardAction,
  shouldShowPlanCardCheckoutAutopaymentDisclosure,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { isSubscriptionAutoRenewClientEnabled } from '@shared/lib/subscription/isSubscriptionAutoRenewClientEnabled';
import { DashboardButton, DashboardCard } from '@shared/ui/dashboard';
import { getSubscriptionPlanFeatures } from './subscriptionPlanFeatures';
import { SubscriptionCheckoutAutopaymentDisclosure } from './SubscriptionCheckoutAutopaymentDisclosure';

type Props = {
  planSlug: SubscriptionPlanSlug;
  currentPlanSlug: SubscriptionPlanSlug | null;
  scheduledTargetPlanSlug?: SubscriptionPlanSlug | null;
  isPremium: boolean;
  lang: 'en' | 'ru';
  ui: ReturnType<typeof selectUiDictionaryFirst>;
  loadingPlan: SubscriptionPlanSlug | null;
  onSelect: (planSlug: SubscriptionPlanSlug) => void;
};

export function SubscriptionPlanCard({
  planSlug,
  currentPlanSlug,
  scheduledTargetPlanSlug = null,
  isPremium,
  lang,
  ui,
  loadingPlan,
  onSelect,
}: Props) {
  const planName = getPlanDisplayName(planSlug);
  const artistLimit = formatPlanArtistLimitParts(planSlug, lang);
  const priceAmount = getPlanPriceDisplayAmount(planSlug);
  const priceCurrency = getPlanPriceCurrencyDisplay();
  const pricePeriod = formatPlanPricePeriod(planSlug, lang);
  const isCurrent = currentPlanSlug === planSlug;
  const { label, badge, disabled, variant } = resolvePlanCardAction({
    planSlug,
    currentPlanSlug,
    scheduledTargetPlanSlug,
    isPremium,
    lang,
  });
  const badgeLabel = getPlanCardBadgeLabel(badge, lang);
  const isLoading = loadingPlan === planSlug;
  const isButtonDisabled = Boolean(loadingPlan) || disabled;
  const buttonVariant = scheduledTargetPlanSlug ? variant : disabled ? 'outline' : 'primary';
  const showCheckoutAutopaymentDisclosure =
    isSubscriptionAutoRenewClientEnabled() &&
    !isButtonDisabled &&
    shouldShowPlanCardCheckoutAutopaymentDisclosure({
      planSlug,
      currentPlanSlug,
      scheduledTargetPlanSlug,
      isPremium,
    });

  const features = getSubscriptionPlanFeatures(lang, ui);
  const redirectingLabel = lang === 'en' ? 'Redirecting…' : 'Переход к оплате…';

  return (
    <DashboardCard
      as="article"
      selected={isCurrent}
      className={clsx(
        'subscription-plan-modal__plan-card',
        badgeLabel && 'subscription-plan-modal__plan-card--has-badge'
      )}
      aria-labelledby={`subscription-plan-${planSlug}-title`}
    >
      {badgeLabel ? (
        <span className="subscription-plan-modal__plan-badge">{badgeLabel}</span>
      ) : null}

      <h3 id={`subscription-plan-${planSlug}-title`} className="subscription-plan-modal__plan-name">
        {planName}
      </h3>

      <div className="subscription-plan-modal__plan-limit">
        <span className="subscription-plan-modal__plan-limit-prefix">{artistLimit.prefix}</span>
        <span className="subscription-plan-modal__plan-limit-count">{artistLimit.count}</span>
        <span className="subscription-plan-modal__plan-limit-suffix">{artistLimit.suffix}</span>
      </div>

      <p
        className="subscription-plan-modal__plan-price"
        aria-label={`${priceAmount} ${priceCurrency} ${pricePeriod}`}
      >
        <span className="subscription-plan-modal__plan-price-num">{priceAmount}</span>
        <span className="subscription-plan-modal__plan-price-currency">{priceCurrency}</span>
        <span className="subscription-plan-modal__plan-price-period">{pricePeriod}</span>
      </p>

      <hr className="subscription-plan-modal__plan-divider" aria-hidden />

      {showCheckoutAutopaymentDisclosure ? (
        <SubscriptionCheckoutAutopaymentDisclosure planSlug={planSlug} lang={lang} ui={ui} />
      ) : null}

      <DashboardButton
        type="button"
        variant={buttonVariant}
        className="subscription-plan-modal__plan-cta"
        disabled={isButtonDisabled}
        loading={isLoading}
        onClick={() => {
          if (isButtonDisabled) return;
          onSelect(planSlug);
        }}
      >
        {isLoading ? redirectingLabel : label}
      </DashboardButton>

      <ul className="subscription-plan-modal__plan-features">
        {features.map(({ key, label, Icon }) => (
          <li key={key} className="subscription-plan-modal__plan-feature">
            <Icon
              className="subscription-plan-modal__plan-feature-icon"
              size={16}
              strokeWidth={1.75}
              aria-hidden
            />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
