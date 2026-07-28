import type { SupabaseClient } from '@supabase/supabase-js';
import type pg from 'pg';

export interface MaintenanceTaskContext {
  db: pg.Pool;
  supabase: SupabaseClient;
  dryRun: boolean;
  log: (message: string, data?: Record<string, unknown>) => void;
}

export interface MaintenanceTaskResult {
  taskId: string;
  status: 'completed' | 'skipped' | 'failed';
  summary: Record<string, unknown>;
  error?: string;
}

export interface MaintenanceTask {
  id: string;
  description: string;
  enabled: boolean;
  run(ctx: MaintenanceTaskContext): Promise<MaintenanceTaskResult>;
}

export interface MaintenanceRunReport {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  tasks: MaintenanceTaskResult[];
}
