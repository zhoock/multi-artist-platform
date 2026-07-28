import type { MaintenanceTask } from './types.js';

/** Placeholder tasks for future platform maintenance (disabled until implemented). */
export const retryFailedJobsTask: MaintenanceTask = {
  id: 'retry-failed-jobs',
  description: 'Re-enqueue tracks with processing_status = failed',
  enabled: false,
  async run() {
    return {
      taskId: 'retry-failed-jobs',
      status: 'skipped',
      summary: { reason: 'not implemented' },
    };
  },
};

export const rebuildMissingAssetsTask: MaintenanceTask = {
  id: 'rebuild-missing-assets',
  description: 'Enqueue processing for tracks missing required derived assets',
  enabled: false,
  async run() {
    return {
      taskId: 'rebuild-missing-assets',
      status: 'skipped',
      summary: { reason: 'not implemented' },
    };
  },
};

export const regenerateStaleAssetsTask: MaintenanceTask = {
  id: 'regenerate-stale-assets',
  description: 'Bulk-regenerate assets where generator_version is outdated',
  enabled: false,
  async run() {
    return {
      taskId: 'regenerate-stale-assets',
      status: 'skipped',
      summary: { reason: 'not implemented' },
    };
  },
};

export const integrityCheckTask: MaintenanceTask = {
  id: 'integrity-check',
  description: 'Verify DB references point to existing storage objects',
  enabled: false,
  async run() {
    return {
      taskId: 'integrity-check',
      status: 'skipped',
      summary: { reason: 'not implemented' },
    };
  },
};
