import { resolveDetailCaption } from '../resolveDetailCaption';

describe('resolveDetailCaption', () => {
  it('prefers caption over legacy alt', () => {
    expect(resolveDetailCaption({ caption: ' New ', alt: 'Old' })).toBe('New');
  });

  it('falls back to alt when caption is empty', () => {
    expect(resolveDetailCaption({ caption: '  ', alt: 'Legacy alt' })).toBe('Legacy alt');
  });

  it('returns undefined when both are empty', () => {
    expect(resolveDetailCaption({})).toBeUndefined();
  });
});
