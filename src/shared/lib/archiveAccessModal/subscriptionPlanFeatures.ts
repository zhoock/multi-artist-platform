import {
  Download as DownloadIcon,
  FileText as FileTextIcon,
  Music as MusicIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  type LucideIcon,
} from 'lucide-react';

import type { selectUiDictionaryFirst } from '@shared/model/uiDictionary';

export type SubscriptionPlanFeatureKey = 'tracks' | 'articles' | 'stems' | 'downloads';

export type SubscriptionPlanFeature = {
  key: SubscriptionPlanFeatureKey;
  label: string;
  Icon: LucideIcon;
};

const SUBSCRIPTION_PLAN_BENEFIT_UI_KEYS = {
  tracks: 'subscriptionPlanBenefitTracks',
  articles: 'subscriptionPlanBenefitArticles',
  stems: 'subscriptionPlanBenefitStems',
  downloads: 'subscriptionPlanBenefitDownloads',
} as const satisfies Record<SubscriptionPlanFeatureKey, string>;

const SUBSCRIPTION_PLAN_BENEFIT_FALLBACKS: Record<
  SubscriptionPlanFeatureKey,
  { en: string; ru: string }
> = {
  tracks: { en: 'Unlocked tracks', ru: 'Открытые треки' },
  articles: { en: 'Unlocked articles', ru: 'Открытые статьи' },
  stems: { en: 'Access to stems', ru: 'Доступ к стемам' },
  downloads: { en: 'Album downloads', ru: 'Скачивание альбомов' },
};

function getSubscriptionPlanBenefitLabel(
  key: SubscriptionPlanFeatureKey,
  lang: 'en' | 'ru',
  ui: ReturnType<typeof selectUiDictionaryFirst> | null
): string {
  const uiKey = SUBSCRIPTION_PLAN_BENEFIT_UI_KEYS[key];
  const titles = ui?.titles as Record<string, string | undefined> | undefined;
  const fromUi = titles?.[uiKey];
  if (typeof fromUi === 'string' && fromUi.trim()) {
    return fromUi;
  }
  return SUBSCRIPTION_PLAN_BENEFIT_FALLBACKS[key][lang];
}

export function getSubscriptionPlanFeatures(
  lang: 'en' | 'ru',
  ui: ReturnType<typeof selectUiDictionaryFirst> | null
): SubscriptionPlanFeature[] {
  return [
    {
      key: 'tracks',
      label: getSubscriptionPlanBenefitLabel('tracks', lang, ui),
      Icon: MusicIcon,
    },
    {
      key: 'articles',
      label: getSubscriptionPlanBenefitLabel('articles', lang, ui),
      Icon: FileTextIcon,
    },
    {
      key: 'stems',
      label: getSubscriptionPlanBenefitLabel('stems', lang, ui),
      Icon: SlidersHorizontalIcon,
    },
    {
      key: 'downloads',
      label: getSubscriptionPlanBenefitLabel('downloads', lang, ui),
      Icon: DownloadIcon,
    },
  ];
}
