import {
  HELP_SECTION_ACTIVATION_BUFFER_PX,
  resolveActiveHelpSectionIndex,
  resolvePinnedHelpSectionIndex,
} from '../resolveActiveHelpSectionIndex';

describe('resolveActiveHelpSectionIndex', () => {
  const readingLine = 100;
  const buffer = HELP_SECTION_ACTIVATION_BUFFER_PX;

  it('returns -1 for an empty list', () => {
    expect(resolveActiveHelpSectionIndex([], readingLine)).toBe(-1);
  });

  it('returns the first section before any heading reaches the reading line', () => {
    expect(resolveActiveHelpSectionIndex([{ top: 260 }, { top: 420 }], readingLine)).toBe(0);
  });

  it('returns the last heading that has reached the reading line', () => {
    expect(
      resolveActiveHelpSectionIndex(
        [{ top: 40 }, { top: 95 }, { top: 140 }, { top: 520 }],
        readingLine
      )
    ).toBe(1);
  });

  it('does not activate the next section while its heading is still below the reading line', () => {
    expect(
      resolveActiveHelpSectionIndex(
        [{ top: 10 }, { top: 20 }, { top: 105 }, { top: 400 }],
        readingLine
      )
    ).toBe(1);
  });

  it('activates the next section once its heading crosses the reading line', () => {
    expect(
      resolveActiveHelpSectionIndex(
        [{ top: 10 }, { top: 20 }, { top: 100 }, { top: 400 }],
        readingLine
      )
    ).toBe(2);
  });

  it('returns the last section at page bottom when its heading never crossed the line', () => {
    expect(
      resolveActiveHelpSectionIndex(
        [{ top: -200 }, { top: -80 }, { top: 40 }, { top: 420 }],
        readingLine,
        { atPageBottom: true }
      )
    ).toBe(3);
  });
});

describe('resolvePinnedHelpSectionIndex', () => {
  const readingLine = 100;

  it('keeps the pinned section active until the next heading crosses the reading line', () => {
    expect(
      resolvePinnedHelpSectionIndex(
        2,
        [{ top: -120 }, { top: -40 }, { top: 20 }, { top: 360 }],
        readingLine,
        2
      )
    ).toBe(2);
  });

  it('releases the pin once the next heading crosses the reading line', () => {
    expect(
      resolvePinnedHelpSectionIndex(
        2,
        [{ top: -120 }, { top: -40 }, { top: 20 }, { top: 96 }],
        readingLine,
        3
      )
    ).toBeNull();
  });

  it('keeps the last pinned section active while reading it', () => {
    expect(
      resolvePinnedHelpSectionIndex(
        3,
        [{ top: -220 }, { top: -140 }, { top: -60 }, { top: 20 }],
        readingLine,
        3
      )
    ).toBe(3);
  });

  it('releases the last pin when the user scrolls back up', () => {
    expect(
      resolvePinnedHelpSectionIndex(
        3,
        [{ top: -220 }, { top: -140 }, { top: -60 }, { top: 20 }],
        readingLine,
        1
      )
    ).toBeNull();
  });
});
