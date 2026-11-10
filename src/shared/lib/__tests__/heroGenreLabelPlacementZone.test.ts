import { measureHeroCoverPhotoLeftInCanvasPx } from '../heroGenreLabelPlacementZone';

describe('measureHeroCoverPhotoLeftInCanvasPx', () => {
  function mockRect(el: Element, rect: Partial<DOMRect>) {
    jest.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...rect,
    } as DOMRect);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns photo left edge in canvas coordinates', () => {
    const hero = document.createElement('section');
    hero.className = 'hero hero--has-cover-image';
    const canvas = document.createElement('div');
    const img = document.createElement('img');
    img.className = 'hero__cover-image';
    hero.append(canvas, img);
    document.body.appendChild(hero);

    mockRect(canvas, { left: 100, top: 50, width: 900, height: 300, right: 1000, bottom: 350 });
    mockRect(img, { left: 640, top: 50, width: 260, height: 300, right: 900, bottom: 350 });

    expect(measureHeroCoverPhotoLeftInCanvasPx(canvas)).toBe(540);

    hero.remove();
  });

  test('returns null when hero has no cover image flag', () => {
    const hero = document.createElement('section');
    hero.className = 'hero';
    const canvas = document.createElement('div');
    hero.append(canvas);
    document.body.appendChild(hero);

    expect(measureHeroCoverPhotoLeftInCanvasPx(canvas)).toBeNull();

    hero.remove();
  });
});
