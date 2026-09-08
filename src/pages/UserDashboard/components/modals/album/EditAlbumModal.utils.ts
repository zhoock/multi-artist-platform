// src/pages/UserDashboard/components/EditAlbumModal.utils.ts
import type {
  AlbumFormData,
  ProducingCredits,
  BandMember,
  RecordingEntry,
  RecordingFormDraft,
} from './EditAlbumModal.types';
import { recordingEntryEditHasChanges } from './recordingEntryEditHasChanges';
import { DEFAULT_PRODUCING_CREDIT_TYPES } from './EditAlbumModal.constants';
import type { SupportedLang } from '@shared/model/lang';
import type { IInterface, detailsProps } from '@models';
import {
  type AlbumDetailSemanticKind,
  classifyAlbumDetailSemanticKind,
  dedupeMergedAlbumDetailsForDisplay,
} from '@entities/album/lib/albumDetailSemanticKind';
import {
  extractContentItemId,
  generateAlbumDetailListItemId,
} from '@entities/album/lib/albumDetailListItemId';

export const EMPTY_BAND_MEMBER: BandMember = {
  id: '',
  name: '',
  role: '',
  url: undefined,
};

export function createBandMember(partial: Omit<BandMember, 'id'> & { id?: string }): BandMember {
  return { ...partial, id: partial.id?.trim() || generateAlbumDetailListItemId() };
}

export function createRecordingEntry(
  partial: Omit<RecordingEntry, 'id'> & { id?: string }
): RecordingEntry {
  return { ...partial, id: partial.id?.trim() || generateAlbumDetailListItemId() };
}

export function updateBandMemberPreservingId(
  prev: BandMember,
  updates: Omit<BandMember, 'id'>
): BandMember {
  return createBandMember({ ...updates, id: prev.id });
}

export function updateRecordingEntryPreservingId(
  prev: RecordingEntry,
  updates: Omit<RecordingEntry, 'id'>
): RecordingEntry {
  return createRecordingEntry({ ...updates, id: prev.id });
}

export function parseBandMemberFromContentItem(item: unknown): BandMember | null {
  if (typeof item === 'string' && item.trim() === '') return null;
  const id = extractContentItemId(item) ?? generateAlbumDetailListItemId();

  if (typeof item === 'object' && item !== null && 'text' in item) {
    const textValue = (item as { text?: unknown }).text;

    if (typeof textValue === 'string' && textValue.trim()) {
      const match = textValue.match(/^(.+?)\s*—\s*(.+)$/);
      if (match) {
        const name = match[1].trim();
        const role = match[2].trim().replace(/\.+$/, '');
        const url = (item as { link?: unknown }).link
          ? String((item as { link?: unknown }).link).trim()
          : undefined;
        if (name && role) return createBandMember({ id, name, role, url });
      }
      const url = (item as { link?: unknown }).link
        ? String((item as { link?: unknown }).link).trim()
        : undefined;
      return createBandMember({ id, name: textValue.trim(), role: '', url });
    }

    if (Array.isArray(textValue)) {
      const fullText = textValue.join('');
      const match = fullText.match(/^(.+?)\s*—\s*(.+)$/);
      const url = (item as { link?: unknown }).link
        ? String((item as { link?: unknown }).link).trim()
        : undefined;
      if (match) {
        const name = match[1].trim();
        const role = match[2].trim().replace(/\.+$/, '');
        if (name && role) return createBandMember({ id, name, role, url });
      } else if (fullText.trim()) {
        return createBandMember({ id, name: fullText.trim(), role: '', url });
      }
    }
  } else if (typeof item === 'string' && item.trim()) {
    const match = item.match(/^(.+?)\s*—\s*(.+)$/);
    if (match) {
      const name = match[1].trim();
      const role = match[2].trim().replace(/\.+$/, '');
      if (name && role) return createBandMember({ id, name, role });
    }
    return createBandMember({ id, name: item.trim(), role: '' });
  }

  return null;
}

