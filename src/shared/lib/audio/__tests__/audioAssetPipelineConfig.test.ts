import {
  getGeneratorsForStageIds,
  getPlaybackRequiredOutputs,
  getStageIdsForGenerator,
  isOptionalOnlyGenerator,
  isOptionalOnlyPipelineRun,
  isPlaybackRequiredAsset,
  OPTIONAL_ONLY_PIPELINE_STAGE_IDS,
  resolveRegenerateStagesForGenerator,
} from '../audioAssetPipelineConfig';

describe('audioAssetPipelineConfig playback tier', () => {
  it('marks stream as playback-required and waveform as optional', () => {
    expect(isPlaybackRequiredAsset('stream', 'opus', '128k')).toBe(true);
    expect(isPlaybackRequiredAsset('waveform', 'json', 'default')).toBe(false);
  });

  it('lists only playback-required outputs', () => {
    const required = getPlaybackRequiredOutputs();
    expect(required.some((o) => o.type === 'stream')).toBe(true);
    expect(required.some((o) => o.type === 'waveform')).toBe(false);
  });

  it('detects optional-only pipeline runs', () => {
    expect(OPTIONAL_ONLY_PIPELINE_STAGE_IDS).toContain('generate-waveform');
    expect(isOptionalOnlyPipelineRun(['generate-waveform'])).toBe(true);
    expect(isOptionalOnlyPipelineRun(['generate-audio-streams', 'generate-waveform'])).toBe(false);
  });

  it('resolves stages and optional tier by generator (not waveform-specific)', () => {
    expect(getStageIdsForGenerator('waveform')).toEqual(['generate-waveform']);
    expect(getStageIdsForGenerator('ffmpeg-opus')).toEqual(['generate-audio-streams']);
    expect(isOptionalOnlyGenerator('waveform')).toBe(true);
    expect(isOptionalOnlyGenerator('ffmpeg-opus')).toBe(false);
    expect(resolveRegenerateStagesForGenerator('waveform')).toEqual(['generate-waveform']);
    expect(resolveRegenerateStagesForGenerator(undefined)).toBeUndefined();
    expect(getGeneratorsForStageIds(['generate-waveform'])).toEqual(['waveform']);
    expect(getGeneratorsForStageIds(['generate-audio-streams'])).toEqual(['ffmpeg-opus']);
  });
});
