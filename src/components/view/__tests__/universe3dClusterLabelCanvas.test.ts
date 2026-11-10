import {
  CLUSTER_LABEL_FOG_LAYERS,
  computeClusterLabelDepthOpacity,
  computeClusterLabelDepthTint,
  drawNebulaClusterLabelOnCanvas,
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
});
