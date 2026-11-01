import {
  beginQualifiedPlaySession,
  onQualifiedPlayPause,
  onQualifiedPlayPlaying,
  onQualifiedPlayWaiting,
  resetQualifiedPlaySession,
  restartQualifiedPlaySessionForSameTrack,
  tickQualifiedPlayAccumulation,
} from '@features/player/model/lib/qualifiedPlayTracker';

describe('qualifiedPlayTracker integration', () => {
  beforeEach(() => {
    resetQualifiedPlaySession();
    jest.restoreAllMocks();
  });

  function startSession() {
    beginQualifiedPlaySession({
      albumSlug: 'album-a',
      logicalTrackId: '1',
      trackDurationSeconds: 200,
      artistUserId: 'artist-1',
    });
  }

  test('does not send before threshold', () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
    } as Response);

    startSession();
    tickQualifiedPlayAccumulation(1, 1, true);
    tickQualifiedPlayAccumulation(2, 1, true);
    tickQualifiedPlayAccumulation(10, 1, true);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('waiting (buffering) prevents qualification on a long jump', () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    startSession();
    tickQualifiedPlayAccumulation(5, 1, true);
    onQualifiedPlayWaiting(5);
    tickQualifiedPlayAccumulation(40, 1, true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('pause then resume can still qualify', () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    startSession();

    for (let t = 1; t <= 15; t += 1) {
      tickQualifiedPlayAccumulation(t, 1, true);
    }
    onQualifiedPlayPause(15);
    tickQualifiedPlayAccumulation(15, 1, false);

    onQualifiedPlayPlaying(15);
    for (let t = 16; t <= 35; t += 1) {
      tickQualifiedPlayAccumulation(t, 1, true);
    }

    expect(fetchMock).toHaveBeenCalled();
  });

  test('repeat one restart sends a second event with a new session id', async () => {
    const bodies: Array<{ playbackSessionId?: string }> = [];
    jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      bodies.push(
        JSON.parse(String((init as RequestInit)?.body)) as { playbackSessionId?: string }
      );
      return { ok: true } as Response;
    });

    startSession();
    for (let t = 1; t <= 35; t += 1) {
      tickQualifiedPlayAccumulation(t, 1, true);
    }
    await Promise.resolve();
    restartQualifiedPlaySessionForSameTrack();
    for (let t = 1; t <= 35; t += 1) {
      tickQualifiedPlayAccumulation(t, 1, true);
    }
    await Promise.resolve();

    expect(bodies.length).toBe(2);
    expect(bodies[0]?.playbackSessionId).not.toBe(bodies[1]?.playbackSessionId);
  });
});
