/**
 * Home / Universe3D artist card Play — dedupe + starting slug for UI feedback.
 */

export type RunHomeArtistPlayClickInput = {
  publicSlug: string | undefined | null;
  getInflight: () => Promise<boolean> | null;
  setInflight: (promise: Promise<boolean> | null) => void;
  setStartingSlug: (slug: string | null) => void;
  startPlayback: () => Promise<{ ok: boolean }>;
  onSuccess: () => void;
};

export async function runHomeArtistPlayClick(input: RunHomeArtistPlayClickInput): Promise<boolean> {
  const slug = input.publicSlug?.trim();
  if (!slug) return false;

  const existing = input.getInflight();
  if (existing) {
    return existing;
  }

  input.setStartingSlug(slug);

  const run = (async (): Promise<boolean> => {
    try {
      const result = await input.startPlayback();
      if (!result.ok) {
        input.setStartingSlug(null);
        return false;
      }
      input.onSuccess();
      return true;
    } catch {
      input.setStartingSlug(null);
      return false;
    }
  })();

  input.setInflight(run);
  try {
    return await run;
  } finally {
    if (input.getInflight() === run) {
      input.setInflight(null);
    }
  }
}
