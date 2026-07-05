import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { SOCIAL_PLATFORMS } from '@shared/constants/socialLinks';
import { SocialLinksContent } from '../SocialLinksContent';

const getTokenMock = jest.fn<() => string | null>();
const fetchWithAuthSessionMock = jest.fn<(...args: unknown[]) => Promise<Response>>();

jest.mock('@shared/lib/auth', () => ({
  getToken: () => getTokenMock(),
}));

jest.mock('@shared/lib/authFetch', () => ({
  fetchWithAuthSession: (...args: unknown[]) => fetchWithAuthSessionMock(...args),
}));

describe('SocialLinksContent', () => {
  const socialLinksCopy = {
    title: 'Social Links',
    subtitle: 'Add your social networks.',
    hint: 'Leave empty if you do not have a link.',
    platforms: {
      instagram: 'Instagram',
      facebook: 'Facebook',
      youtube: 'YouTube',
      vk: 'VK',
    },
    placeholders: {
      instagram: 'https://instagram.com/username',
      facebook: 'https://facebook.com/username',
      youtube: 'https://youtube.com/@username',
      vk: 'https://vk.com/username',
    },
  };

  beforeEach(() => {
    getTokenMock.mockReset();
    fetchWithAuthSessionMock.mockReset();

    getTokenMock.mockReturnValue('test-token');
    fetchWithAuthSessionMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { socialLinks: {} },
      }),
    } as Response);
  });

  it('renders dashboard kit layout with four platform rows and footer actions', async () => {
    const { container } = renderWithProviders(<SocialLinksContent active />, {
      preloadedState: {
        lang: { current: 'en' },
        uiDictionary: {
          en: {
            status: 'succeeded',
            error: null,
            data: [
              {
                dashboard: {
                  socialLinks: socialLinksCopy,
                  cancel: 'Cancel',
                  save: 'Save',
                },
              },
            ] as never,
            lastUpdated: Date.now(),
          },
          ru: { status: 'idle', error: null, data: [], lastUpdated: null },
        },
      },
    });

    await waitFor(() => {
      expect(fetchWithAuthSessionMock).toHaveBeenCalled();
    });

    expect(container.querySelector('.dashboard-section')).toBeTruthy();
    expect(container.querySelector('.dashboard-card')).toBeTruthy();
    expect(container.querySelectorAll('.dashboard-row')).toHaveLength(SOCIAL_PLATFORMS.length);
    expect(container.querySelector('.social-links__cancel-button')).toBeTruthy();
    expect(container.querySelector('.dashboard-empty-state__cta')).toBeTruthy();

    for (const platform of SOCIAL_PLATFORMS) {
      const label = socialLinksCopy.platforms[platform];
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute('placeholder', socialLinksCopy.placeholders[platform]);
    }
  });
});
