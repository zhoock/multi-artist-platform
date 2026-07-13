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

export function getSubscriptionPlanFeatures(
  lang: 'en' | 'ru',
  ui: ReturnType<typeof selectUiDictionaryFirst> | null
): SubscriptionPlanFeature[] {
  return [
    {
      key: 'tracks',
      label:
        ui?.titles?.archiveAccessFeatureTracks ??
        (lang === 'en' ? 'Locked tracks' : 'Закрытые треки'),
      Icon: MusicIcon,
    },
    {
      key: 'articles',
      label:
        ui?.titles?.archiveAccessFeatureArticles ??
        (lang === 'en' ? 'Locked articles' : 'Закрытые статьи'),
      Icon: FileTextIcon,
    },
    {
      key: 'stems',
      label:
        ui?.titles?.archiveAccessFeatureStems ??
        (lang === 'en' ? 'Locked stems' : 'Закрытые стемы'),
      Icon: SlidersHorizontalIcon,
    },
    {
      key: 'downloads',
      label:
        ui?.titles?.archiveAccessFeatureDownloads ??
        (lang === 'en' ? 'Album downloads' : 'Скачивание альбомов'),
      Icon: DownloadIcon,
    },
  ];
}
