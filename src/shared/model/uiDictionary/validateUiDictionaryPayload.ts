import type { IInterface } from '@models';

export const INVALID_UI_DICTIONARY_MESSAGE = 'Invalid UI dictionary';

export function isValidUiDictionaryPayload(value: unknown): value is IInterface[] {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  const first = value[0];
  return typeof first === 'object' && first !== null && !Array.isArray(first);
}
