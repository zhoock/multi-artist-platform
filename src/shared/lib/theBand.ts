export type TheBandStorage =
  | {
      ru?: string[];
      en?: string[];
    }
  | null
  | undefined;

export function normalizeBandParagraphs(paragraphs: unknown): string[] {
  if (!Array.isArray(paragraphs)) return [];
  return paragraphs.filter(
    (paragraph) => typeof paragraph === 'string' && paragraph.trim().length > 0
  );
}

export function hasFilledBandParagraphs(paragraphs: string[] | null | undefined): boolean {
  return normalizeBandParagraphs(paragraphs).length > 0;
}

export function parseTheBandStorage(theBand: TheBandStorage): { ru: string[]; en: string[] } {
  if (!theBand || typeof theBand !== 'object') {
    return { ru: [], en: [] };
  }

  const bandObj = theBand as { ru?: string[]; en?: string[] };
  return {
    ru: normalizeBandParagraphs(bandObj.ru),
    en: normalizeBandParagraphs(bandObj.en),
  };
}

/**
 * Возвращает описание группы для запрошенного языка.
 * Если для языка пусто — подставляет текст другого языка (единое описание до явного перевода).
 */
export function resolveTheBandForLang(
  theBand: TheBandStorage,
  lang: 'ru' | 'en',
  options?: { fallbackToOtherLang?: boolean }
): string[] {
  const fallbackToOtherLang = options?.fallbackToOtherLang !== false;
  const { ru, en } = parseTheBandStorage(theBand);
  const primary = lang === 'en' ? en : ru;

  if (hasFilledBandParagraphs(primary)) {
    return primary;
  }

  if (!fallbackToOtherLang) {
    return [];
  }

  const alternate = lang === 'en' ? ru : en;
  return hasFilledBandParagraphs(alternate) ? alternate : [];
}

/** При первом сохранении копирует текст в пустую языковую версию. */
export function syncTheBandAcrossLocales(bandObj: { ru: string[]; en: string[] }): {
  ru: string[];
  en: string[];
} {
  const hasRu = hasFilledBandParagraphs(bandObj.ru);
  const hasEn = hasFilledBandParagraphs(bandObj.en);

  if (hasRu && !hasEn) {
    return { ru: bandObj.ru, en: [...bandObj.ru] };
  }

  if (hasEn && !hasRu) {
    return { ru: [...bandObj.en], en: bandObj.en };
  }

  return bandObj;
}

/**
 * Синхронизирует локали только при сохранении непустого текста.
 * При очистке не подставляет текст из другого языка обратно.
 */
export function syncTheBandOnSave(options: {
  bandObj: { ru: string[]; en: string[] };
  ruWasUpdated: boolean;
  enWasUpdated: boolean;
}): { ru: string[]; en: string[] } {
  const { bandObj, ruWasUpdated, enWasUpdated } = options;
  const ruCleared = ruWasUpdated && !hasFilledBandParagraphs(bandObj.ru);
  const enCleared = enWasUpdated && !hasFilledBandParagraphs(bandObj.en);

  if (ruCleared && enCleared) {
    return { ru: [], en: [] };
  }

  if (ruCleared || enCleared) {
    return bandObj;
  }

  return syncTheBandAcrossLocales(bandObj);
}
