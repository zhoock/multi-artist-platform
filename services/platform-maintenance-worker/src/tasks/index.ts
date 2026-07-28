import { gcOrphanAudioFilesTask } from './gcOrphanAudioFiles.js';
import {
  integrityCheckTask,
  rebuildMissingAssetsTask,
  regenerateStaleAssetsTask,
  retryFailedJobsTask,
} from './stubs.js';
import type { MaintenanceTask } from './types.js';

export const MAINTENANCE_TASKS: MaintenanceTask[] = [
  gcOrphanAudioFilesTask,
  retryFailedJobsTask,
  rebuildMissingAssetsTask,
  regenerateStaleAssetsTask,
  integrityCheckTask,
];

export function getMaintenanceTask(id: string): MaintenanceTask | undefined {
  return MAINTENANCE_TASKS.find((task) => task.id === id);
}

export const DEFAULT_MAINTENANCE_TASK_IDS = MAINTENANCE_TASKS.filter((t) => t.enabled).map(
  (t) => t.id
);
