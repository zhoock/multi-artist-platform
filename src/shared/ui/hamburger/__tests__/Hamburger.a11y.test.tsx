/** @jest-environment jsdom */

import { describe, expect, jest, test } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { Hamburger } from '../Hamburger';

describe('Hamburger accessibleName', () => {
  test('keeps default menu labels when accessibleName is omitted', () => {
    render(<Hamburger isActive={false} onToggle={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Открыть меню' })).toBeTruthy();

    render(<Hamburger isActive onToggle={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Скрыть меню' })).toBeTruthy();
  });

  test('uses accessibleName override for player close without changing default menu copy', () => {
    render(<Hamburger isActive accessibleName="Close player" onToggle={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Close player' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Скрыть меню' })).toBeNull();
  });
});
