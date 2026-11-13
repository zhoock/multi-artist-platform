import { readFileSync } from 'node:fs';

/**
 * Regression: album checkout used dashboard-modal-shell (min-height: 100vh) inside a
 * flex-centered scrollable dialog, which clipped the hero (cover + title) at the top.
 */
describe('AlbumCheckoutModal layout contract', () => {
  test('shell does not force viewport min-height inside Popup', () => {
    const styles = readFileSync('src/entities/service/ui/AlbumCheckoutModal.style.scss', 'utf8');

    expect(styles).toMatch(/\.album-checkout-modal\s*\{[\s\S]*min-height:\s*auto/);
    expect(styles).toMatch(/min-block-size:\s*0/);
    expect(styles).toMatch(/flex:\s*0\s+1\s+auto/);
  });

  test('popup dialog does not scroll the outer shell for album checkout', () => {
    const popupStyles = readFileSync('src/shared/ui/popup/style.scss', 'utf8');

    expect(popupStyles).toMatch(/popup\[open\]:has\(\.album-checkout-modal\)/);
    expect(popupStyles).toMatch(
      /popup\[open\]:has\(\.album-checkout-modal\)[\s\S]*overflow:\s*hidden/
    );
  });
});
