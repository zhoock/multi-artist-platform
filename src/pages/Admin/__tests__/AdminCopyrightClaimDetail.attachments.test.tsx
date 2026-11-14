/** @jest-environment jsdom */

import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '@shared/lib/test-utils';
import type {
  fetchAdminCopyrightClaim,
  fetchAdminCopyrightClaimAttachmentDownloadUrl,
  patchAdminCopyrightClaim,
  AdminCopyrightClaimDetail,
} from '@shared/lib/adminCopyrightClaimsApi';
import AdminCopyrightClaimDetailPage from '../AdminCopyrightClaimDetail';

const CLAIM_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const ATTACHMENT_ID = 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

const mockFetchClaim = jest.fn<typeof fetchAdminCopyrightClaim>();
const mockFetchDownload = jest.fn<typeof fetchAdminCopyrightClaimAttachmentDownloadUrl>();
const mockPatch = jest.fn<typeof patchAdminCopyrightClaim>();

jest.mock('react-router-dom', () => {
  const actual = jest.requireActual('react-router-dom') as object;
  return {
    ...actual,
    useParams: () => ({ id: CLAIM_ID }),
  };
});

jest.mock('@shared/lib/adminCopyrightClaimsApi', () => ({
  fetchAdminCopyrightClaim: (id: string) => mockFetchClaim(id),
  fetchAdminCopyrightClaimAttachmentDownloadUrl: (claimId: string, attachmentId: string) =>
    mockFetchDownload(claimId, attachmentId),
  patchAdminCopyrightClaim: (id: string, body: Parameters<typeof patchAdminCopyrightClaim>[1]) =>
    mockPatch(id, body),
}));

jest.mock('@app/providers/lang', () => ({
  useLang: () => ({ lang: 'en' }),
}));

const baseClaim: AdminCopyrightClaimDetail = {
  id: CLAIM_ID,
  contentType: 'album',
  contentId: 'album-slug',
  contentTitle: 'Album',
  artistDisplay: 'Artist',
  claimantName: 'Jane',
  claimantEmail: 'jane@example.com',
  claimantType: 'other',
  description: 'Infringement details here',
  status: 'new',
  adminNote: '',
  createdAt: '2026-11-06T10:00:00.000Z',
  artistSlug: 'artist',
  albumSlug: 'album-slug',
  trackSlug: null,
  albumCopyrightRestricted: false,
};

describe('AdminCopyrightClaimDetail attachments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPatch.mockResolvedValue({ claim: baseClaim, attachments: [], activity: [] });
  });

  test('renders uploaded attachment and requests admin download URL on click', async () => {
    mockFetchClaim.mockResolvedValue({
      claim: baseClaim,
      attachments: [
        {
          id: ATTACHMENT_ID,
          fileName: 'proof.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 8192,
          createdAt: '2026-11-06T10:05:00.000Z',
          uploadedAt: '2026-11-06T10:06:00.000Z',
        },
      ],
      activity: [],
    });
    mockFetchDownload.mockResolvedValue({
      downloadUrl: 'https://signed.example/file',
      fileName: 'proof.pdf',
    });

    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    renderWithProviders(<AdminCopyrightClaimDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /supporting documents/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'proof.pdf' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'proof.pdf' }));

    await waitFor(() => {
      expect(mockFetchDownload).toHaveBeenCalledWith(CLAIM_ID, ATTACHMENT_ID);
    });
    expect(openSpy).toHaveBeenCalledWith(
      'https://signed.example/file',
      '_blank',
      'noopener,noreferrer'
    );

    openSpy.mockRestore();
  });

  test('does not render attachments section when list is empty', async () => {
    mockFetchClaim.mockResolvedValue({
      claim: baseClaim,
      attachments: [],
      activity: [],
    });

    renderWithProviders(<AdminCopyrightClaimDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Infringement details here')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('heading', { name: /supporting documents/i })
    ).not.toBeInTheDocument();
  });
});
