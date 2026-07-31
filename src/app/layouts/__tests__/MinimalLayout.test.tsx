import { describe, test, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { MinimalLayout } from '../MinimalLayout';

describe('MinimalLayout', () => {
  test('renders children inside main without site chrome', () => {
    render(
      <MinimalLayout>
        <div data-testid="service-page">Service page</div>
      </MinimalLayout>
    );

    expect(screen.getByRole('main')).toContainElement(screen.getByTestId('service-page'));
  });
});
