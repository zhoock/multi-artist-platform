import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react';

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

describe('SocialLinksContent', () => {
  const socialLinksCopy = {
    title: 'Social Links',
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

  const preloadedState = {
    lang: { current: 'en' as const },
    uiDictionary: {
      en: {
        status: 'succeeded' as const,
        error: null,
        data: [
          {
            dashboard: {
              socialLinks: socialLinksCopy,
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
        data: { socialLinks: {} },
      });
    });
  });

  async function renderSocialLinks(props?: {
    onSaveError?: (message: string) => void;
    onNotAuthorized?: () => void;
  }) {
    const view = renderWithProviders(<SocialLinksContent active {...props} />, {
      preloadedState,
    });

    await waitFor(() => {
      expect(screen.getByLabelText('Instagram')).toBeInTheDocument();
    });

    return view;
  }

  it('renders dashboard kit layout with four platform rows and no save actions', async () => {
    const { container } = await renderSocialLinks();

    expect(container.querySelector('.dashboard-section')).toBeTruthy();
    expect(container.querySelector('.dashboard-card')).toBeTruthy();
    expect(container.querySelectorAll('.dashboard-row')).toHaveLength(SOCIAL_PLATFORMS.length);
    expect(container.querySelector('.dashboard-button')).toBeNull();
    expect(container.querySelector('.social-links__footer')).toBeNull();

    for (const platform of SOCIAL_PLATFORMS) {
      const label = socialLinksCopy.platforms[platform];
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute('placeholder', socialLinksCopy.placeholders[platform]);
    }
  });

  it('saves social links on blur when the URL changed', async () => {
    await renderSocialLinks();

    const input = screen.getByLabelText('Instagram');
    fireEvent.change(input, { target: { value: 'https://instagram.com/e2e' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(fetchWithAuthSessionMock).toHaveBeenCalledWith(
        '/api/user-profile',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            socialLinks: { instagram: 'https://instagram.com/e2e' },
          }),
        })
      );
    });

    expect(notifyPublicSurfaceChangedMock).toHaveBeenCalledWith({ type: 'socialLinksChanged' });
  });

  it('does not save on blur when the URL is unchanged', async () => {
    await renderSocialLinks();
    fetchWithAuthSessionMock.mockClear();

    fireEvent.blur(screen.getByLabelText('Instagram'));

    await waitFor(() => {
      expect(fetchWithAuthSessionMock).not.toHaveBeenCalled();
    });
  });

  it('saves on Enter without submitting a form', async () => {
    await renderSocialLinks();

    const input = screen.getByLabelText('Facebook');
    fireEvent.change(input, { target: { value: 'https://facebook.com/band' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(fetchWithAuthSessionMock).toHaveBeenCalledWith(
        '/api/user-profile',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            socialLinks: { facebook: 'https://facebook.com/band' },
          }),
        })
      );
    });
  });

  it('reports save errors through the existing settings error callback', async () => {
    const onSaveError = jest.fn<(message: string) => void>();
    await renderSocialLinks({ onSaveError });

    fetchWithAuthSessionMock.mockImplementation(async (_url, init) => {
      if ((init as { method?: string } | undefined)?.method === 'POST') {
        return jsonResponse({ error: 'Invalid URL' }, false);
      }
      return jsonResponse({
        success: true,
        data: { socialLinks: {} },
      });
    });

    const input = screen.getByLabelText('YouTube');
    fireEvent.change(input, { target: { value: 'https://youtube.com/@band' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onSaveError).toHaveBeenCalledWith('Error: Invalid URL');
    });
  });
});
