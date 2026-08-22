import clsx from 'clsx';
import React, { useEffect, useRef, useState } from 'react';
import { DashboardFormSelectChevron } from './DashboardFormSelectChevron';
import { DashboardFormSelectDropdown } from './DashboardFormSelectDropdown';

export type SettingsSelectOption = {
  value: string;
  label: string;
};

type SettingsSelectProps = {
  id?: string;
  value: string;
  options: SettingsSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
};

export function SettingsSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  className,
  onKeyDown,
}: SettingsSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const isEmbedded = className?.includes('dashboard-form-select--embedded') ?? false;
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!isOpen) return;

    const currentIndex = options.findIndex((option) => option.value === value);
    setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
  }, [isOpen, options, value]);

  useEffect(() => {
    if (!isOpen) return;

    optionRefs.current[highlightedIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [highlightedIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        selectRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !selectRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape, true);
    return () => document.removeEventListener('keydown', handleEscape, true);
  }, [isOpen]);

  const toggleDropdown = () => {
    if (disabled) return;
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setIsOpen(false);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;

    if (isOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightedIndex((index) => Math.min(index + 1, options.length - 1));
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightedIndex((index) => Math.max(index - 1, 0));
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const highlighted = options[highlightedIndex];
        if (highlighted) {
          handleSelect(highlighted.value);
        }
        return;
      }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleDropdown();
      return;
    }

    onKeyDown?.(event);
  };

  return (
    <div className={clsx('dashboard-form-select', className)}>
      <div
        ref={selectRef}
        id={id}
        className={clsx(
          'dashboard-form-select__trigger',
          isOpen && 'dashboard-form-select__trigger--open',
          isEmbedded && 'dashboard-form-select__trigger--embedded'
        )}
        onClick={toggleDropdown}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={disabled}
        onKeyDown={handleTriggerKeyDown}
      >
        <span
          className={clsx(
            'dashboard-form-select__value',
            !value && 'dashboard-form-select__value--placeholder'
          )}
        >
          {selectedOption?.label ?? ''}
        </span>
        <DashboardFormSelectChevron open={isOpen} />
      </div>

      <DashboardFormSelectDropdown isOpen={isOpen} triggerRef={selectRef} dropdownRef={dropdownRef}>
        {options.map((option, index) => (
          <button
            key={option.value || '__empty__'}
            ref={(element) => {
              optionRefs.current[index] = element;
            }}
            type="button"
            role="option"
            aria-selected={value === option.value}
            className={clsx(
              'dashboard-form-select__option',
              value === option.value && 'dashboard-form-select__option--selected',
              highlightedIndex === index && 'dashboard-form-select__option--highlighted'
            )}
            onClick={() => handleSelect(option.value)}
            onMouseEnter={() => setHighlightedIndex(index)}
          >
            {option.label}
          </button>
        ))}
      </DashboardFormSelectDropdown>
    </div>
  );
}
