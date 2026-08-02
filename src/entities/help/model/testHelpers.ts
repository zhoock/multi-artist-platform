import type { HelpLangState } from '../model/types';

export function createEmptyHelpLangState(): HelpLangState {
  return {
    catalog: { status: 'idle', error: null, data: null, lastUpdated: null },
    articlesBySlug: {},
  };
}

export function createEmptyHelpState() {
  return {
    en: createEmptyHelpLangState(),
    ru: createEmptyHelpLangState(),
  };
}
