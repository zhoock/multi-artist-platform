import { describe, expect, test } from '@jest/globals';
import { createInMemoryStemAudioPersistStore } from '../stemAudioPersistStore';

describe('createInMemoryStemAudioPersistStore', () => {
  test('LRU eviction frees space for newer entry', async () => {
    const store = createInMemoryStemAudioPersistStore({ maxBytes: 10 });
    const mk = (fill: number) => new Uint8Array(4).fill(fill).buffer;

    await store.put('a', mk(1));
    await store.put('b', mk(2));
    expect(store.getTotalBytes()).toBe(8);
    expect(store.has('a')).toBe(true);
    expect(store.has('b')).toBe(true);

    await store.get('b');
    await store.put('c', mk(3));

    expect(store.has('a')).toBe(false);
    expect(store.has('b')).toBe(true);
    expect(store.has('c')).toBe(true);
    expect(store.getTotalBytes()).toBe(8);
  });
});
