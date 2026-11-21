/** @jest-environment jsdom */

import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

/**
 * Shared fullscreen popup shell (`album-comments-fullscreen`): grid header puts
 * `__header-main` on the same row as `__close`, spanning both columns.
 */
describe('album-comments fullscreen header close hit contract', () => {
  test('scss: title row does not intercept pointer events over the close column', () => {
    const albumCommentsStyles = readFileSync(
      'src/features/albumComments/ui/albumComments.scss',
      'utf8'
    );
    const publicTextStyles = readFileSync(
      'src/shared/ui/publicFullscreenText/publicFullscreenTextModal.scss',
      'utf8'
    );

    expect(albumCommentsStyles).toMatch(
      /&__header-main\s*\{[\s\S]*pointer-events:\s*none[\s\S]*> \*\s*\{[\s\S]*pointer-events:\s*auto/
    );
    expect(albumCommentsStyles).toMatch(/&__close\s*\{[\s\S]*z-index:\s*1/);
    expect(publicTextStyles).toMatch(
      /\.album-comments-fullscreen__header-main\s*\{[\s\S]*pointer-events:\s*none/
    );
    expect(publicTextStyles).toMatch(/\.album-comments-fullscreen__close\s*\{[\s\S]*z-index:\s*1/);
  });
});
