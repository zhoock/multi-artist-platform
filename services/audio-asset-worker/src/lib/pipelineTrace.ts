/**
 * Detailed pipeline tracing for local debugging.
 * Set AUDIO_PIPELINE_TRACE=0 to disable.
 */

export type PipelineTraceContext = {
  trackDbId: string;
  trackId: string;
};

export function isPipelineTraceEnabled(): boolean {
  return process.env.AUDIO_PIPELINE_TRACE !== '0';
}

export function pipelineTrace(
  step: string,
  details?: Record<string, unknown>,
  ctx?: PipelineTraceContext
): void {
  if (!isPipelineTraceEnabled()) return;

  const prefix = ctx
    ? `[pipeline-trace] track=${ctx.trackId} dbId=${ctx.trackDbId}`
    : '[pipeline-trace]';
  if (details && Object.keys(details).length > 0) {
    console.log(`${prefix} ${step}`, details);
  } else {
    console.log(`${prefix} ${step}`);
  }
}

export function pipelineTraceWarn(
  step: string,
  details?: Record<string, unknown>,
  ctx?: PipelineTraceContext
): void {
  if (!isPipelineTraceEnabled()) return;

  const prefix = ctx
    ? `[pipeline-trace] track=${ctx.trackId} dbId=${ctx.trackDbId}`
    : '[pipeline-trace]';
  if (details && Object.keys(details).length > 0) {
    console.warn(`${prefix} ${step}`, details);
  } else {
    console.warn(`${prefix} ${step}`);
  }
}
