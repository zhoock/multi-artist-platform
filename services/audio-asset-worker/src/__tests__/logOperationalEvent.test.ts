import { logOperationalEvent } from '../lib/logOperationalEvent.js';

describe('logOperationalEvent', () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('writes JSON to console.error by default', () => {
    logOperationalEvent({
      event: 'test_event',
      trackId: 't1',
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(parsed.event).toBe('test_event');
    expect(parsed.trackId).toBe('t1');
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('writes JSON to console.warn when level is warn', () => {
    logOperationalEvent({
      event: 'test_warn',
      level: 'warn',
    });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
