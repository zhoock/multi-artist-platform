import {
  formatRgbTuple,
  isMonochromePalette,
  parseRgbString,
  selectBackgroundColors,
  selectBackgroundColorsWithDetails,
  type RGB,
} from '../selectBackgroundColors';

describe('selectBackgroundColors', () => {
  test('rejects near-white, near-black and near-gray colors', () => {
    const selection = selectBackgroundColorsWithDetails([
      [250, 250, 248],
      [12, 12, 14],
      [128, 128, 128],
      [72, 118, 84],
    ]);

    expect(selection.primary).toEqual([72, 118, 84]);
    expect(selection.evaluations.filter((entry) => entry.rejected)).toHaveLength(3);
    expect(selection.evaluations[0]?.rejectionReason).toBe('near-white');
    expect(selection.evaluations[1]?.rejectionReason).toBe('near-black');
    expect(selection.evaluations[2]?.rejectionReason).toBe('near-gray');
  });

  test('prefers saturated medium-brightness mood colors over bright accent', () => {
    const palette = [
      [245, 120, 18], // bright orange accent (logo-like)
      [58, 96, 72], // muted green background
      [92, 128, 88], // secondary green
      [240, 236, 228], // near white
    ] as const;

    const { primary, secondary } = selectBackgroundColors([...palette]);

    expect(primary).toEqual([58, 96, 72]);
    expect([secondary[0], secondary[1], secondary[2]]).not.toEqual([245, 120, 18]);
  });

  test('picks hue-distinct secondary when available', () => {
    const { primary, secondary } = selectBackgroundColors([
      [58, 96, 72],
      [92, 128, 88],
      [118, 92, 64],
      [240, 236, 228],
    ]);

    expect(primary).toEqual([118, 92, 64]);
    expect(secondary).toEqual([58, 96, 72]);
  });

  test('derives secondary from primary when palette has one viable color', () => {
    const { primary, secondary } = selectBackgroundColors([
      [250, 250, 248],
      [58, 96, 72],
      [12, 12, 14],
    ]);

    expect(primary).toEqual([58, 96, 72]);
    expect(secondary).not.toEqual(primary);
  });

  test('parseRgbString round-trips with formatRgbTuple', () => {
    const rgb = [58, 96, 72] as const;
    expect(parseRgbString(formatRgbTuple(rgb))).toEqual([...rgb]);
  });

  test('detects monochrome palette and builds neutral gray gradient', () => {
    const bwPalette = [
      [240, 238, 235],
      [180, 178, 175],
      [120, 118, 115],
      [65, 63, 60],
      [25, 24, 22],
      [118, 112, 105],
      [95, 92, 88],
      [145, 142, 138],
      [200, 198, 194],
      [40, 38, 36],
    ] satisfies RGB[];

    expect(isMonochromePalette(bwPalette)).toBe(true);

    const selection = selectBackgroundColorsWithDetails(bwPalette);
    expect(selection.mode).toBe('monochrome');
    expect(selection.primary[0]).toBe(selection.primary[1]);
    expect(selection.primary[1]).toBe(selection.primary[2]);
    expect(selection.secondary[0]).toBe(selection.secondary[1]);
    expect(selection.secondary[1]).toBe(selection.secondary[2]);
    expect(
      Math.abs(rgbToLightness(selection.primary) - rgbToLightness(selection.secondary))
    ).toBeGreaterThanOrEqual(0.12);
  });

  test('does not treat colorful palette as monochrome', () => {
    const colorful = [
      [245, 120, 18],
      [58, 96, 72],
      [92, 128, 88],
      [240, 236, 228],
      [118, 92, 64],
      [72, 118, 84],
      [200, 180, 50],
      [40, 80, 120],
      [180, 60, 90],
      [250, 250, 248],
    ] satisfies RGB[];

    expect(isMonochromePalette(colorful)).toBe(false);
    expect(selectBackgroundColorsWithDetails(colorful).mode).toBe('color');
  });
});

function rgbToLightness([r, g, b]: RGB): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  return (Math.max(rn, gn, bn) + Math.min(rn, gn, bn)) / 2;
}