export function parseProducerFromContentItem(item: unknown): BandMember | null {
  if (!item) return null;
  const id = extractContentItemId(item) ?? generateAlbumDetailListItemId();

  if (typeof item === 'object' && item !== null && 'text' in item) {
    const textArray = (item as { text?: unknown }).text;
    if (Array.isArray(textArray)) {
      if (textArray.length === 2) {
        const name = String(textArray[0]).trim();
        const role = String(textArray[1]).trim();
        const roleLower = role.toLowerCase();
        if (roleLower.includes('mastering') || roleLower.includes('мастеринг')) return null;
        if (name && role) {
          return createBandMember({
            id,
            name,
            role,
            url: (item as { link?: unknown }).link
              ? String((item as { link?: unknown }).link).trim()
              : undefined,
          });
        }
      } else if (
        textArray.length === 3 &&
        textArray[0] === '' &&
        String(textArray[2]).startsWith(' — ')
      ) {
        const name = String(textArray[1]).trim();
        const role = String(textArray[2]).replace(/^ — /, '').trim();
        const roleLower = role.toLowerCase();
        if (roleLower.includes('mastering') || roleLower.includes('мастеринг')) return null;
        if (name && role) {
          return createBandMember({
            id,
            name,
            role,
            url: (item as { link?: unknown }).link
              ? String((item as { link?: unknown }).link).trim()
              : undefined,
          });
        }
      }
    }
  } else if (typeof item === 'string' && item.trim()) {
    const fullText = item.trim();
    const roleTextLower = fullText.toLowerCase();
    if (roleTextLower.includes('mastering') || roleTextLower.includes('мастеринг')) return null;
    const match = fullText.match(/^(.+?)\s*—\s*(.+)$/);
    if (match) {
      return createBandMember({ id, name: match[1].trim(), role: match[2].trim() });
    }
    return createBandMember({ id, name: '', role: fullText });
  }

  return null;
}

export function parseRecordingEntryFromContentItem(
  item: unknown,
  lang: 'en' | 'ru'
): RecordingEntry | null {
  if (!item || typeof item !== 'object' || !('dateFrom' in item)) return null;
  const record = item as {
    id?: string;
    dateFrom?: string;
    dateTo?: string;
    studioText?: string;
    city?: string;
    url?: string | null;
  };
  if (!record.dateFrom) return null;

  return createRecordingEntry({
    id: record.id,
    text: buildRecordingText(record.dateFrom, record.dateTo, record.studioText, record.city, lang),
    url: record.url || undefined,
    dateFrom: record.dateFrom,
    dateTo: record.dateTo,
    studioText: record.studioText,
    city: record.city,
  });
}

export function serializeBandMemberToContentItem(member: BandMember): unknown {
  const roleClean = member.role.trim().replace(/\.+$/, '');
  const urlTrimmed = member.url?.trim();
  const base = { id: member.id };

  if (urlTrimmed) {
    return {
      ...base,
      text: ['', member.name, ` — ${roleClean}.`],
      link: urlTrimmed,
    };
  }

  return {
    ...base,
    text: `${member.name} — ${roleClean}.`,
  };
}

export function serializeProducerToContentItem(member: BandMember): unknown {
  const roleClean = member.role.trim().replace(/\.+$/, '');
  const urlTrimmed = member.url?.trim();
  const result: { id: string; text: string[]; link?: string } = {
    id: member.id,
    text: [member.name.trim(), roleClean],
  };
  if (urlTrimmed) result.link = urlTrimmed;
  return result;
}

export function serializeRecordingEntryToContentItem(entry: RecordingEntry): unknown {
  const result: Record<string, unknown> = { id: entry.id };
  if (entry.dateFrom) result.dateFrom = entry.dateFrom;
  if (entry.dateTo) result.dateTo = entry.dateTo;
  if (entry.studioText) result.studioText = entry.studioText;
  if (entry.city) result.city = entry.city;
  if (entry.url && entry.url.trim()) {
    result.url = entry.url.trim();
  } else {
    result.url = null;
  }
  return result;
}

export function buildRecordingEntryFromEditFields(
  fields: {
    dateFrom?: string;
    dateTo?: string;
    studioText?: string;
    city?: string;
    url?: string;
  },
  lang: 'en' | 'ru',
  id?: string
): RecordingEntry {
  return createRecordingEntry({
    id,
    text: buildRecordingText(
      fields.dateFrom,
      fields.dateTo,
      fields.studioText?.trim(),
      fields.city?.trim(),
      lang
    ),
    url: fields.url?.trim() || undefined,
    dateFrom: fields.dateFrom,
    dateTo: fields.dateTo,
    studioText: fields.studioText?.trim(),
    city: fields.city?.trim(),
  });
}

/** Черновик ссылки (purchase / streaming) для сравнения с сохранённой строкой. */
export const EMPTY_LINK = { service: '', url: '' };

export function linkEditHasChanges(
  saved: { service: string; url: string },
  serviceDraft: string,
  urlDraft: string
): boolean {
  return saved.service.trim() !== serviceDraft.trim() || saved.url.trim() !== urlDraft.trim();
}

export function bandMemberEditHasChanges(
  saved: BandMember,
  name: string,
  role: string,
  url: string
): boolean {
  const normUrl = (u: string | undefined) => (u?.trim() ? u.trim() : undefined);
  return (
    saved.name.trim() !== name.trim() ||
    saved.role.trim() !== role.trim() ||
    normUrl(saved.url) !== normUrl(url)
  );
}

