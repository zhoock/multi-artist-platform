// src/pages/StemsPlayground/components/MixerBackNav.tsx
import type { ReactNode } from 'react';
import { ChevronLeft as ChevronLeftIcon } from 'lucide-react';

type MixerBackNavProps = {
  onBack: () => void;
  ariaLabel: string;
  /** Контекст уровня: название и метаданные (год, кол-во треков, длительность). */
  children: ReactNode;
};

/** Кнопка возврата с хлебной крошкой текущего уровня микшера. */
export function MixerBackNav({ onBack, ariaLabel, children }: MixerBackNavProps) {
  return (
    <button type="button" className="mixer-back" onClick={onBack} aria-label={ariaLabel}>
      <ChevronLeftIcon className="mixer-back__icon" aria-hidden size={20} />
      <span className="mixer-back__crumb">{children}</span>
    </button>
  );
}
