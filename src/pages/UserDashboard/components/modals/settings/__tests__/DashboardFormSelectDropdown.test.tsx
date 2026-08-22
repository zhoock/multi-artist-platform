import { render, screen } from '@testing-library/react';
import { describe, expect, test, jest } from '@jest/globals';

import { DashboardFormSelectDropdown } from '../DashboardFormSelectDropdown';

describe('DashboardFormSelectDropdown', () => {
  test('renders canonical dropdown shell classes for shared Step 2 / Step 5 styling', () => {
    const triggerRef = { current: document.createElement('div') };

    render(
      <>
        <div ref={triggerRef as React.RefObject<HTMLDivElement>} />
        <DashboardFormSelectDropdown isOpen triggerRef={triggerRef}>
          <button type="button" role="option" className="dashboard-form-select__option">
            Apple
          </button>
          <button
            type="button"
            role="option"
            className="dashboard-form-select__option dashboard-form-select__option--checkbox"
          >
            <input type="checkbox" readOnly />
            <span>Grunge</span>
          </button>
        </DashboardFormSelectDropdown>
      </>
    );

    const dropdown = document.body.querySelector('.dashboard-form-select__dropdown');
    expect(dropdown).toBeTruthy();
    expect(dropdown?.classList.contains('dashboard-form-select__dropdown--fixed')).toBe(true);
    expect(screen.getByRole('option', { name: 'Apple' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Grunge' })).toBeTruthy();
  });
});
