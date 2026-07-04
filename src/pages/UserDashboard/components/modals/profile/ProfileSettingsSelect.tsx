import React, { useEffect, useRef, useState } from 'react';

export type ProfileSettingsSelectOption = {
  value: string;
  label: string;
};

type ProfileSettingsSelectProps = {
  id?: string;
  value: string;
  options: ProfileSettingsSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function ProfileSettingsSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
}: ProfileSettingsSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((option) => option.value === value) ?? options[0];

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

  return (
    <div className="profile-settings-modal__select-wrapper">
      <div
        ref={selectRef}
        id={id}
        className={`profile-settings-modal__select${
          isOpen ? ' profile-settings-modal__select--open' : ''
        }`}
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
        <span className="profile-settings-modal__select-value">{selectedOption?.label ?? ''}</span>
        <svg
          className={`profile-settings-modal__select-arrow ${
            isOpen ? 'profile-settings-modal__select-arrow--open' : ''
          }`}
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

      {isOpen && (
        <div ref={dropdownRef} className="profile-settings-modal__dropdown" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              className={`profile-settings-modal__option ${
                value === option.value ? 'profile-settings-modal__option--selected' : ''
              }`}
              onClick={() => handleSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
