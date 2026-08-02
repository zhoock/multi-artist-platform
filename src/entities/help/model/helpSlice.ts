import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { getJSON } from '@shared/api/http';
import type { SupportedLang } from '@shared/model/lang';
import type { RootState } from '@shared/model/appStore/types';

import { helpArticleAssetPath, helpCatalogAssetPath } from '../lib/helpAssetPaths';
import type {
  HelpArticle,
  HelpArticleEntry,
  HelpArticleSlug,
  HelpCatalog,
  HelpLangState,
  HelpState,
} from './types';

function emptyArticleEntry(): HelpArticleEntry {
  return { status: 'idle', error: null, data: null };
}

function emptyLangState(): HelpLangState {
  return {
    catalog: { status: 'idle', error: null, data: null, lastUpdated: null },
    articlesBySlug: {},
  };
}

const initialState: HelpState = {
  en: emptyLangState(),
  ru: emptyLangState(),
};

export const fetchHelpCatalog = createAsyncThunk<
  HelpCatalog,
  { lang: SupportedLang },
  { rejectValue: string; state: RootState }
>(
  'help/fetchCatalog',
  async ({ lang }, { signal, rejectWithValue }) => {
    try {
      return await getJSON<HelpCatalog>(helpCatalogAssetPath(lang), signal);
    } catch (error) {
      if (error instanceof Error) {
        return rejectWithValue(error.message);
      }
      return rejectWithValue('Unknown error');
    }
  },
  {
    condition: ({ lang }, { getState }) => {
      const entry = getState().help[lang].catalog;
      return entry.status !== 'loading' && entry.status !== 'succeeded';
    },
  }
);

export const fetchHelpArticle = createAsyncThunk<
  HelpArticle,
  { lang: SupportedLang; slug: HelpArticleSlug },
  { rejectValue: string; state: RootState }
>(
  'help/fetchArticle',
  async ({ lang, slug }, { signal, rejectWithValue }) => {
    try {
      return await getJSON<HelpArticle>(helpArticleAssetPath(slug, lang), signal);
    } catch (error) {
      if (error instanceof Error) {
        return rejectWithValue(error.message);
      }
      return rejectWithValue('Unknown error');
    }
  },
  {
    condition: ({ lang, slug }, { getState }) => {
      const entry = getState().help[lang].articlesBySlug[slug];
      return !entry || (entry.status !== 'loading' && entry.status !== 'succeeded');
    },
  }
);

const helpSlice = createSlice({
  name: 'help',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchHelpCatalog.pending, (state, action) => {
        const { lang } = action.meta.arg;
        state[lang].catalog.status = 'loading';
        state[lang].catalog.error = null;
      })
      .addCase(fetchHelpCatalog.fulfilled, (state, action) => {
        const { lang } = action.meta.arg;
        state[lang].catalog.status = 'succeeded';
        state[lang].catalog.data = action.payload;
        state[lang].catalog.lastUpdated = Date.now();
        state[lang].catalog.error = null;
      })
      .addCase(fetchHelpCatalog.rejected, (state, action) => {
        const { lang } = action.meta.arg;
        state[lang].catalog.status = 'failed';
        state[lang].catalog.error = action.payload ?? 'Failed to fetch help catalog';
      })
      .addCase(fetchHelpArticle.pending, (state, action) => {
        const { lang, slug } = action.meta.arg;
        const current = state[lang].articlesBySlug[slug] ?? emptyArticleEntry();
        state[lang].articlesBySlug[slug] = {
          ...current,
          status: 'loading',
          error: null,
        };
      })
      .addCase(fetchHelpArticle.fulfilled, (state, action) => {
        const { lang, slug } = action.meta.arg;
        state[lang].articlesBySlug[slug] = {
          status: 'succeeded',
          error: null,
          data: action.payload,
        };
      })
      .addCase(fetchHelpArticle.rejected, (state, action) => {
        const { lang, slug } = action.meta.arg;
        state[lang].articlesBySlug[slug] = {
          status: 'failed',
          error: action.payload ?? 'Failed to fetch help article',
          data: null,
        };
      });
  },
});

export const helpReducer = helpSlice.reducer;
