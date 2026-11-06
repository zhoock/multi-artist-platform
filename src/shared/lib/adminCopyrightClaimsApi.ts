import { getToken } from './auth';

export type CopyrightClaimAdminStatus = 'new' | 'under_review' | 'resolved' | 'rejected';

export type AdminCopyrightClaimActivity = {
  id: string;
  action: string;
  details: unknown;
  createdAt: string;
  adminUserId: string | null;
};

export type AdminCopyrightClaimSummary = {
  id: string;
  contentType: string;
  contentId: string;
  contentTitle: string;
  artistDisplay: string;
  claimantName: string;
  createdAt: string;
  status: CopyrightClaimAdminStatus;
};

export type AdminCopyrightClaimDetail = {
  id: string;
  contentType: string;
  contentId: string;
  contentTitle: string;
  artistDisplay: string;
  claimantName: string;
  claimantEmail: string;
  claimantType: string;
  description: string;
  status: CopyrightClaimAdminStatus;
  adminNote: string;
  createdAt: string;
  artistSlug: string | null;
  albumSlug: string | null;
  trackSlug: string | null;
  /** True when reported album (all locales) is under admin copyright restriction. */
  albumCopyrightRestricted: boolean;
};

export type AdminCopyrightClaimPatchAction = 'temporarilyHideAlbum' | 'restoreAlbumPublication';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function fetchAdminCopyrightClaimsList(params?: {
  status?: CopyrightClaimAdminStatus | 'all';
}): Promise<{
  claims: AdminCopyrightClaimSummary[];
  total: number;
  totalNew: number;
}> {
  const token = getToken();
  if (!token) {
    throw new Error('Unauthorized');
  }
  const q = new URLSearchParams();
  if (params?.status && params.status !== 'all') {
    q.set('status', params.status);
  }
  const qs = q.toString();
  const url = qs ? `/api/admin/copyright-claims?${qs}` : '/api/admin/copyright-claims';
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: { claims?: AdminCopyrightClaimSummary[]; total?: number; totalNew?: number };
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error('Failed to load');
  }
  return {
    claims: json.data.claims ?? [],
    total: json.data.total ?? json.data.claims?.length ?? 0,
    totalNew: json.data.totalNew ?? 0,
  };
}

export async function fetchAdminCopyrightClaim(id: string): Promise<{
  claim: AdminCopyrightClaimDetail;
  activity: AdminCopyrightClaimActivity[];
}> {
  const token = getToken();
  if (!token) {
    throw new Error('Unauthorized');
  }
  const res = await fetch(`/api/admin/copyright-claims/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: { claim?: AdminCopyrightClaimDetail; activity?: AdminCopyrightClaimActivity[] };
  };
  if (!res.ok || !json.success || !json.data?.claim) {
    throw new Error('Failed to load');
  }
  return {
    claim: json.data.claim,
    activity: json.data.activity ?? [],
  };
}

export async function patchAdminCopyrightClaim(
  id: string,
  body: {
    status?: CopyrightClaimAdminStatus;
    adminNote?: string;
    action?: AdminCopyrightClaimPatchAction;
  }
): Promise<{ claim: AdminCopyrightClaimDetail; activity: AdminCopyrightClaimActivity[] }> {
  const token = getToken();
  if (!token) {
    throw new Error('Unauthorized');
  }
  const payload: Record<string, unknown> = {};
  if (body.status !== undefined) payload.status = body.status;
  if (body.adminNote !== undefined) payload.adminNote = body.adminNote;
  if (body.action !== undefined) payload.action = body.action;

  const res = await fetch(`/api/admin/copyright-claims/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, ...JSON_HEADERS },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: { claim?: AdminCopyrightClaimDetail; activity?: AdminCopyrightClaimActivity[] };
    error?: string;
  };
  if (!res.ok || !json.success || !json.data?.claim) {
    const msg = typeof json.error === 'string' ? json.error : 'Failed to update';
    throw new Error(msg);
  }
  return { claim: json.data.claim, activity: json.data.activity ?? [] };
}
