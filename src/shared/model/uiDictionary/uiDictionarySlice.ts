import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { getJSON } from '@shared/api/http';
import type { SupportedLang } from '@shared/model/lang';
import type { IInterface } from '@models';
import type { RootState } from '@shared/model/appStore/types';
import { createInitialLangState, createLangExtraReducers } from '@shared/lib/redux/createLangSlice';

import type { UiDictionaryState } from './types';
import {
  INVALID_UI_DICTIONARY_MESSAGE,
  isValidUiDictionaryPayload,
} from './validateUiDictionaryPayload';

const initialState: UiDictionaryState = createInitialLangState<IInterface[]>([]);

export { INVALID_UI_DICTIONARY_MESSAGE } from './validateUiDictionaryPayload';

export const fetchUiDictionary = createAsyncThunk<
  IInterface[],
  { lang: SupportedLang },
  { rejectValue: string; state: RootState }
>(
  'uiDictionary/fetchByLang',
  async ({ lang }, { signal, rejectWithValue }) => {
    try {
      const dictionary = await getJSON<unknown>(`${lang}.json`, signal);
      if (!isValidUiDictionaryPayload(dictionary)) {
        return rejectWithValue(INVALID_UI_DICTIONARY_MESSAGE);
      }
      return dictionary;
    } catch (error) {
      if (error instanceof Error) {
        return rejectWithValue(error.message);
      }
      return rejectWithValue('Unknown error');
    }
  },
  {
    condition: ({ lang }, { getState }) => {
      const state = getState();
      const entry = state.uiDictionary[lang];
      // Не запускаем, если уже загружается или уже загружено
      if (entry.status === 'loading' || entry.status === 'succeeded') {
        return false;
      }
      return true;
    },
  }
);

const uiDictionarySlice = createSlice({
  name: 'uiDictionary',
  initialState,
  reducers: {},
  extraReducers: createLangExtraReducers(fetchUiDictionary, 'Failed to fetch UI dictionary'),
});

export const uiDictionaryReducer = uiDictionarySlice.reducer;
