import {
  CLUSTER_LABEL_FOG_LAYERS,
  CLUSTER_LABEL_MIST_FALLBACK_LAYERS,
  CLUSTER_LABEL_MIST_FALLBACK_CENTER_ALPHA,
  CLUSTER_LABEL_CANVAS,
  clampHeroGenreLabelCenterPx,
  computeClusterLabelDepthOpacity,
  computeClusterLabelDepthTint,
  computeHeroGenreLabelPlacementBounds,
  drawNebulaClusterLabelOnCanvas,
  estimateHeroClusterLabelScreenSizePx,
  getHeroGenreLabelSafePaddingPx,
  measureClusterLabelTextExtents,
  HERO_GENRE_LABEL_SAFE_PADDING,
} from '../universe3dClusterLabelCanvas';

describe('universe3dClusterLabelCanvas', () => {
  test('depth opacity: far ghostier, near stronger, nearest slightly boosted', () => {
    expect(computeClusterLabelDepthOpacity(6, false)).toBe(0);
    const far = computeClusterLabelDepthOpacity(4.85, false);
    const mid = computeClusterLabelDepthOpacity(4, false);
    const near = computeClusterLabelDepthOpacity(3, false);
    const nearActive = computeClusterLabelDepthOpacity(3, true);

    expect(far).toBeLessThan(0.2);
    expect(mid).toBeGreaterThan(far);
    expect(near).toBeGreaterThan(mid);
    expect(nearActive).toBeGreaterThanOrEqual(near);
    expect(nearActive).toBeLessThanOrEqual(0.86);
  });

  test('depth tint follows camera distance', () => {
    expect(computeClusterLabelDepthTint(6, false)).toBeLessThan(0.65);
    expect(computeClusterLabelDepthTint(3.2, true)).toBeGreaterThan(0.9);
  });

  test('drawNebulaClusterLabelOnCanvas paints one fog layer per pass', () => {
    const fillText = jest.fn();
    const ctx = {
      clearRect: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      fillText,
      font: '',
      textAlign: '',
      textBaseline: '',
      fillStyle: '',
      globalAlpha: 1,
      filter: 'none',
      translate: jest.fn(),
      rotate: jest.fn(),
      scale: jest.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawNebulaClusterLabelOnCanvas(
      ctx,
      'Grunge',
      { r: 200, g: 90, b: 40 },
      {
        width: 512,
        height: 160,
      }
    );

    expect(fillText).toHaveBeenCalledTimes(CLUSTER_LABEL_FOG_LAYERS.length);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 512, 160);
  });

  test('drawNebulaClusterLabelOnCanvas fallback uses subpixel mist passes on mobile', () => {
    const fillText = jest.fn();
    const globalAlphas: number[] = [];
    const ctx = {
      clearRect: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      fillText,
      font: '',
      textAlign: '',
      textBaseline: '',
      fillStyle: '',
      filter: 'none',
      get globalAlpha() {
        return globalAlphas[globalAlphas.length - 1] ?? 1;
      },
      set globalAlpha(v: number) {
        globalAlphas.push(v);
      },
    } as unknown as CanvasRenderingContext2D;

    const originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    });

    drawNebulaClusterLabelOnCanvas(ctx, 'Grunge', { r: 200, g: 90, b: 40 });

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: originalInnerWidth,
    });

    expect(fillText).toHaveBeenCalledTimes(CLUSTER_LABEL_MIST_FALLBACK_LAYERS.length + 1);
    expect(globalAlphas.slice(0, CLUSTER_LABEL_MIST_FALLBACK_LAYERS.length)).toEqual(
      CLUSTER_LABEL_MIST_FALLBACK_LAYERS.map((layer) => layer.alpha)
    );
    expect(globalAlphas[globalAlphas.length - 1]).toBe(CLUSTER_LABEL_MIST_FALLBACK_CENTER_ALPHA);
    expect(fillText).toHaveBeenLastCalledWith(
      'Grunge',
      CLUSTER_LABEL_CANVAS.textX,
      CLUSTER_LABEL_CANVAS.textY
    );
    expect(ctx.filter).toBe('none');
  });

  test('getHeroGenreLabelSafePaddingPx uses 20px mobile and 32px desktop', () => {
    expect(getHeroGenreLabelSafePaddingPx(767)).toBe(HERO_GENRE_LABEL_SAFE_PADDING.mobile);
    expect(getHeroGenreLabelSafePaddingPx(768)).toBe(HERO_GENRE_LABEL_SAFE_PADDING.desktop);
  });

  test('measureClusterLabelTextExtents grows with longer genre titles', () => {
    const measureText = jest.fn((text: string) => ({
      width: text.length * 14,
      actualBoundingBoxAscent: 36,
      actualBoundingBoxDescent: 10,
    }));
    const ctx = {
      font: '',
      measureText,
    } as unknown as CanvasRenderingContext2D;

    const short = measureClusterLabelTextExtents(ctx, 'Grunge');
    const long = measureClusterLabelTextExtents(ctx, 'Alternative Rock');
    expect(long.width).toBeGreaterThan(short.width);
  });

  test('clampHeroGenreLabelCenterPx keeps label inside hero with padding', () => {
    const label = { width: 200, height: 48 };
    const hero = { width: 640, height: 220 };
    const pad = 32;

    const topOverflow = clampHeroGenreLabelCenterPx({
      heroWidth: hero.width,
      heroHeight: hero.height,
      labelWidth: label.width,
      labelHeight: label.height,
      safePadding: pad,
      randomX: 120,
      randomY: 0,
    });
    expect(topOverflow.y).toBeGreaterThanOrEqual(pad + label.height / 2);

    const bottomOverflow = clampHeroGenreLabelCenterPx({
      heroWidth: hero.width,
      heroHeight: hero.height,
      labelWidth: label.width,
      labelHeight: label.height,
      safePadding: pad,
      randomX: 320,
      randomY: hero.height,
    });
    expect(bottomOverflow.y).toBeLessThanOrEqual(hero.height - pad - label.height / 2);

    const inside = clampHeroGenreLabelCenterPx({
      heroWidth: hero.width,
      heroHeight: hero.height,
      labelWidth: label.width,
      labelHeight: label.height,
      safePadding: pad,
      randomX: 300,
      randomY: 110,
    });
    expect(inside.x).toBe(300);
    expect(inside.y).toBe(110);
  });

  test('estimateHeroClusterLabelScreenSizePx scales with text width', () => {
    const base = { viewportHeightPx: 320, cameraFovDeg: 70, cameraDistance: 0.92 };
    const narrow = estimateHeroClusterLabelScreenSizePx({
      ...base,
      textExtents: { width: 120, height: 56 },
    });
    const wide = estimateHeroClusterLabelScreenSizePx({
      ...base,
      textExtents: { width: 340, height: 56 },
    });
    expect(wide.width).toBeGreaterThan(narrow.width);
  });

  test('computeHeroGenreLabelPlacementBounds respects photo area and label width', () => {
    const pad = 32;
    const label = { width: 280, height: 56 };
    const hero = { width: 1000, height: 320 };
    const photoLeft = 620;

    const bounds = computeHeroGenreLabelPlacementBounds({
      heroWidth: hero.width,
      heroHeight: hero.height,
      labelWidth: label.width,
      labelHeight: label.height,
      safePadding: pad,
      photoAreaLeftPx: photoLeft,
    });

    expect(bounds.maxX).toBe(photoLeft - pad - label.width / 2);

    const clamped = clampHeroGenreLabelCenterPx({
      heroWidth: hero.width,
      heroHeight: hero.height,
      labelWidth: label.width,
      labelHeight: label.height,
      safePadding: pad,
      photoAreaLeftPx: photoLeft,
      randomX: 999,
      randomY: 50,
    });
    expect(clamped.x + label.width / 2).toBeLessThanOrEqual(photoLeft - pad);
  });

  test('long genre title narrows maxX but stays left of photo', () => {
    const pad = 32;
    const photoLeft = 500;
    const short = computeHeroGenreLabelPlacementBounds({
      heroWidth: 900,
      heroHeight: 300,
      labelWidth: 140,
      labelHeight: 56,
      safePadding: pad,
      photoAreaLeftPx: photoLeft,
    });
    const long = computeHeroGenreLabelPlacementBounds({
      heroWidth: 900,
      heroHeight: 300,
      labelWidth: 380,
      labelHeight: 56,
      safePadding: pad,
      photoAreaLeftPx: photoLeft,
    });
    expect(long.maxX).toBeLessThan(short.maxX);
    expect(long.maxX + 380 / 2).toBeLessThanOrEqual(photoLeft - pad);
  });
});
