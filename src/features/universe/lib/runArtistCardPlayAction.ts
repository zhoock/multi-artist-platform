import {
  isArtistCardPlayResume,
  resolveArtistCardPlayButtonPhase,
} from './artistCardPlayButtonPhase';
import { runHomeArtistPlayClick, type RunHomeArtistPlayClickInput } from './runHomeArtistPlayClick';

export type RunArtistCardPlayActionInput = {
  publicSlug: string | undefined | null;
  readPlayerSnapshot: () => {
    startingArtistSlug: string | null;
    activeArtistSlug: string | null;
    isPlaying: boolean;
    hasActiveQueue: boolean;
  };
  getInflight: () => Promise<boolean> | null;
  setInflight: (promise: Promise<boolean> | null) => void;
  setStartingSlug: (slug: string | null) => void;
  pausePlayback: () => void;
  resumePlayback: () => void;
  startArtistPlay: () => Promise<{ ok: boolean }>;
  onArtistPlaySuccess: () => void;
};

export async function runArtistCardPlayAction(
  input: RunArtistCardPlayActionInput
): Promise<boolean> {
  const slug = input.publicSlug?.trim();
  if (!slug) return false;

  const snapshot = input.readPlayerSnapshot();
  const phase = resolveArtistCardPlayButtonPhase({
    cardArtistSlug: slug,
    ...snapshot,
  });

  if (phase === 'starting') {
    const existing = input.getInflight();
    return existing ?? false;
  }

  if (phase === 'pause') {
    input.pausePlayback();
    return true;
  }

  if (isArtistCardPlayResume(slug, snapshot)) {
    input.resumePlayback();
    return true;
  }

  const homeInput: RunHomeArtistPlayClickInput = {
    publicSlug: slug,
    getInflight: input.getInflight,
    setInflight: input.setInflight,
    setStartingSlug: input.setStartingSlug,
    startPlayback: input.startArtistPlay,
    onSuccess: input.onArtistPlaySuccess,
  };

  return runHomeArtistPlayClick(homeInput);
}
