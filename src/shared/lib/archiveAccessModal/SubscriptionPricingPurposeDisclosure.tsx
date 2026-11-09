import { Info } from 'lucide-react';
import { useMemo } from 'react';

import type { selectUiDictionaryFirst } from '@shared/model/uiDictionary';

type Props = {
  lang: 'ru' | 'en';
  ui: ReturnType<typeof selectUiDictionaryFirst>;
};

export function SubscriptionPricingPurposeDisclosure({ lang, ui }: Props) {
  const t = ui?.titles as Record<string, string | undefined> | undefined;

  const copy = useMemo(() => {
    const fromUi = t?.subscriptionPricingPurpose?.trim();
    if (fromUi) {
      return fromUi;
    }
    return lang === 'en'
      ? 'Subscription unlocks tracks, articles, stems, and album downloads for artists in your collection.'
      : 'Подписка открывает доступ к трекам, статьям, стемам и скачиванию альбомов выбранных артистов.';
  }, [lang, t]);

  return (
    <p className="subscription-plan-modal__pricing-purpose">
      <Info
        className="subscription-plan-modal__pricing-purpose-icon"
        size={14}
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="subscription-plan-modal__pricing-purpose-text">
        <span className="subscription-plan-modal__pricing-purpose-lead">{copy}</span>
      </span>
    </p>
  );
}