export function emptyRecordingFormDraft(): RecordingFormDraft {
  return {
    dateFrom: '',
    dateTo: '',
    studioText: '',
    city: '',
    url: '',
  };
}

export function recordingFormDraftIsDirty(draft: RecordingFormDraft): boolean {
  return recordingEntryEditHasChanges(
    createRecordingEntry({ text: '' }),
    {},
    draft.dateFrom,
    draft.dateTo,
    draft.studioText,
    draft.city,
    draft.url
  );
}

export function recordingFormDraftCanSave(draft: RecordingFormDraft): boolean {
  return Boolean(draft.studioText?.trim() || draft.city?.trim() || draft.dateFrom || draft.dateTo);
}

/**
 * Заголовки блоков `details`, которые форма редактирования полностью перезаписывает при сохранении.
 * Должны совпадать с вариантами в `EditAlbumModal` (парсинг) и `AlbumDetailsMusic` (отображение),
 * иначе при сохранении с EN-интерфейсом русские заголовки не удаляются и дублируются с английскими.
 */
export const EDITABLE_ALBUM_DETAIL_BLOCK_TITLES = new Set<string>([
  'Genre',
  'Genres',
  'Жанр',
  'Жанры',
  'Band members',
  'Участники группы',
  'Исполнители',
  'Session musicians',
  'Сессионные музыканты',
  'Session Musicians',
  'Producing',
  'Продюсирование',
  'Продюсер',
  'Mastered By',
  'Мастеринг',
  'Recorded At',
  'Запись',
  'Mixed At',
  'Сведение',
]);

/** Семантика редактируемых блоков details — один id на блок во всех локалях. */
type DetailBlockKind = AlbumDetailSemanticKind;

function classifyDetailBlockTitle(title: string, ui?: IInterface): DetailBlockKind | null {
  return classifyAlbumDetailSemanticKind(title, ui);
}

/** Сохранение: тот же дедуп, что и на отображении (один блок на kind, канонический title). */
export function dedupeSemanticAlbumDetailBlocks(
  details: unknown[],
  lang: SupportedLang,
  ui?: IInterface
): unknown[] {
  return dedupeMergedAlbumDetailsForDisplay(details as detailsProps[], lang, ui) as unknown[];
}

/** kind через `classifyDetailBlockTitle` → `normalize(title)`; первый встреченный id для kind сохраняется. */
function collectExistingDetailIdsByKind(
  existingDetails: unknown,
  ui?: IInterface
): { kindToId: Map<DetailBlockKind, number>; maxId: number } {
  const kindToId = new Map<DetailBlockKind, number>();
  let maxId = 0;
  if (!Array.isArray(existingDetails)) return { kindToId, maxId };

  for (const raw of existingDetails) {
    if (!raw || typeof raw !== 'object') continue;
    const id = (raw as { id?: unknown }).id;
    const title = (raw as { title?: unknown }).title;
    if (typeof id !== 'number' || !Number.isFinite(id)) continue;
    maxId = Math.max(maxId, id);
    if (typeof title !== 'string') continue;
    const kind = classifyDetailBlockTitle(title, ui);
    if (kind && !kindToId.has(kind)) {
      kindToId.set(kind, id);
    }
  }
  return { kindToId, maxId };
}

/**
 * Id из merged baseline по kind; если kind уже есть в карте — только он (без замены на новый id из-за usedIds).
 * Новый id только если kind в baseline не встречался.
 */
function takeDetailBlockId(
  kind: DetailBlockKind,
  kindToId: Map<DetailBlockKind, number>,
  usedIds: Set<number>,
  maxIdRef: { n: number }
): number {
  if (kindToId.has(kind)) {
    const id = kindToId.get(kind)!;
    usedIds.add(id);
    return id;
  }
  maxIdRef.n += 1;
  while (usedIds.has(maxIdRef.n)) maxIdRef.n += 1;
  usedIds.add(maxIdRef.n);
  return maxIdRef.n;
}

/**
 * Форматирует дату из формата YYYY-MM-DD в формат "MON. DD, YYYY" (английский)
 */
export function formatDateToDisplayEN(dateStr: string | undefined): string {
  if (!dateStr) return '';

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const months = [
      'JAN',
      'FEB',
      'MAR',
      'APR',
      'MAY',
      'JUN',
      'JUL',
      'AUG',
      'SEP',
      'OCT',
      'NOV',
      'DEC',
    ];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();

    return `${month}. ${day}, ${year}`;
  } catch {
    return dateStr;
  }
}

/**
 * Форматирует дату из формата YYYY-MM-DD в формат "DD месяца YYYY" (русский)
 */
