import { fireEvent, render, screen } from '@testing-library/react';

import { DashboardExpandableRowTrigger } from '../DashboardExpandableRowTrigger';

describe('DashboardExpandableRowTrigger', () => {
  it('renders with button semantics and aria-expanded', () => {
    render(
      <DashboardExpandableRowTrigger
        expanded={false}
        onToggle={() => undefined}
        aria-label="Expand album"
      >
        Row content
      </DashboardExpandableRowTrigger>
    );

    const trigger = screen.getByRole('button', { name: 'Expand album' });
    expect(trigger.getAttribute('tabIndex')).toBe('0');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.className).toContain('dashboard-expandable-row-trigger');
  });

  it('calls onToggle on click and keyboard activation', () => {
    const onToggle = jest.fn();

    render(
      <DashboardExpandableRowTrigger expanded onToggle={onToggle} aria-label="Collapse album">
        Row content
      </DashboardExpandableRowTrigger>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Collapse album' }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Collapse album' }), {
      key: 'Enter',
    });
    expect(onToggle).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Collapse album' }), {
      key: ' ',
    });
    expect(onToggle).toHaveBeenCalledTimes(3);
  });
});
