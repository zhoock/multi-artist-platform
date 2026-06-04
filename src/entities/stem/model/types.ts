// src/entities/stem/model/types.ts

/** Поддерживаемые категории стемов. Иконка стема определяется ТОЛЬКО по категории. */
export type StemCategory =
  | 'drums'
  | 'bass'
  | 'guitar'
  | 'vocal'
  | 'piano'
  | 'strings'
  | 'synth'
  | 'percussion'
  | 'other';

/** Порядок категорий для выпадающих списков (UI). */
export const STEM_CATEGORIES: StemCategory[] = [
  'drums',
  'bass',
  'guitar',
  'vocal',
  'piano',
  'strings',
  'synth',
  'percussion',
  'other',
];

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
