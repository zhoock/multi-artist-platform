// src/components/Hamburger/Hamburger.tsx
import { memo } from 'react';
import clsx from 'clsx';
import { HamburgerProps } from '@/models';
import './style.scss';

/**
 * Компонент отображает гамбургер-меню.
 */
const HamburgerComponent = ({
  isActive,
  onToggle,
  zIndex,
  className,
  variant = 'floating',
  behindDialogOverlap,
  accessibleName,
}: HamburgerProps) => {
  return (
    <button
      className={clsx(
        'hamburger', // базовый класс
        variant === 'inline' && 'hamburger--inline',
        behindDialogOverlap && variant === 'inline' && 'hamburger--inline-slot-only',
        isActive && 'active', // добавляется, если isActive === true
        className
      )}
      aria-hidden={behindDialogOverlap && variant === 'inline' ? true : undefined}
      tabIndex={behindDialogOverlap && variant === 'inline' ? -1 : undefined}
      onClick={onToggle}
      style={variant === 'inline' ? undefined : { zIndex }}
      type="button"
    >
      <span className="one" aria-hidden="true"></span>
      <span className="two" aria-hidden="true"></span>
      <span className="three" aria-hidden="true"></span>
      <span className="visually-hidden">
        {accessibleName ?? (!isActive ? 'Открыть меню' : 'Скрыть меню')}
      </span>
    </button>
  );
};

export const Hamburger = memo(HamburgerComponent);
