/** @jest-environment jsdom */

import { describe, expect, test } from '@jest/globals';
import { render } from '@testing-library/react';

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en', setLang: () => {} }),
}));

import { ScrollToExploreHint } from '../ScrollToExploreHint';

describe('ScrollToExploreHint', () => {
  test('applies hidden class when not visible', () => {
    const { container } = render(<ScrollToExploreHint visible={false} />);
    expect(container.querySelector('.universe-scroll-hint--hidden')).not.toBeNull();
  });

  test('does not apply hidden class by default', () => {
    const { container } = render(<ScrollToExploreHint />);
    expect(container.querySelector('.universe-scroll-hint--hidden')).toBeNull();
  });
});
