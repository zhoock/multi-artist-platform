import { Info } from 'lucide-react';
import { useMemo } from 'react';

import type { selectUiDictionaryFirst } from '@shared/model/uiDictionary';

type Props = {
  lang: 'ru' | 'en';
  ui: ReturnType<typeof selectUiDictionaryFirst>;
};

export function SubscriptionPricingPurposeDisclosure({ lang, ui }: Props) {
  const t = ui?.titles;

  const copy = useMemo(
    () => ({
      lead:
        t?.subscriptionPricingPurposeLead ??
        (lang === 'en'
          ? 'Subscription gives access to premium features of the selected plan:'
          : 'Подписка предоставляет доступ к премиум-функциям выбранного тарифа:'),
      rest:
        t?.subscriptionPricingPurposeRest ??
        (lang === 'en'
          ? 'closed tracks, articles, materials, and album downloads.'
          : 'закрытым трекам, статьям, материалам и скачиванию альбомов.'),
    }),
    [lang, t]
  );

  return (
    <p className="subscription-plan-modal__pricing-purpose">
      <Info
        className="subscription-plan-modal__pricing-purpose-icon"
        size={14}
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="subscription-plan-modal__pricing-purpose-text">
        <span className="subscription-plan-modal__pricing-purpose-lead">{copy.lead}</span>{' '}
        <span className="subscription-plan-modal__pricing-purpose-rest">{copy.rest}</span>
      </span>
    </p>
  );
}
