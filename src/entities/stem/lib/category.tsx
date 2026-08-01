// src/entities/stem/lib/category.tsx
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  AudioLines,
  AudioWaveform,
  Drum,
  Drumstick,
  Guitar,
  Mic,
  Music,
  Piano,
} from 'lucide-react';
import { type StemCategory } from '@shared/lib/stems/stemCategories';

/** Иконки Lucide по категории. */
const CATEGORY_ICONS: Record<StemCategory, LucideIcon> = {
  drums: Drum,
  bass: Guitar,
  guitar: Guitar,
  vocal: Mic,
  piano: Piano,
  strings: Music,
  synth: AudioWaveform,
  percussion: Drumstick,
  other: AudioLines,
};

/** Локализованные подписи категорий. */
const CATEGORY_LABELS: Record<'ru' | 'en', Record<StemCategory, string>> = {
  ru: {
    drums: 'Барабаны',
    bass: 'Бас',
    guitar: 'Гитара',
    vocal: 'Вокал',
    piano: 'Клавиши',
    strings: 'Струнные',
    synth: 'Синтезатор',
    percussion: 'Перкуссия',
    other: 'Другое',
  },
  en: {
    drums: 'Drums',
    bass: 'Bass',
    guitar: 'Guitar',
    vocal: 'Vocals',
    piano: 'Keys',
    strings: 'Strings',
    synth: 'Synth',
    percussion: 'Percussion',
    other: 'Other',
  },
};

/** Является ли значение валидной категорией. */
export { isStemCategory } from '@shared/lib/stems/stemCategories';

/** Иконка Lucide по категории (с фолбэком на AudioLines). */
export function resolveCategoryIcon(category: StemCategory): LucideIcon {
  return CATEGORY_ICONS[category] ?? AudioLines;
}

/** Подпись категории на нужном языке. */
export function getCategoryLabel(category: StemCategory, lang: 'ru' | 'en' = 'ru'): string {
  return CATEGORY_LABELS[lang][category] ?? CATEGORY_LABELS[lang].other;
}

interface StemIconProps extends LucideProps {
  category: StemCategory;
}

/** Рендерит иконку стема по его категории. */
export function StemIcon({ category, ...iconProps }: StemIconProps) {
  const Icon = resolveCategoryIcon(category);
  return <Icon aria-hidden {...iconProps} />;
}
