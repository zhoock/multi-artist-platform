import { getPool } from './lib/db.js';
import { createSupabaseAdminClient } from './lib/storage.js';
import { DEFAULT_MAINTENANCE_TASK_IDS, getMaintenanceTask } from './tasks/index.js';
import type { MaintenanceRunReport, MaintenanceTaskContext } from './tasks/types.js';

export interface RunMaintenanceOptions {
  taskIds?: string[];
  dryRun?: boolean;
}

export async function runMaintenance(
  options: RunMaintenanceOptions = {}
): Promise<MaintenanceRunReport> {
  const startedAt = new Date().toISOString();
  const dryRun = options.dryRun !== false;
  const taskIds = options.taskIds?.length ? options.taskIds : DEFAULT_MAINTENANCE_TASK_IDS;

  const db = getPool();
  const supabase = createSupabaseAdminClient();

  const log = (message: string, data?: Record<string, unknown>) => {
    console.log(`[maintenance] ${message}`, data ?? {});
  };

  const ctx: MaintenanceTaskContext = { db, supabase, dryRun, log };
  const tasks = [];

  for (const taskId of taskIds) {
    const task = getMaintenanceTask(taskId);
    if (!task) {
      tasks.push({
        taskId,
        status: 'failed' as const,
        summary: {},
        error: `Unknown task: ${taskId}`,
      });
      continue;
    }

    if (!task.enabled) {
      tasks.push({
        taskId: task.id,
        status: 'skipped' as const,
        summary: { reason: 'disabled' },
      });
      continue;
    }

    log(`Running task: ${task.id}`);
    const result = await task.run(ctx);
    tasks.push(result);
    log(`Task finished: ${task.id}`, { status: result.status, summary: result.summary });
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun,
    tasks,
  };
}
