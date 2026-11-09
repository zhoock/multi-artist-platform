import { describe, expect, test } from '@jest/globals';

import { getSubscriptionPlanFeatures } from '../subscriptionPlanFeatures';

describe('getSubscriptionPlanFeatures', () => {
  test('does not use legacy archiveAccessFeature UI keys', () => {
    const features = getSubscriptionPlanFeatures('ru', {
      titles: {
        archiveAccessFeatureTracks: 'Закрытые треки',
        archiveAccessFeatureArticles: 'Закрытые статьи',
        archiveAccessFeatureStems: 'Закрытые стемы',
        archiveAccessFeatureDownloads: 'Скачивание альбомов',
      },
    } as never);

    expect(features.map((feature) => feature.label)).toEqual([
      'Открытые треки',
      'Открытые статьи',
      'Доступ к стемам',
      'Скачивание альбомов',
    ]);
  });
});
