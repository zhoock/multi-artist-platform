// src/entities/stem/model/types.ts
import type { StemCategory } from '@shared/lib/stems/stemCategories';

export { STEM_CATEGORIES, type StemCategory } from '@shared/lib/stems/stemCategories';

/** Описание одного стема в манифесте трека. */
export interface StemMeta {
  /** Стабильный идентификатор стема (не меняется при переименовании/замене файла). */
  id: string;
  /** Отображаемое название (задаётся пользователем). */
  name: string;
  /** Категория — единственный источник иконки и группировки. */
  category: StemCategory;
  /** Имя аудиофайла в папке трека. */
  file: string;
  /** Размер файла в байтах (для отображения). */
  size?: number;
  /** Исходное имя выбранного файла (для подписи). */
  originalFileName?: string;
}

/** Манифест стемов трека (stems.json рядом с аудиофайлами). */
export interface StemsManifest {
  version: number;
  stems: StemMeta[];
}

export const STEMS_MANIFEST_VERSION = 1;
