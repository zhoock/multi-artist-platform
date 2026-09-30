/**
 * A playback-ready track is not transcoded again unless the caller forces it
 * or the job only refreshes optional assets (waveform).
 */
export function shouldSkipReadyTrackReprocess(input: {
  processingStatus: string | null | undefined;
  optionalOnly: boolean;
  force?: boolean;
}): boolean {
  return input.processingStatus === 'ready' && !input.optionalOnly && input.force !== true;
}
