import clsx from 'clsx';
import React, { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  DASHBOARD_ACCESS_MENU_Z_INDEX,
  resolveDashboardAccessMenuPortalFromElement,
} from '../../../lib/useDashboardAccessMenu';

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
};

function getDropdownStyle(trigger: HTMLElement | null): CSSProperties {
  if (!trigger) {
    return { position: 'fixed', visibility: 'hidden' };
  }

  const rect = trigger.getBoundingClientRect();

  return {
    position: 'fixed',
    top: rect.bottom + 4,
    left: rect.left,
    width: rect.width,
    zIndex: DASHBOARD_ACCESS_MENU_Z_INDEX,
  };
}

export function SettingsSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
}: SettingsSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>(() => getDropdownStyle(null));
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  const updateDropdownPosition = () => {
    setDropdownStyle(getDropdownStyle(selectRef.current));
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateDropdownPosition();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleReposition = () => updateDropdownPosition();

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen]);

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

  const portalRoot =
    isOpen && typeof document !== 'undefined'
      ? resolveDashboardAccessMenuPortalFromElement(selectRef.current)
      : null;

  const dropdown = isOpen ? (
    <div
      ref={dropdownRef}
      className="dashboard-form-select__dropdown dashboard-form-select__dropdown--fixed"
      style={dropdownStyle}
      role="listbox"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={value === option.value}
          className={clsx(
            'dashboard-form-select__option',
            value === option.value && 'dashboard-form-select__option--selected'
          )}
          onClick={() => handleSelect(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="dashboard-form-select">
      <div
        ref={selectRef}
        id={id}
        className={clsx(
          'dashboard-form-select__trigger',
          isOpen && 'dashboard-form-select__trigger--open'
        )}
        onClick={toggleDropdown}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={disabled}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleDropdown();
          }
        }}
      >
        <span className="dashboard-form-select__value">{selectedOption?.label ?? ''}</span>
        <svg
          className={clsx(
            'dashboard-form-select__arrow',
            isOpen && 'dashboard-form-select__arrow--open'
          )}
          width="12"
          height="8"
          viewBox="0 0 12 8"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M1 1L6 6L11 1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {portalRoot && dropdown ? createPortal(dropdown, portalRoot) : null}
    </div>
  );
}
