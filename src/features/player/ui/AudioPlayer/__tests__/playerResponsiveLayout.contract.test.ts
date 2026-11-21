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
    expect(layoutScss).toMatch(/player-compact-lyrics-wide-shell/);
    expect(layoutScss).toMatch(/player-compact-lyrics-portrait-shell/);
    expect(layoutScss).toMatch(/height <= 900px\) and \(#\{\$tablets\}\)/);
    expect(layoutScss).toMatch(/height <= 900px\) and \(not \(#\{\$tablets\}\)\)/);
    expect(layoutScss).toMatch(/player--controls-hidden/);
    expect(layoutScss).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*0fr/);
  });

  test('AudioPlayer uses transport wrapper without removed layout divider', () => {
    const source = readFileSync('src/features/player/ui/AudioPlayer/AudioPlayer.tsx', 'utf8');
    expect(source).toContain('player__transport-column');
    expect(source).not.toContain('player__layout-divider');
    expect(source).not.toContain('isLandscapeBlocked');
  });

  test('keeps tall lyrics grid vertical and defers short viewports to responsive shell', () => {
    const playerStyles = readFileSync('src/features/player/ui/AudioPlayer/style.scss', 'utf8');
    expect(playerStyles).toMatch(/\.player--lyrics-visible[\s\S]*@media \(height > 900px\)/);
    expect(playerStyles).toMatch(/&\.player--lyrics-visible[\s\S]*@media \(height > 900px\)/);
  });

  test('mobile skeleton header uses same inline sizing tokens as loaded cover metadata', () => {
    const playerStyles = readFileSync('src/features/player/ui/AudioPlayer/style.scss', 'utf8');
    const mobileBlock = playerStyles.match(/@media \(width < 768px\)\s*\{[\s\S]*?\n {2}\}/);
    expect(mobileBlock).not.toBeNull();
    const mobile = mobileBlock![0];
    expect(mobile).toMatch(/img\s*\{[\s\S]*?inline-size:\s*min\(100%,\s*425px\)/);
    expect(mobile).toMatch(/&__track-info,\s*\n\s*&__track-info--skeleton/);
    expect(playerStyles).toMatch(
      /\.player--header-loading[\s\S]*--player-header-cover-size:[\s\S]*100dvi/
    );
    expect(playerStyles).toMatch(
      /\.player--header-loading[\s\S]*\.player__cover-skeleton[\s\S]*var\(--player-header-cover-size\)/
    );
    expect(playerStyles).toMatch(
      /&__cover-skeleton\s*\{[\s\S]*?inline-size:\s*min\(100vi,\s*425px\)[\s\S]*?max-inline-size:\s*100%/
    );
    const skeletonCoverBlock = playerStyles.match(
      /&__cover-skeleton\s*\{[\s\S]*?aspect-ratio:\s*1\s*\/\s*1[\s\S]*?\n {2}\}/
    )?.[0];
    expect(skeletonCoverBlock).toBeDefined();
    expect(skeletonCoverBlock).not.toMatch(
      /@media \(width < 768px\)[\s\S]*?inline-size:\s*min\(100%,\s*425px\)/
    );
    expect(playerStyles).toMatch(
      /&__track-info--skeleton\s*\{[\s\S]*@media \(width < 768px\)[\s\S]*?max-inline-size:\s*min\(100%,\s*425px\)/
    );
    expect(skeletonCoverBlock).toMatch(/inline-size:\s*min\(100vi,\s*425px\)/);
    expect(skeletonCoverBlock).not.toMatch(/margin-inline:\s*auto/);
  });
});
