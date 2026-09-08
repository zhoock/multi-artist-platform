/**
 * P1-7 Chain 2 — album cover save orchestration (EditAlbumModal utils).
 */

import { describe, expect, test } from '@jest/globals';
import { extractCommittedCoverBaseName, planAlbumCoverForSave } from '../EditAlbumModal.utils';

describe('planAlbumCoverForSave', () => {
  test('Test 7 — unchanged cover: no commit when no draft and no staged baseName', () => {
    expect(planAlbumCoverForSave(null, null)).toEqual({ action: 'none' });
  });

  test('Test 3 — retry after DB failure reuses staged committed baseName without re-commit', () => {
    const staged = 'album_cover_abc123_artist-Cover-album';
    expect(planAlbumCoverForSave(null, staged)).toEqual({
      action: 'useCommitted',
      baseName: staged,
    });
    expect(planAlbumCoverForSave('user/albums/x/draft-cover', staged)).toEqual({
      action: 'useCommitted',
      baseName: staged,
    });
  });

  test('first save commits draft when no staged cover exists', () => {
    const draftKey = 'user-id/albums/my-album/draft-cover';
    expect(planAlbumCoverForSave(draftKey, null)).toEqual({
      action: 'commitDraft',
      draftKey,
    });
  });

  test('new upload clears staged path by passing null committed ref at call site', () => {
    expect(planAlbumCoverForSave('user/albums/x/draft-cover', null)).toEqual({
      action: 'commitDraft',
      draftKey: 'user/albums/x/draft-cover',
    });
  });
});

describe('extractCommittedCoverBaseName', () => {
  test('prefers explicit baseName from commit-cover response', () => {
    expect(
      extractCommittedCoverBaseName({
        baseName: 'album_cover_xyz_artist-Cover-album',
        storagePath: 'users/u/albums/other-448.webp',
      })
    ).toBe('album_cover_xyz_artist-Cover-album');
  });

  test('falls back to storagePath suffix stripping', () => {
    expect(
      extractCommittedCoverBaseName({
        storagePath: 'users/u/albums/album_cover_xyz_artist-Cover-album-448.webp',
      })
    ).toBe('album_cover_xyz_artist-Cover-album');
  });
});

describe('album cover save orchestration (commit → DB fail → retry)', () => {
  test('Test 2/3/4 — DB failure keeps staged baseName; retry skips commitCover', async () => {
    const commitCoverCalls: string[] = [];
    const committedCoverBaseNameRef = { current: null as string | null };
    let coverDraftKey: string | null = 'user/albums/new/draft-cover';

    const mockCommitCover = async (draftKey: string) => {
      commitCoverCalls.push(draftKey);
      committedCoverBaseNameRef.current = 'album_cover_new_uuid_artist-Cover-album';
      coverDraftKey = null;
      return {
        success: true as const,
        data: {
          baseName: committedCoverBaseNameRef.current,
          url: 'https://cdn.example/cover.webp',
          storagePath: `users/u/albums/${committedCoverBaseNameRef.current}-448.webp`,
          variants: [],
        },
      };
    };

    const mockDbSave = async (cover?: string) => {
      if (!cover) throw new Error('missing cover');
      return { ok: true };
    };

    async function runSaveAttempt(): Promise<void> {
      const plan = planAlbumCoverForSave(coverDraftKey, committedCoverBaseNameRef.current);
      let newCover: string | undefined;

      if (plan.action === 'useCommitted') {
        newCover = plan.baseName;
      } else if (plan.action === 'commitDraft') {
        const result = await mockCommitCover(plan.draftKey);
        if (result.success && result.data) {
          const baseName = extractCommittedCoverBaseName(result.data);
          if (baseName) {
            newCover = baseName;
            committedCoverBaseNameRef.current = baseName;
            coverDraftKey = null;
          }
        }
      }

      await mockDbSave(newCover);
      committedCoverBaseNameRef.current = null;
    }

    async function runSaveAttemptDbFailsFirst(): Promise<void> {
      const plan = planAlbumCoverForSave(coverDraftKey, committedCoverBaseNameRef.current);
      let newCover: string | undefined;

      if (plan.action === 'useCommitted') {
        newCover = plan.baseName;
      } else if (plan.action === 'commitDraft') {
        const result = await mockCommitCover(plan.draftKey);
        if (result.success && result.data) {
          const baseName = extractCommittedCoverBaseName(result.data);
          if (baseName) {
            newCover = baseName;
            committedCoverBaseNameRef.current = baseName;
            coverDraftKey = null;
          }
        }
      }

      throw new Error('DB save failed');
    }

    await expect(runSaveAttemptDbFailsFirst()).rejects.toThrow('DB save failed');
    expect(commitCoverCalls).toHaveLength(1);
    expect(committedCoverBaseNameRef.current).toBe('album_cover_new_uuid_artist-Cover-album');
    expect(coverDraftKey).toBeNull();

    await runSaveAttempt();
    expect(commitCoverCalls).toHaveLength(1);
    expect(committedCoverBaseNameRef.current).toBeNull();
  });
});
