import {
  isPipelineManagedAudioStoragePath,
  normalizeStoragePath,
} from '../../../../src/shared/lib/tracks/storagePathReference.js';
import { loadReferencedAudioStoragePaths } from '../lib/db.js';
import { listAllFilePathsRecursive, removeStoragePaths } from '../lib/storage.js';
import type { MaintenanceTask, MaintenanceTaskResult } from './types.js';

function findOrphanPaths(bucketPaths: string[], referenced: Set<string>): string[] {
  const orphans: string[] = [];
  for (const rawPath of bucketPaths) {
    const path = normalizeStoragePath(rawPath);
    if (!isPipelineManagedAudioStoragePath(path)) continue;
    if (!referenced.has(path)) {
      orphans.push(path);
    }
  }
  return orphans.sort();
}

export const gcOrphanAudioFilesTask: MaintenanceTask = {
  id: 'gc-orphan-audio-files',
  description: 'Remove unreferenced master/derived audio files from user-media storage',
  enabled: true,
  async run(ctx): Promise<MaintenanceTaskResult> {
    try {
      const referenced = await loadReferencedAudioStoragePaths();
      ctx.log('Loaded referenced audio paths', { count: referenced.size });

      const bucketPaths = await listAllFilePathsRecursive(ctx.supabase, 'users');
      const pipelinePaths = bucketPaths.filter((p) => isPipelineManagedAudioStoragePath(p));
      const orphans = findOrphanPaths(pipelinePaths, referenced);

      ctx.log('Scanned pipeline audio paths', {
        bucketPipelineFiles: pipelinePaths.length,
        orphanCandidates: orphans.length,
      });

      if (orphans.length === 0) {
        return {
          taskId: 'gc-orphan-audio-files',
          status: 'completed',
          summary: { referenced: referenced.size, scanned: pipelinePaths.length, removed: 0 },
        };
      }

      if (ctx.dryRun) {
        ctx.log('Dry run — would remove orphans', {
          sample: orphans.slice(0, 20),
          total: orphans.length,
        });
        return {
          taskId: 'gc-orphan-audio-files',
          status: 'completed',
          summary: {
            referenced: referenced.size,
            scanned: pipelinePaths.length,
            wouldRemove: orphans.length,
            sample: orphans.slice(0, 20),
            dryRun: true,
          },
        };
      }

      const removed = await removeStoragePaths(orphans);
      ctx.log('Removed orphan audio files', { removed });

      return {
        taskId: 'gc-orphan-audio-files',
        status: 'completed',
        summary: {
          referenced: referenced.size,
          scanned: pipelinePaths.length,
          removed,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        taskId: 'gc-orphan-audio-files',
        status: 'failed',
        summary: {},
        error: message,
      };
    }
  },
};
