import {
  buildPlayerAmbientGradientCss,
  isAlbumCoverPlayerBackground,
  playerAmbientGradientFromBackground,
} from '../albumCoverPlayerBackground';

describe('albumCoverPlayerBackground', () => {
  const sample = {
    primary: [120, 80, 200] as [number, number, number],
    secondary: [40, 90, 160] as [number, number, number],
  };

  test('validates shape', () => {
    expect(isAlbumCoverPlayerBackground(sample)).toBe(true);
    expect(isAlbumCoverPlayerBackground({ primary: [1, 2] })).toBe(false);
  });

  test('builds player ambient gradient css', () => {
    const css = buildPlayerAmbientGradientCss(sample);
    expect(css).toContain('linear-gradient');
    expect(css).toContain('rgb(120, 80, 200)');
    expect(css).toContain('rgb(40, 90, 160)');
    expect(playerAmbientGradientFromBackground(sample)).toBe(css);
  });
});
