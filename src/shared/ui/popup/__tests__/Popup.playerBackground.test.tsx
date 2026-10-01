/** @jest-environment jsdom */

import React from 'react';
import { describe, expect, test } from '@jest/globals';
import { render } from '@testing-library/react';

import { Popup } from '@shared/ui/popup';
import { PLAYER_AMBIENT_GRADIENT_CLASSES } from '../playerAmbientBackground';

const SAMPLE_BG = 'linear-gradient(var(--rotate, 132deg), rgb(80, 40, 120), rgb(20, 60, 90))';

describe('Popup Full Player ambient background', () => {
  test('renders outer blur shell and inner gradient layer when bgColor is set', () => {
    render(
      <Popup isActive bgColor={SAMPLE_BG} onClose={() => undefined}>
        <div className="player" data-testid="player-root" />
      </Popup>
    );

    const outer = document.querySelector(`.${PLAYER_AMBIENT_GRADIENT_CLASSES.outer}`);
    const inner = document.querySelector(`.${PLAYER_AMBIENT_GRADIENT_CLASSES.inner}`);

    expect(outer).not.toBeNull();
    expect(inner).not.toBeNull();
    expect(outer?.contains(inner ?? null)).toBe(true);
    expect(inner).toHaveStyle({ background: SAMPLE_BG });
  });

  test('does not render gradient layers without bgColor', () => {
    render(
      <Popup isActive onClose={() => undefined}>
        <div className="player" />
      </Popup>
    );

    expect(document.querySelector(`.${PLAYER_AMBIENT_GRADIENT_CLASSES.outer}`)).toBeNull();
    expect(document.querySelector(`.${PLAYER_AMBIENT_GRADIENT_CLASSES.inner}`)).toBeNull();
  });
});
