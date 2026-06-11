// src/pages/UserDashboard/components/blocks/BlockDivider.tsx
import React from 'react';

interface BlockDividerProps {
  onFocus?: () => void;
  onBlur?: () => void;
  onEnter?: () => void;
}

export function BlockDivider({ onFocus, onBlur, onEnter }: BlockDividerProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter?.();
    }
  };

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