export function formatDateToDisplayRU(dateStr: string | undefined): string {
  if (!dateStr) return '';

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const months = [
      'января',
      'февраля',
      'марта',
      'апреля',
      'мая',
      'июня',
      'июля',
      'августа',
      'сентября',
      'октября',
      'ноября',
      'декабря',
    ];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

/**
 * Форматирует дату из формата YYYY-MM-DD в формат в зависимости от языка
 */
export function formatDateToDisplay(dateStr: string | undefined, lang: 'en' | 'ru' = 'en'): string {
  return lang === 'ru' ? formatDateToDisplayRU(dateStr) : formatDateToDisplayEN(dateStr);
}

/**
 * Парсит дату из формата "MON. DD, YYYY" в формат YYYY-MM-DD
 */
export function parseDateFromDisplay(dateStr: string | undefined): string | undefined {
  if (!dateStr) return undefined;

  try {
    // Формат: "OCT. 16, 2018" или "OCT 16, 2018"
    const match = dateStr.match(/([A-Z]{3})\.?\s+(\d{1,2}),\s+(\d{4})/);
    if (!match) return undefined;

    const months: Record<string, number> = {
      JAN: 0,
      FEB: 1,
      MAR: 2,
      APR: 3,
      MAY: 4,
      JUN: 5,
      JUL: 6,
      AUG: 7,
      SEP: 8,
      OCT: 9,
      NOV: 10,
      DEC: 11,
    };

    const month = months[match[1]];
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);

    if (month === undefined || isNaN(day) || isNaN(year)) return undefined;

    const date = new Date(year, month, day);
    const yearStr = String(date.getFullYear());
    const monthStr = String(date.getMonth() + 1).padStart(2, '0');
    const dayStr = String(date.getDate()).padStart(2, '0');

    return `${yearStr}-${monthStr}-${dayStr}`;
  } catch {
    return undefined;
  }
}

/**
 * Извлекает даты и текст студии из полного текста записи
 * Формат: "OCT. 16, 2018—DEC. 28, 2018: Studio Name" или "OCT. 16, 2018: Studio Name"
 */
export function parseRecordingText(text: string): {
  dateFrom?: string;
  dateTo?: string;
  studioText?: string;
} {
  if (!text) return {};

  // Пытаемся найти диапазон дат: "DATE1—DATE2:"
  const rangeMatch = text.match(
    /^([A-Z]{3}\.?\s+\d{1,2},\s+\d{4})—([A-Z]{3}\.?\s+\d{1,2},\s+\d{4}):\s*(.+)$/
  );
  if (rangeMatch) {
    return {
      dateFrom: parseDateFromDisplay(rangeMatch[1]),
      dateTo: parseDateFromDisplay(rangeMatch[2]),
      studioText: rangeMatch[3].trim(),
    };
  }

  // Пытаемся найти одну дату: "DATE:"
  const singleMatch = text.match(/^([A-Z]{3}\.?\s+\d{1,2},\s+\d{4}):\s*(.+)$/);
  if (singleMatch) {
    return {
      dateFrom: parseDateFromDisplay(singleMatch[1]),
      studioText: singleMatch[2].trim(),
    };
  }

  // Если не нашли дату, весь текст - это текст студии
  return {
    studioText: text.trim(),
  };
}

export { recordingEntryEditHasChanges } from './recordingEntryEditHasChanges';

/**
 * Строит текст записи из дат и текста студии для указанного языка
 */
export function buildRecordingText(
  dateFrom: string | undefined,
  dateTo: string | undefined,
  studioText: string | undefined,
  city: string | undefined,
  lang: 'en' | 'ru' = 'en'
): string {
  const parts: string[] = [];

  if (dateFrom && dateTo) {
    const fromFormatted = formatDateToDisplay(dateFrom, lang);
    const toFormatted = formatDateToDisplay(dateTo, lang);
    parts.push(`${fromFormatted}—${toFormatted}`);
  } else if (dateFrom) {
    parts.push(formatDateToDisplay(dateFrom, lang));
  } else if (dateTo) {
    parts.push(formatDateToDisplay(dateTo, lang));
  }

  // Формируем текст студии с городом
  let studioAndCity = '';
  if (studioText && city) {
    studioAndCity = `${studioText}, ${city}`;
  } else if (studioText) {
    studioAndCity = studioText;
  } else if (city) {
    studioAndCity = city;
  }

  if (studioAndCity) {
    if (parts.length > 0) {
      parts.push(`: ${studioAndCity}`);
    } else {
      parts.push(studioAndCity);
    }
  }

  return parts.join('');
}

/**
 * Конвертирует дату из формата DD/MM/YYYY в ISO формат YYYY-MM-DD для сохранения в БД
 */
