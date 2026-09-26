/** @jest-environment jsdom */

import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Share } from '../Share';

describe('Share accessibility', () => {
  beforeEach(() => {
    jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  test('toggle button expands menu and exposes popup semantics', async () => {
    const user = userEvent.setup();
    render(<Share url="https://example.com/album/demo" />);

    const toggle = screen.getByRole('button', { name: 'Поделиться' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-haspopup', 'menu');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Поделиться на Facebook' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Поделиться на Twitter' })).toBeTruthy();
  });

  test('share platform buttons activate with keyboard and open share window', () => {
    render(<Share url="https://example.com/track/1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Поделиться' }));

    const facebook = screen.getByRole('button', { name: 'Поделиться на Facebook' });
    fireEvent.keyDown(facebook, { key: 'Enter' });
    fireEvent.click(facebook);

    expect(window.open).toHaveBeenCalled();
  });
});
