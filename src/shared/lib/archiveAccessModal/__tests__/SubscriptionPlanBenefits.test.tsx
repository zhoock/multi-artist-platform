/**
 * UI tests for shared subscription benefits block.
 */

import React from 'react';
import { describe, test, expect } from '@jest/globals';
import { screen } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { SubscriptionPlanBenefits } from '../SubscriptionPlanBenefits';

describe('SubscriptionPlanBenefits', () => {
  test('renders shared benefits once with access-oriented copy', () => {
    renderWithProviders(<SubscriptionPlanBenefits lang="en" ui={null} />);

    expect(screen.getByText('With a subscription you get:')).toBeTruthy();
    expect(screen.getByText('Unlocked tracks')).toBeTruthy();
    expect(screen.getByText('Unlocked articles')).toBeTruthy();
    expect(screen.getByText('Access to stems')).toBeTruthy();
    expect(screen.getByText('Album downloads')).toBeTruthy();
  });

  test('ignores legacy archiveAccessFeature copy from UI dictionary', () => {
    renderWithProviders(
      <SubscriptionPlanBenefits
        lang="ru"
        ui={
          {
            titles: {
              archiveAccessFeatureTracks: 'Закрытые треки',
              archiveAccessFeatureArticles: 'Закрытые статьи',
              archiveAccessFeatureStems: 'Закрытые стемы',
              archiveAccessFeatureDownloads: 'Скачивание альбомов',
            },
          } as never
        }
      />
    );

    expect(screen.queryByText('Закрытые треки')).toBeNull();
    expect(screen.getByText('Открытые треки')).toBeTruthy();
    expect(screen.getByText('Открытые статьи')).toBeTruthy();
    expect(screen.getByText('Доступ к стемам')).toBeTruthy();
  });
});
