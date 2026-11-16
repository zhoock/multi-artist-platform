import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { SETTINGS_MANAGER_CONTACTS_SECTION_ID } from '@shared/constants/settingsManagerContactsSection';
import { ManagerContactsContent } from '../ManagerContactsContent';

const getTokenMock = jest.fn<() => string | null>();
const fetchWithAuthSessionMock = jest.fn<(...args: unknown[]) => Promise<Response>>();

jest.mock('@shared/lib/auth', () => ({
  getToken: () => getTokenMock(),
}));

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: (...args: unknown[]) => fetchWithAuthSessionMock(...args),
}));

const notifyPublicSurfaceChangedMock = jest.fn();

jest.mock('@shared/lib/publicSurfaceSync', () => ({
  notifyPublicSurfaceChanged: (...args: unknown[]) => notifyPublicSurfaceChangedMock(...args),
}));

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

describe('ManagerContactsContent', () => {
  const preloadedState = {
    lang: { current: 'en' as const },
    uiDictionary: {
      en: {
        status: 'succeeded' as const,
        error: null,
        data: [
          {
            dashboard: {
              managerContacts: {
                title: 'Manager Contacts',
                fields: { email: 'Manager Email', telegram: 'Manager Telegram' },
                placeholders: {
                  email: 'manager@example.com',
                  telegram: 'https://t.me/username',
                },
              },
              error: 'Error',
            },
          },
        ] as never,
        lastUpdated: Date.now(),
      },
      ru: { status: 'idle' as const, error: null, data: [], lastUpdated: null },
    },
  };

  beforeEach(() => {
    getTokenMock.mockReset();
    fetchWithAuthSessionMock.mockReset();
    notifyPublicSurfaceChangedMock.mockReset();
    getTokenMock.mockReturnValue('test-token');
    fetchWithAuthSessionMock.mockImplementation(async (_url, init) => {
      if ((init as { method?: string } | undefined)?.method === 'POST') {
        return jsonResponse({ success: true });
      }
      return jsonResponse({
        success: true,
        data: { managerEmail: 'saved@test.com', managerTelegramUrl: 'https://t.me/manager' },
      });
    });
  });

  it('renders section anchor and saves manager contacts on blur', async () => {
    renderWithProviders(<ManagerContactsContent active />, { preloadedState });

    await waitFor(() => {
      expect(document.getElementById(SETTINGS_MANAGER_CONTACTS_SECTION_ID)).toBeInTheDocument();
    });

    const emailInput = await screen.findByLabelText('Manager Email');
    expect(emailInput).toHaveValue('saved@test.com');

    fireEvent.change(emailInput, { target: { value: 'manager@example.com' } });
    fireEvent.blur(emailInput);

    await waitFor(() => {
      expect(fetchWithAuthSessionMock).toHaveBeenCalledWith(
        '/api/user-profile',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            socialLinks: {
              managerEmail: 'manager@example.com',
              telegram: 'https://t.me/manager',
            },
          }),
        })
      );
    });

    expect(notifyPublicSurfaceChangedMock).toHaveBeenCalledWith({ type: 'socialLinksChanged' });
  });

  it('normalizes @username telegram to canonical URL on save', async () => {
    fetchWithAuthSessionMock.mockImplementation(async (_url, init) => {
      if ((init as { method?: string } | undefined)?.method === 'POST') {
        return jsonResponse({ success: true });
      }
      return jsonResponse({
        success: true,
        data: { managerEmail: '', managerTelegramUrl: null },
      });
    });

    renderWithProviders(<ManagerContactsContent active />, { preloadedState });

    const telegramInput = await screen.findByLabelText('Manager Telegram');
    fireEvent.change(telegramInput, { target: { value: '@ShnapK' } });
    fireEvent.blur(telegramInput);

    await waitFor(() => {
      expect(fetchWithAuthSessionMock).toHaveBeenCalledWith(
        '/api/user-profile',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            socialLinks: {
              managerEmail: '',
              telegram: 'https://t.me/ShnapK',
            },
          }),
        })
      );
    });

    await waitFor(() => {
      expect(telegramInput).toHaveValue('@ShnapK');
    });
  });
});
