import { runFfprobe } from '../../processors/ffmpegTranscoder.js';
import { pipelineTrace, type PipelineTraceContext } from '../../lib/pipelineTrace.js';
import type { PipelineStage } from '../types.js';

export const extractMetadataStage: PipelineStage = {
  stageId: 'extract-metadata',
  async run(ctx) {
    const trace: PipelineTraceContext = {
      trackDbId: ctx.trackDbId,
      trackId: ctx.trackId,
    };
    pipelineTrace('extract-metadata entered', { masterLocalPath: ctx.masterLocalPath }, trace);
    ctx.masterProbe = await runFfprobe(ctx.masterLocalPath);
    pipelineTrace(
      'extract-metadata completed',
      {
        duration: ctx.masterProbe.duration,
        codec: ctx.masterProbe.codec,
        sampleRate: ctx.masterProbe.sampleRate,
      },
      trace
    );
    return ctx;
  },
};
