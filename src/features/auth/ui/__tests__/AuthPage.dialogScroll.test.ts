import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AuthPage dialog scroll styles', () => {
  test('auth dialog uses vertical auto scroll, not overflow hidden', () => {
    const scss = readFileSync(resolve(__dirname, '../AuthPage.scss'), 'utf8');
    const authDialogBlock = scss.match(
      /dialog\.popup\.local-modal:has\(\.auth-page\)\s*\{[^}]+\}/s
    )?.[0];
    expect(authDialogBlock).toBeDefined();
    expect(authDialogBlock).toMatch(/overflow:\s*hidden\s+auto/);
    expect(authDialogBlock).not.toMatch(/overflow:\s*hidden\s*;/);
  });
});