export function formatDateToISO(dateStr: string): string {
  if (!dateStr || !dateStr.trim()) return '';

  // Если дата уже в формате YYYY-MM-DD, возвращаем как есть
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return dateStr.trim();
  }

  // Парсим DD/MM/YYYY
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts.map((p) => p.padStart(2, '0'));
    // Проверяем валидность
    if (day && month && year && day.length === 2 && month.length === 2 && year.length === 4) {
      return `${year}-${month}-${day}`;
    }
  }

  // Если формат не распознан, пытаемся распарсить через Date
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Если ничего не помогло, возвращаем как есть (будет ошибка валидации)
  return dateStr;
}

/**
 * Конвертирует дату из ISO формата YYYY-MM-DD в формат DD/MM/YYYY для отображения
 */
export function formatDateFromISO(dateStr: string): string {
  if (!dateStr || !dateStr.trim()) return '';

  // Если дата уже в формате DD/MM/YYYY, возвращаем как есть
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr.trim())) {
    return dateStr.trim();
  }

  // Парсим YYYY-MM-DD или ISO формат
  let date: Date;
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr.trim())) {
    // ISO формат YYYY-MM-DD
    const parts = dateStr.trim().split(/[-T]/);
    if (parts.length >= 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // месяцы в JS начинаются с 0
      const day = parseInt(parts[2], 10);
      date = new Date(year, month, day);
    } else {
      date = new Date(dateStr);
    }
  } else {
    date = new Date(dateStr);
  }

  if (isNaN(date.getTime())) {
    return dateStr; // Возвращаем как есть, если не удалось распарсить
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Применяет маску ввода для поля даты DD/MM/YYYY
 */
export function formatDateInput(value: string): string {
  // Удаляем все нецифровые символы
  const digits = value.replace(/\D/g, '');

  // Ограничиваем длину до 8 цифр (DDMMYYYY)
  const limited = digits.slice(0, 8);

  // Форматируем: добавляем слеши
  if (limited.length <= 2) {
    return limited;
  } else if (limited.length <= 4) {
    return `${limited.slice(0, 2)}/${limited.slice(2)}`;
  } else {
    return `${limited.slice(0, 2)}/${limited.slice(2, 4)}/${limited.slice(4)}`;
  }
}

/** Album sales are RUB-only until multi-currency checkout exists. */
export const ALBUM_PRICE_CURRENCY = 'RUB' as const;

export const makeEmptyForm = (): AlbumFormData => ({
  title: '',
  releaseDate: '',
  upcEan: '',
  albumArt: null,
  description: '',
  allowDownloadSale: 'no',
  regularPrice: '9.99',
  currency: ALBUM_PRICE_CURRENCY,
  preorderReleaseDate: '',
  genreCodes: [],
  tags: [],
  albumCoverPhotographer: '',
  albumCoverPhotographerURL: '',
  albumCoverDesigner: '',
  albumCoverDesignerURL: '',
  bandMembers: [],
  showAddBandMemberInputs: false,
  sessionMusicians: [],
  showAddSessionMusicianInputs: false,
  producer: [],
  producerName: '',
  producerRole: '',
  producerURL: '',
  showAddProducerInputs: false,
  mastering: [],
  masteringDateFrom: '',
  masteringDateTo: '',
  masteringText: '',
  masteringCity: '',
  masteringURL: '',
  showAddMasteringInputs: false,
  producingCredits: DEFAULT_PRODUCING_CREDIT_TYPES.reduce((acc, type) => {
    acc[type] = [];
    return acc;
  }, {} as ProducingCredits),
  recordedAt: [],
  recordedAtDateFrom: '',
  recordedAtDateTo: '',
  recordedAtText: '',
  recordedAtCity: '',
  recordedAtURL: '',
  showAddRecordedAtInputs: false,
  mixedAt: [],
  mixedAtDateFrom: '',
  mixedAtDateTo: '',
  mixedAtText: '',
  mixedAtCity: '',
  mixedAtURL: '',
  showAddMixedAtInputs: false,
  purchaseLinks: [],
  streamingLinks: [],
});

/** Поля шага 1 для привязки подписи ошибки к конкретному инпуту */
export type AlbumStep1InvalidField =
  | 'title'
  | 'releaseDate'
  | 'upcEan'
  | 'description'
  | 'cover'
  | 'regularPrice'
  | 'preorderReleaseDate';

/** Поля шага 4 (кредиты) с обязательной проверкой */
export type AlbumStep4InvalidField = 'albumCoverDesigner' | 'bandMembers' | 'producer';

export type AlbumCoverStep1State = {
  albumArtPreview: string | null;
  coverDraftKey: string | null;
  /** Staged cover already committed to Storage — retry DB save without re-commit. */
  committedCoverBaseName?: string | null;
};

export function hasAlbumCoverForStep1(
  formData: AlbumFormData,
  coverState: AlbumCoverStep1State
): boolean {
  if (coverState.committedCoverBaseName?.trim()) return true;
  if (coverState.coverDraftKey) return true;
  if (coverState.albumArtPreview?.trim()) return true;
  if (formData.albumArt instanceof File) return true;
  return false;
}

export type AlbumCoverSavePlan =
  | { action: 'none' }
  | { action: 'useCommitted'; baseName: string }
  | { action: 'commitDraft'; draftKey: string };

/**
 * Decide whether to commit a draft, reuse a staged committed cover, or skip cover changes.
 * Mirrors article editor `uploadedPendingKeyRef` — DB failure retries skip Storage commit.
 */
export function planAlbumCoverForSave(
  coverDraftKey: string | null,
  committedCoverBaseName: string | null
): AlbumCoverSavePlan {
  const staged = committedCoverBaseName?.trim();
  if (staged) {
    return { action: 'useCommitted', baseName: staged };
  }
  const draft = coverDraftKey?.trim();
  if (draft) {
    return { action: 'commitDraft', draftKey: draft };
  }
  return { action: 'none' };
}

/** Extract baseName from commit-cover response with storagePath/url fallbacks. */
export function extractCommittedCoverBaseName(data: {
  baseName?: string;
  storagePath?: string;
  url?: string;
}): string | undefined {
  if (data.baseName?.trim()) {
    return data.baseName.trim();
  }

  const fromFile = (name?: string) =>
    name ? name.replace(/\.(webp|jpg)$/i, '').replace(/-(64|128|448|896|1344)$/i, '') : undefined;

  return fromFile(data.storagePath?.split('/').pop()) ?? fromFile(data.url?.split('/').pop());
}

/** Minimum album regular price (matches YooKassa / server checkout validation). */
export const MIN_ALBUM_REGULAR_PRICE = 0.01;

export function parseAlbumRegularPriceInput(value: string | undefined | null): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const num = parseFloat(trimmed);
  if (!Number.isFinite(num) || num < MIN_ALBUM_REGULAR_PRICE) return null;
  return Math.round(num * 100) / 100;
}

