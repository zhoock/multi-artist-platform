// src/pages/UserDashboard/components/blocks/BlockDivider.tsx
import React from 'react';

interface BlockDividerProps {
  onFocus?: () => void;
  onBlur?: () => void;
  onEnter?: () => void;
  onRemove?: () => void;
}

export function BlockDivider({ onFocus, onBlur, onEnter, onRemove }: BlockDividerProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter?.();
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      e.stopPropagation();
      onRemove?.();
    }
  };

  /* eslint-disable jsx-a11y/no-static-element-interactions, jsx-a11y/no-noninteractive-tabindex -- editor block focus shell (same as image/carousel) */
  return (
    <div
      className="edit-article-v2__block edit-article-v2__block--divider"
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <hr />
    </div>
  );
}
