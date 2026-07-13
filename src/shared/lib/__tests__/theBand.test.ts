import { describe, expect, test } from '@jest/globals';
import {
  hasFilledBandParagraphs,
  resolveTheBandForLang,
  syncTheBandAcrossLocales,
  syncTheBandOnSave,
} from '../theBand';

describe('theBand helpers', () => {
  test('resolveTheBandForLang возвращает текст запрошенного языка', () => {
    const storage = { ru: ['Русский текст'], en: ['English text'] };

    expect(resolveTheBandForLang(storage, 'ru')).toEqual(['Русский текст']);
    expect(resolveTheBandForLang(storage, 'en')).toEqual(['English text']);
  });

  test('resolveTheBandForLang подставляет другой язык, если текущий пуст', () => {
    const storage = { ru: [], en: ['English text'] };

    expect(resolveTheBandForLang(storage, 'ru')).toEqual(['English text']);
    expect(resolveTheBandForLang(storage, 'en')).toEqual(['English text']);
  });

  test('resolveTheBandForLang не подставляет другой язык при fallbackToOtherLang=false', () => {
    const storage = { ru: [], en: ['English text'] };

    expect(resolveTheBandForLang(storage, 'ru', { fallbackToOtherLang: false })).toEqual([]);
  });

  test('syncTheBandAcrossLocales копирует текст в пустую локаль', () => {
    expect(syncTheBandAcrossLocales({ ru: [], en: ['English text'] })).toEqual({
      ru: ['English text'],
      en: ['English text'],
    });

    expect(syncTheBandAcrossLocales({ ru: ['Русский текст'], en: [] })).toEqual({
      ru: ['Русский текст'],
      en: ['Русский текст'],
    });
  });

  test('syncTheBandAcrossLocales не перезаписывает заполненные обе локали', () => {
    const storage = { ru: ['Русский текст'], en: ['English text'] };
    expect(syncTheBandAcrossLocales(storage)).toEqual(storage);
  });

  test('hasFilledBandParagraphs игнорирует пустые строки', () => {
    expect(hasFilledBandParagraphs(['', '  '])).toBe(false);
    expect(hasFilledBandParagraphs(['Bio'])).toBe(true);
  });

  test('syncTheBandOnSave не восстанавливает текст при очистке одной локали', () => {
    expect(
      syncTheBandOnSave({
        bandObj: { ru: [], en: ['English text'] },
        ruWasUpdated: true,
        enWasUpdated: false,
      })
    ).toEqual({ ru: [], en: ['English text'] });
  });

  test('syncTheBandOnSave очищает обе локали при одновременной очистке', () => {
    expect(
      syncTheBandOnSave({
        bandObj: { ru: [], en: [] },
        ruWasUpdated: true,
        enWasUpdated: true,
      })
    ).toEqual({ ru: [], en: [] });
  });

  test('syncTheBandOnSave копирует текст при сохранении непустого значения', () => {
    expect(
      syncTheBandOnSave({
        bandObj: { ru: [], en: ['English text'] },
        ruWasUpdated: false,
        enWasUpdated: true,
      })
    ).toEqual({ ru: ['English text'], en: ['English text'] });
  });
});
