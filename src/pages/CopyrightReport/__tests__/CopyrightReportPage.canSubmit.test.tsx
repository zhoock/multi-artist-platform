/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import { CopyrightReportModal } from '@features/copyrightReport';
import { MIN_COPYRIGHT_CLAIM_DESCRIPTION_CHARS } from '@shared/lib/copyright/copyrightClaimDescriptionRules';

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

jest.mock('@shared/lib/hooks/useSiteArtistDisplayName', () => ({
  useSiteArtistDisplayName: () => ({
    displayName: 'Test Artist',
    displayLabel: 'Test Artist',
    isLoading: false,
  }),
}));

const CONTEXT_RESPONSE = {
  success: true,
  data: {
    contentType: 'album' as const,
    contentId: 'test-album',
    title: 'Test Album',
    artistName: 'Test Artist',
    artistSlug: 'test-artist',
  },
};

function setupFetchContextOk() {
  const mockFetch: typeof fetch = jest.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        json: async () => CONTEXT_RESPONSE,
      }) as unknown as Response
  );
  (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;
  return mockFetch;
}

function renderModal() {
  return renderWithProviders(
    <CopyrightReportModal
      isOpen
      onClose={() => undefined}
      request={{
        contentType: 'album',
        contentId: 'test-album',
        artistSlug: 'test-artist',
      }}
    />
  );
}

describe('CopyrightReportModal submit enablement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupFetchContextOk();
  });

  test('submit disabled when description shorter than minimum, enabled at minimum length', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /name \/ organization/i })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('textbox', { name: /name \/ organization/i }), {
      target: { value: 'Jane Doe' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /describe the infringement/i }), {
      target: { value: 'x'.repeat(MIN_COPYRIGHT_CLAIM_DESCRIPTION_CHARS - 1) },
    });
    fireEvent.click(screen.getByRole('checkbox'));

    const submit = screen.getByRole('button', { name: /Submit report/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: /describe the infringement/i }), {
      target: { value: 'x'.repeat(MIN_COPYRIGHT_CLAIM_DESCRIPTION_CHARS) },
    });

    expect(submit).not.toBeDisabled();
  });
});
