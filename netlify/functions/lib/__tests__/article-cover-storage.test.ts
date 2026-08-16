import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { removeArticleCoverVariantsByImgKey } from '../article-cover-storage';
import { extractBaseName } from '../image-processor';

const USER_ID = '8e998d76-1131-42ec-b26e-ef18603d8cec';
const OLD_BASE = 'article_cover_old_uuid_photo';
const OLD_KEY = `${OLD_BASE}.jpg`;

function createMockSupabase(existingNames: string[]) {
  const removed: string[][] = [];

  const supabase = {
    storage: {
      from: jest.fn(() => ({
        list: jest.fn(async () => ({
          data: existingNames.map((name) => ({ name })),
          error: null,
        })),
        remove: jest.fn(async (paths: string[]) => {
          removed.push(paths);
          return { error: null };
        }),
      })),
    },
  };

  return { supabase: supabase as never, removed };
}

describe('removeArticleCoverVariantsByImgKey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('removes all variants matching old baseName', async () => {
    const variantNames = [
      `${OLD_BASE}-128.webp`,
      `${OLD_BASE}-128.jpg`,
      `${OLD_BASE}-448.webp`,
      `${OLD_BASE}-448.jpg`,
      `${OLD_BASE}-896.webp`,
      `${OLD_BASE}-896.jpg`,
      `${OLD_BASE}-1344.webp`,
      `${OLD_BASE}-1344.jpg`,
      'article_cover_other_uuid_photo-448.webp',
    ];

    const { supabase, removed } = createMockSupabase(variantNames);
    const deleted = await removeArticleCoverVariantsByImgKey(supabase, USER_ID, OLD_KEY);

    expect(deleted).toHaveLength(8);
    expect(removed.flat()).toHaveLength(8);
    for (const name of variantNames.slice(0, 8)) {
      expect(removed.flat()).toContain(`users/${USER_ID}/articles/${name}`);
    }
    expect(removed.flat()).not.toContain(
      `users/${USER_ID}/articles/article_cover_other_uuid_photo-448.webp`
    );
  });

  test('ignores non article_cover keys', async () => {
    const { supabase, removed } = createMockSupabase([`${OLD_BASE}-448.webp`]);
    const deleted = await removeArticleCoverVariantsByImgKey(supabase, USER_ID, 'legacy_cover.jpg');
    expect(deleted).toEqual([]);
    expect(removed).toHaveLength(0);
  });

  test('extractBaseName groups variant files under same cover', () => {
    expect(extractBaseName(`${OLD_BASE}-896.webp`)).toBe(OLD_BASE);
    expect(extractBaseName(`${OLD_BASE}-320.webp`)).toBe(OLD_BASE);
  });
});
