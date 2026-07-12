import { Check } from 'lucide-react';

import clsx from 'clsx';

import type { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  formatPlanArtistLimitParts,
  formatPlanPricePeriod,
  getPlanDisplayName,
  getPlanHighlightFeature,
  getPlanPriceDisplayAmount,
  getPlanCardBadgeLabel,
  resolvePlanCardAction,
  type SubscriptionPlanSlug,
} from '@shared/lib/payment/subscriptionPlans';
import { DashboardButton, DashboardCard } from '@shared/ui/dashboard';

type Props = {
  planSlug: SubscriptionPlanSlug;
  currentPlanSlug: SubscriptionPlanSlug | null;
  isPremium: boolean;
  lang: 'en' | 'ru';
  ui: ReturnType<typeof selectUiDictionaryFirst>;
  priceCurrency: string;
  loadingPlan: SubscriptionPlanSlug | null;
  onSelect: (planSlug: SubscriptionPlanSlug) => void;
};

export function SubscriptionPlanCard({
  planSlug,
  currentPlanSlug,
  isPremium,
  lang,
  ui,
  priceCurrency,
  loadingPlan,
  onSelect,
}: Props) {
  const planName = getPlanDisplayName(planSlug);
  const artistLimit = formatPlanArtistLimitParts(planSlug, lang);
  const priceAmount = getPlanPriceDisplayAmount(planSlug);
  const pricePeriod = formatPlanPricePeriod(planSlug, lang);
  const isCurrent = currentPlanSlug === planSlug;
  const { label, badge, disabled } = resolvePlanCardAction({
    planSlug,
    currentPlanSlug,
    isPremium,
    lang,
  });
  const badgeLabel = getPlanCardBadgeLabel(badge, lang);
  const isLoading = loadingPlan === planSlug;
  const isButtonDisabled = Boolean(loadingPlan) || disabled;

  const featureExclusive =
    ui?.titles?.archiveAccessPlanFeatureExclusive ??
    (lang === 'en' ? 'Exclusive tracks and articles' : 'Эксклюзивные треки и статьи');
  const featureRevenue =
    ui?.titles?.archiveAccessPlanFeatureRevenue ??
    (lang === 'en' ? 'Equal revenue distribution' : 'Равное распределение дохода');
  const featureHighlight = getPlanHighlightFeature(planSlug, lang);

  const features = [featureExclusive, featureRevenue, featureHighlight];
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

      <DashboardButton
        type="button"
        variant={disabled ? 'outline' : 'primary'}
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
        {features.map((feature) => (
          <li key={feature} className="subscription-plan-modal__plan-feature">
            <Check
              className="subscription-plan-modal__plan-feature-icon"
              size={16}
              strokeWidth={2.5}
              aria-hidden
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
}
