import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

describe('player responsive layout contract', () => {
  const layoutScss = readFileSync(
    'src/features/player/ui/AudioPlayer/_player-responsive-layout.scss',
    'utf8'
  );

  test('switches layout by viewport height only', () => {
    expect(layoutScss).toMatch(/height < 500px/);
    expect(layoutScss).toMatch(/orientation:\s*landscape\) and \(height <= 768px/);
    expect(layoutScss).not.toMatch(/\$desktops/);
    expect(layoutScss).not.toMatch(/@container/);
    expect(layoutScss).not.toMatch(/container-type/);
    expect(layoutScss).not.toMatch(/width\s*>=\s*880/);
    expect(layoutScss).not.toMatch(/player-divider/);
    expect(layoutScss).not.toMatch(/--player-/);
  });

  test('uses separate compact rules for non-lyrics and lyrics modes', () => {
    expect(layoutScss).toMatch(/:not\(\.player--lyrics-visible\)/);
    expect(layoutScss).toMatch(/&\.player--lyrics-visible/);
    expect(layoutScss).toMatch(/player-compact-lyrics-viewport/);
    expect(layoutScss).toMatch(/height <= 900px/);
    expect(layoutScss).toMatch(/player--controls-hidden/);
    expect(layoutScss).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*0fr/);
  });

  test('AudioPlayer uses transport wrapper without removed layout divider', () => {
    const source = readFileSync('src/features/player/ui/AudioPlayer/AudioPlayer.tsx', 'utf8');
    expect(source).toContain('player__transport-column');
    expect(source).not.toContain('player__layout-divider');
    expect(source).not.toContain('isLandscapeBlocked');
  });
});
