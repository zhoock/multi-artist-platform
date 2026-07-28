import { runFfprobe } from '../../processors/ffmpegTranscoder.js';
import type { PipelineStage } from '../types.js';

export const extractMetadataStage: PipelineStage = {
  stageId: 'extract-metadata',
  async run(ctx) {
    ctx.masterProbe = await runFfprobe(ctx.masterLocalPath);
    return ctx;
  },
};
