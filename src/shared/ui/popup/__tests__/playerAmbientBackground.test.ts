import fs from 'node:fs';
import path from 'node:path';

import {
  PLAYER_AMBIENT_GRADIENT_CLASSES,
  PLAYER_AMBIENT_GRADIENT_DURATION_S,
  PLAYER_AMBIENT_GRADIENT_EASING,
  PLAYER_AMBIENT_GRADIENT_KEYFRAMES_NAME,
  PLAYER_AMBIENT_GRADIENT_USES_TRANSFORM_LOOP,
} from '../playerAmbientBackground';

describe('playerAmbientBackground configuration', () => {
  test('uses stable duration and linear easing', () => {
    expect(PLAYER_AMBIENT_GRADIENT_DURATION_S).toBe(20);
    expect(PLAYER_AMBIENT_GRADIENT_EASING).toBe('linear');
  });

  test('uses transform loop instead of custom-property phase reset', () => {
    expect(PLAYER_AMBIENT_GRADIENT_USES_TRANSFORM_LOOP).toBe(true);
    expect(PLAYER_AMBIENT_GRADIENT_KEYFRAMES_NAME).toBe('player-gradient-rotate');
  });

  test('defines outer and inner gradient layer class names', () => {
    expect(PLAYER_AMBIENT_GRADIENT_CLASSES.outer).toBe('popup__gradient');
    expect(PLAYER_AMBIENT_GRADIENT_CLASSES.inner).toBe('popup__gradient-inner');
  });
});

describe('popup/style.scss ambient gradient regression', () => {
  const stylePath = path.resolve(__dirname, '../style.scss');
  const scss = fs.readFileSync(stylePath, 'utf8');

  test('animates inner layer with transform rotate keyframes', () => {
    expect(scss).toContain(`@keyframes ${PLAYER_AMBIENT_GRADIENT_KEYFRAMES_NAME}`);
    expect(scss).toContain('transform: rotate(0turn)');
    expect(scss).toContain('transform: rotate(1turn)');
    expect(scss).not.toContain('animation: spin');
    expect(scss).not.toMatch(/@property\s+--rotate/);
  });

  test('restores soft blob geometry without content-box clipping', () => {
    expect(scss).toContain('transform: scale(0.7)');
    expect(scss).toContain('inline-size: 100%');
    expect(scss).not.toContain('background-clip: content-box');
    expect(scss).not.toContain('background-origin: content-box');
  });

  test('keeps duration in sync with TS constants', () => {
    expect(scss).toContain(`${PLAYER_AMBIENT_GRADIENT_DURATION_S}s`);
  });
});
