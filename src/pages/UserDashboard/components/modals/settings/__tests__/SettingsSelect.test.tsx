import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, jest } from '@jest/globals';

import { SettingsSelect } from '../SettingsSelect';

describe('SettingsSelect', () => {
  const options = [
    { value: '', label: 'Select service' },
    { value: 'apple', label: 'Apple' },
    { value: 'bandcamp', label: 'Bandcamp' },
  ];

  test('opens custom dropdown instead of native select', () => {
    render(<SettingsSelect id="service-select" value="" options={options} onChange={jest.fn()} />);

    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /select service/i }));

    expect(screen.getByRole('listbox')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Apple' })).toBeTruthy();
  });

  test('supports keyboard navigation and selection', () => {
    const onChange = jest.fn();

    render(<SettingsSelect id="service-select" value="" options={options} onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: /select service/i });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('apple');
  });

  test('closes dropdown on Escape without calling onChange', () => {
    const onChange = jest.fn();

    render(<SettingsSelect id="service-select" value="" options={options} onChange={onChange} />);

    const trigger = screen.getByRole('button', { name: /select service/i });
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
