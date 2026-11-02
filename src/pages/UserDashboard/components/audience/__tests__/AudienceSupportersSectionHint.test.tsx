import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { AudienceSupportersSectionHint } from '../AudienceSupportersSectionHint';

const tooltipText =
  'Listeners with an active Premium subscription who have added you to their collection.';

describe('AudienceSupportersSectionHint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the tooltip on click and closes on outside click', async () => {
    renderWithProviders(
      <>
        <AudienceSupportersSectionHint ariaLabel="About supporters" tooltipText={tooltipText} />
        <button type="button">Outside</button>
      </>
    );

    const trigger = screen.getByRole('button', { name: 'About supporters' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent(tooltipText);
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the tooltip on Escape', async () => {
    renderWithProviders(
      <AudienceSupportersSectionHint ariaLabel="About supporters" tooltipText={tooltipText} />
    );

    const trigger = screen.getByRole('button', { name: 'About supporters' });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });

  it('keeps the tooltip open when the pointer moves from the trigger to the tooltip', async () => {
    renderWithProviders(
      <AudienceSupportersSectionHint ariaLabel="About supporters" tooltipText={tooltipText} />
    );

    const trigger = screen.getByRole('button', { name: 'About supporters' });
    fireEvent.mouseEnter(trigger);

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    fireEvent.mouseLeave(trigger);
    const tooltip = screen.getByRole('tooltip');
    fireEvent.mouseEnter(tooltip);

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });
  });

  it('toggles closed on a second click on the trigger', async () => {
    renderWithProviders(
      <AudienceSupportersSectionHint ariaLabel="About supporters" tooltipText={tooltipText} />
    );

    const trigger = screen.getByRole('button', { name: 'About supporters' });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });
  });
});
