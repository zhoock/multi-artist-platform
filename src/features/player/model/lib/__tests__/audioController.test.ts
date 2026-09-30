import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { audioController } from '../audioController';

describe('audioController.ensureElementInDocument', () => {
  beforeEach(() => {
    document.querySelectorAll('[data-player-audio-mount]').forEach((node) => node.remove());
  });

  afterEach(() => {
    document.querySelectorAll('[data-player-audio-mount]').forEach((node) => node.remove());
  });

  test('attaches singleton audio element to a persistent hidden host on body', () => {
    audioController.ensureElementInDocument();

    const host = document.querySelector('[data-player-audio-mount]');
    expect(host).toBeTruthy();
    expect(host?.contains(audioController.element)).toBe(true);
    expect(document.body.contains(audioController.element)).toBe(true);
  });

  test('is idempotent and keeps the same element in the host', () => {
    audioController.ensureElementInDocument();
    const el = audioController.element;
    audioController.ensureElementInDocument();

    const host = document.querySelector('[data-player-audio-mount]');
    expect(host?.contains(el)).toBe(true);
    expect(host?.querySelectorAll('audio').length).toBe(1);
  });
});
