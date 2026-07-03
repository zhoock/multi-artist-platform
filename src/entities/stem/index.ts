// src/entities/stem/index.ts
export {
  STEM_CATEGORIES,
  STEMS_MANIFEST_VERSION,
  type StemCategory,
  type StemMeta,
  type StemsManifest,
} from './model/types';
export { resolveCategoryIcon, getCategoryLabel, isStemCategory, StemIcon } from './lib/category';
export {
  getStemsFolderPath,
  getStemStoragePath,
  getStemAudioUrl,
  uploadStemAudio,
  saveStemsManifest,
  deleteStemFile,
  loadStems,
  updateStemsVisibility,
  type LoadStemsResult,
} from './api/manifest';