export function isAlbumRegularPriceInputValid(value: string | undefined | null): boolean {
  return parseAlbumRegularPriceInput(value) != null;
}

/** Список пустых/незаполненных полей шага 1 (без alert — текст под полями в UI). */
export function getAlbumStep1InvalidFields(
  formData: AlbumFormData,
  opts?: {
    effectiveAllowDownloadSale?: 'no' | 'yes' | 'preorder';
    cover?: AlbumCoverStep1State;
  }
): AlbumStep1InvalidField[] {
  const saleMode = opts?.effectiveAllowDownloadSale ?? formData.allowDownloadSale;
  const out: AlbumStep1InvalidField[] = [];
  if (!formData.title?.trim()) out.push('title');
  if (!formData.releaseDate?.trim()) out.push('releaseDate');
  if (!formData.upcEan?.trim()) out.push('upcEan');
  if (!formData.description?.trim()) out.push('description');
  if (opts?.cover && !hasAlbumCoverForStep1(formData, opts.cover)) out.push('cover');
  if (saleMode !== 'no' && !isAlbumRegularPriceInputValid(formData.regularPrice)) {
    out.push('regularPrice');
  }
  if (saleMode === 'preorder' && !formData.preorderReleaseDate?.trim())
    out.push('preorderReleaseDate');
  return out;
}

export function isAlbumStep2GenreValid(formData: AlbumFormData): boolean {
  return (formData.genreCodes?.length ?? 0) > 0;
}

export function getAlbumStep4InvalidFields(formData: AlbumFormData): AlbumStep4InvalidField[] {
  const out: AlbumStep4InvalidField[] = [];
  if (!formData.albumCoverDesigner?.trim()) out.push('albumCoverDesigner');
  if (!formData.bandMembers || formData.bandMembers.length === 0) out.push('bandMembers');
  if (!formData.producer || formData.producer.length === 0) out.push('producer');
  return out;
}

