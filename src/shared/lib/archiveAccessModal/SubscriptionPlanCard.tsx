import { Check } from 'lucide-react';

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

  return (
    <article
      className={`archive-access-modal__plan-card${isCurrent ? ' archive-access-modal__plan-card--current' : ''}`}
      aria-labelledby={`archive-access-plan-${planSlug}-title`}
    >
      {badgeLabel ? (
        <span className="archive-access-modal__plan-status-badge">{badgeLabel}</span>
      ) : null}

      <h3 id={`archive-access-plan-${planSlug}-title`} className="archive-access-modal__plan-name">
        {planName}
      </h3>

      <div className="archive-access-modal__plan-limit">
        <span className="archive-access-modal__plan-limit-prefix">{artistLimit.prefix}</span>
        <span className="archive-access-modal__plan-limit-count">{artistLimit.count}</span>
        <span className="archive-access-modal__plan-limit-suffix">{artistLimit.suffix}</span>
      </div>

      <p
        className="archive-access-modal__plan-price"
        aria-label={`${priceAmount} ${priceCurrency} ${pricePeriod}`}
      >
        <span className="archive-access-modal__plan-price-num">{priceAmount}</span>
        <span className="archive-access-modal__plan-price-currency">{priceCurrency}</span>
        <span className="archive-access-modal__plan-price-period">{pricePeriod}</span>
      </p>

      <hr className="archive-access-modal__plan-divider" aria-hidden />

      <button
        type="button"
        className={`archive-access-modal__plan-cta${
          isButtonDisabled ? ' archive-access-modal__plan-cta--disabled' : ''
        }`}
        disabled={isButtonDisabled}
        aria-busy={isLoading}
        aria-disabled={isButtonDisabled}
        onClick={() => {
          if (isButtonDisabled) return;
          onSelect(planSlug);
        }}
      >
        {isLoading ? (lang === 'en' ? 'Redirecting…' : 'Переход к оплате…') : label}
      </button>

      <ul className="archive-access-modal__plan-features">
        {features.map((feature) => (
          <li key={feature} className="archive-access-modal__plan-feature">
            <Check
              className="archive-access-modal__plan-feature-icon"
              size={16}
              strokeWidth={2.5}
              aria-hidden
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
