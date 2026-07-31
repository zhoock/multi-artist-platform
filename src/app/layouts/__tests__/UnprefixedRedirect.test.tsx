import { describe, test, expect } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { UnprefixedRedirect } from '../UnprefixedRedirect';

function renderRedirect(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/:lang/dashboard-new/*" element={<UnprefixedRedirect />} />
        <Route path="/:lang/auth/*" element={<UnprefixedRedirect />} />
        <Route path="/:lang/pay/*" element={<UnprefixedRedirect />} />
        <Route path="/dashboard-new/*" element={<div data-testid="dashboard">dashboard</div>} />
        <Route path="/auth" element={<div data-testid="auth">auth</div>} />
        <Route path="/pay/success" element={<div data-testid="pay-success">pay</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('UnprefixedRedirect', () => {
  test('redirects /ru/dashboard-new/albums to /dashboard-new/albums', async () => {
    renderRedirect('/ru/dashboard-new/albums');
    expect(await screen.findByTestId('dashboard')).toBeTruthy();
  });

  test('redirects /en/auth to /auth preserving query', async () => {
    renderRedirect('/en/auth?mode=login');
    expect(await screen.findByTestId('auth')).toBeTruthy();
  });

  test('redirects /ru/pay/success to /pay/success', async () => {
    renderRedirect('/ru/pay/success');
    expect(await screen.findByTestId('pay-success')).toBeTruthy();
  });
});