/** Прокрутка прокручиваемой карточки модалки к элементу внутри формы. */
export function scrollEditAlbumModalToField(
  scrollRoot: HTMLElement | null | undefined,
  selector: string
): void {
  const root = scrollRoot ?? document.querySelector<HTMLElement>('.edit-album-modal__card');
  const target = root?.querySelector<HTMLElement>(selector);
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Скролл после показа ошибок валидации.
 * `waitForStepRender` — двойной rAF, когда сменился шаг и контент ещё монтируется.
 */
export function scheduleScrollEditAlbumModalToField(
  scrollRoot: HTMLElement | null | undefined,
  selector: string,
  opts?: { waitForStepRender?: boolean }
): void {
  const run = () => scrollEditAlbumModalToField(scrollRoot, selector);
  if (opts?.waitForStepRender) {
    requestAnimationFrame(() => requestAnimationFrame(run));
  } else {
    requestAnimationFrame(run);
  }
}

export function scrollToFirstAlbumStep1InvalidField(
  invalid: AlbumStep1InvalidField[],
  scrollRoot?: HTMLElement | null,
  opts?: { waitForStepRender?: boolean }
): void {
  const first = invalid[0];
  if (!first) return;
  scheduleScrollEditAlbumModalToField(scrollRoot, `[data-step1-field="${first}"]`, opts);
}

export function scrollToAlbumStep2GenreField(scrollRoot?: HTMLElement | null): void {
  scheduleScrollEditAlbumModalToField(scrollRoot, '[data-step2-field="genre"]');
}

export function scrollToFirstAlbumStep4InvalidField(
  invalid: AlbumStep4InvalidField[],
  scrollRoot?: HTMLElement | null
): void {
  const first = invalid[0];
  if (!first) return;
  scheduleScrollEditAlbumModalToField(scrollRoot, `[data-step4-field="${first}"]`);
}

export const transformFormDataToAlbumFormat = (
  formData: AlbumFormData,
  _lang: SupportedLang,
  ui?: IInterface,
  /**
   * Merged details (например `getAlbumDetailsForEdit(...).details`): id берутся по `kind`
   * из `classifyDetailBlockTitle(normalize(title))`, а не по заголовку только текущей локали.
   */
  existingDetails?: unknown[],
  options?: { hasYooKassaPayment?: boolean }
): {
  release: Record<string, string>;
  buttons: Record<string, string>;
  details: unknown[];
} => {
  // Конвертируем дату из формата DD/MM/YYYY в ISO формат YYYY-MM-DD для сохранения в БД
  const releaseDateISO = formatDateToISO(formData.releaseDate);

  // Базовый объект release с обязательными полями
  const release: Record<string, string> = {
    date: releaseDateISO,
    UPC: formData.upcEan,
  };

  const allowDownloadSale =
    options?.hasYooKassaPayment === false ? 'no' : formData.allowDownloadSale || 'no';

  // Сохраняем allowDownloadSale (всегда, даже если 'no')
  release.allowDownloadSale = allowDownloadSale;

  // Сохраняем preorderReleaseDate, если включен preorder
  if (allowDownloadSale === 'preorder' && formData.preorderReleaseDate) {
    const preorderDateISO = formatDateToISO(formData.preorderReleaseDate);
    if (preorderDateISO) {
      release.preorderReleaseDate = preorderDateISO;
    }
  }

  // Сохраняем цену (валюта всегда RUB — см. ALBUM_PRICE_CURRENCY)
  if (formData.regularPrice && formData.regularPrice.trim()) {
    release.regularPrice = formData.regularPrice.trim();
    release.currency = ALBUM_PRICE_CURRENCY;
  }

  /** Кредиты обложки (photographer/designer) — в `translations[lang]`, не в `release`. */

  /** Единые на альбом: жанры и теги в `release`, не в `details`. */
  if (formData.genreCodes?.length) {
    (release as Record<string, unknown>).genreCodes = formData.genreCodes
      .map((c) => String(c).trim())
      .filter(Boolean);
  }
  if (formData.tags?.length) {
    (release as Record<string, unknown>).tags = formData.tags
      .map((t) => String(t).trim())
      .filter(Boolean);
  }

  const buttons: Record<string, string> = {};

  formData.purchaseLinks.forEach((link) => {
    const purchaseKeyMap: Record<string, string> = {
      apple: 'itunes',
      bandcamp: 'bandcamp',
      amazon: 'amazon',
    };
    const key = purchaseKeyMap[link.service] || link.service;
    if (link.url) buttons[key] = link.url;
  });

  formData.streamingLinks.forEach((link) => {
    const streamingKeyMap: Record<string, string> = {
      applemusic: 'apple',
      vk: 'vk',
      youtube: 'youtube',
      spotify: 'spotify',
      yandex: 'yandex',
      deezer: 'deezer',
      tidal: 'tidal',
      googleplay: 'googleplay',
    };
    const key = streamingKeyMap[link.service] || link.service;
    if (link.url) buttons[key] = link.url;
  });

  const details: unknown[] = [];

  const { kindToId, maxId } = collectExistingDetailIdsByKind(existingDetails, ui);
  const usedIds = new Set<number>();
  const maxIdRef = { n: maxId };
  const takeId = (kind: DetailBlockKind) => takeDetailBlockId(kind, kindToId, usedIds, maxIdRef);

  const d = ui?.dashboard;

  if (formData.bandMembers.length > 0) {
    details.push({
      id: takeId('bandMembers'),
      title: d?.bandMembers ?? 'Band members',
      content: formData.bandMembers.map((m) => serializeBandMemberToContentItem(m)),
    });
  }

  if (formData.sessionMusicians.length > 0) {
    details.push({
      id: takeId('sessionMusicians'),
      title: d?.sessionMusicians ?? 'Session musicians',
      content: formData.sessionMusicians.map((m) => serializeBandMemberToContentItem(m)),
    });
  }

  // Добавляем Producer
  if (formData.producer && formData.producer.length > 0) {
    details.push({
      id: takeId('producing'),
      title: d?.producing ?? 'Producing',
      content: formData.producer.map((member) => serializeProducerToContentItem(member)),
    });
  }

  // Добавляем Mastering
  if (formData.mastering && formData.mastering.length > 0) {
    details.push({
      id: takeId('mastering'),
      title: d?.masteredBy ?? 'Mastered By',
      content: formData.mastering.map((entry) => serializeRecordingEntryToContentItem(entry)),
    });
  }

  // Добавляем Recorded At
  if (formData.recordedAt.length > 0) {
    details.push({
      id: takeId('recordedAt'),
      title: d?.recordedAt ?? 'Recorded At',
      content: formData.recordedAt.map((entry) => serializeRecordingEntryToContentItem(entry)),
    });
  }

  // Добавляем Mixed At
  if (formData.mixedAt.length > 0) {
    details.push({
      id: takeId('mixedAt'),
      title: d?.mixedAt ?? 'Mixed At',
      content: formData.mixedAt.map((entry) => serializeRecordingEntryToContentItem(entry)),
    });
  }

  return { release, buttons, details };
};

/** Снимок побочных полей модалки (не всё есть в AlbumFormData) для сравнения «есть ли введённые данные». */
export type AlbumDiscardAuxState = {
  tagInput: string;
  coverDraftKey: string | null;
  uploadStatus: 'idle' | 'uploading' | 'uploaded' | 'error';
  bandMemberName: string;
  bandMemberRole: string;
  bandMemberURL: string;
  editingBandMemberIndex: number | null;
  addBandMemberName: string;
  addBandMemberRole: string;
  addBandMemberURL: string;
  sessionMusicianName: string;
  sessionMusicianRole: string;
  sessionMusicianURL: string;
  editingSessionMusicianIndex: number | null;
  addSessionMusicianName: string;
  addSessionMusicianRole: string;
  addSessionMusicianURL: string;
  producerName: string;
  producerRole: string;
  producerURL: string;
  editingProducerIndex: number | null;
  addProducerName: string;
  addProducerRole: string;
  addProducerURL: string;
  addRecordedAtDraft: RecordingFormDraft;
  addMixedAtDraft: RecordingFormDraft;
  addMasteringDraft: RecordingFormDraft;
  editingPurchaseLink: number | null;
  purchaseLinkService: string;
  purchaseLinkUrl: string;
  editingStreamingLink: number | null;
  streamingLinkService: string;
  streamingLinkUrl: string;
};

export function makeEmptyDiscardAuxBaseline(): AlbumDiscardAuxState {
  const blank = (): RecordingFormDraft => ({ ...emptyRecordingFormDraft() });
  return {
    tagInput: '',
    coverDraftKey: null,
    uploadStatus: 'idle',
    bandMemberName: '',
    bandMemberRole: '',
    bandMemberURL: '',
    editingBandMemberIndex: null,
    addBandMemberName: '',
    addBandMemberRole: '',
    addBandMemberURL: '',
    sessionMusicianName: '',
    sessionMusicianRole: '',
    sessionMusicianURL: '',
    editingSessionMusicianIndex: null,
    addSessionMusicianName: '',
    addSessionMusicianRole: '',
    addSessionMusicianURL: '',
    producerName: '',
    producerRole: '',
    producerURL: '',
    editingProducerIndex: null,
    addProducerName: '',
    addProducerRole: '',
    addProducerURL: '',
    addRecordedAtDraft: blank(),
    addMixedAtDraft: blank(),
    addMasteringDraft: blank(),
    editingPurchaseLink: null,
    purchaseLinkService: '',
    purchaseLinkUrl: '',
    editingStreamingLink: null,
    streamingLinkService: '',
    streamingLinkUrl: '',
  };
}

/** Стабильная строка для сравнения «форма + шаг как при открытии». File в albumArt заменён на маркер. */
export function buildAlbumDiscardFingerprint(
  formData: AlbumFormData,
  currentStep: number,
  aux: AlbumDiscardAuxState
): string {
  const { albumArt, ...rest } = formData;
  return JSON.stringify({
    step: currentStep,
    form: {
      ...rest,
      albumArtPresence: albumArt instanceof File ? '__NEW_FILE__' : null,
    },
    aux,
  });
}
