/** Shared stem Storage path helpers (client-safe path shape, no secrets). */

export {
  STEM_PLAYBACK_EXTENSION,
  buildStemMasterStoragePath,
  buildStemPlaybackFileName,
  getStemStoragePath,
  getStemsFolderPath,
} from '../../../src/shared/lib/stems/stemStoragePaths';

export const STEMS_MANIFEST_FILE = 'stems.json';
