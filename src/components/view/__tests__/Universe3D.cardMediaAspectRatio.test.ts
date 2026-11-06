import fs from 'fs';
import path from 'path';

/**
 * Regression: tablet/desktop `.universe3d-card__media` must not use `fit-content`
 * height before the hero `<img>` has intrinsic dimensions, or the card header
 * collapses and jumps on load. Styles are asserted via the source file because
 * Jest maps `.scss` imports through identity-obj-proxy.
 */
describe('Universe3D artist card media header geometry', () => {
  it('reserves a fixed aspect ratio for non-empty hero media on tablet+ breakpoints', () => {
    const scssPath = path.join(__dirname, '../Universe3D.style.scss');
    const content = fs.readFileSync(scssPath, 'utf8');

    const tabletBlockStart = content.indexOf('@include breakpoint(tablet)');
    expect(tabletBlockStart).toBeGreaterThan(-1);

    const notEmptyRuleIdx = content.indexOf(
      '&:not(.universe3d-card__media--empty)',
      tabletBlockStart
    );
    expect(notEmptyRuleIdx).toBeGreaterThan(-1);

    const sliceEnd = content.indexOf('&--empty', notEmptyRuleIdx);
    expect(sliceEnd).toBeGreaterThan(notEmptyRuleIdx);

    const nonEmptyBlock = content.slice(notEmptyRuleIdx, sliceEnd);
    expect(nonEmptyBlock).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
    expect(nonEmptyBlock).toMatch(/min-height:\s*calc\(9\s*\*\s*var\(--ms-0\)\)/);
    expect(nonEmptyBlock).not.toMatch(/block-size:\s*fit-content/);
    expect(nonEmptyBlock).not.toMatch(/aspect-ratio:\s*unset/);

    const fromImageRule = content.slice(
      content.indexOf('.universe3d-card__media-image {', tabletBlockStart)
    );
    const imageBlock = fromImageRule.slice(
      0,
      fromImageRule.indexOf('\n  }\n\n  .universe3d-card__media')
    );
    expect(imageBlock).toMatch(/height:\s*100%/);
    expect(imageBlock).toMatch(/object-fit:\s*cover/);
  });
});
