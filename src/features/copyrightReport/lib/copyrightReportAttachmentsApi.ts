/**
 * Copyright claim supporting documents — live API (v1).
 *
 * 1. POST /api/copyright-claims → { data: { claimId, uploadToken } }
 * 2. POST /api/copyright-claims/:claimId/attachments/presign
 * 3. PUT signedUrl (multipart, same as track upload)
 * 4. POST /api/copyright-claims/:claimId/attachments/:attachmentId/complete
 */

import { inferCopyrightReportAttachmentMime } from './copyrightReportAttachments';

export type CopyrightClaimCreated = {
  claimId: string;
  uploadToken: string;
};

export async function submitCopyrightClaim(
  body: Record<string, unknown>
): Promise<CopyrightClaimCreated> {
  const res = await fetch('/api/copyright-claims', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: { claimId?: string | null; uploadToken?: string };
    error?: string;
  };
  if (!res.ok || !json.success || !json.data?.claimId || !json.data.uploadToken) {
    throw new Error(json.error ?? 'Could not submit report.');
  }
  return { claimId: json.data.claimId, uploadToken: json.data.uploadToken };
}

export async function presignCopyrightClaimAttachment(input: {
  claimId: string;
  uploadToken: string;
  file: File;
}): Promise<{ attachmentId: string; signedUrl: string }> {
  const mimeType = inferCopyrightReportAttachmentMime(input.file);
  const res = await fetch(
    `/api/copyright-claims/${encodeURIComponent(input.claimId)}/attachments/presign`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadToken: input.uploadToken,
        originalFilename: input.file.name,
        mimeType,
        sizeBytes: input.file.size,
      }),
    }
  );
  const json = (await res.json()) as {
    success?: boolean;
    data?: { attachmentId?: string; signedUrl?: string };
    error?: string;
  };
  if (!res.ok || !json.success || !json.data?.attachmentId || !json.data.signedUrl) {
    throw new Error(json.error ?? 'Could not prepare upload.');
  }
  return { attachmentId: json.data.attachmentId, signedUrl: json.data.signedUrl };
}

export async function uploadFileToSignedUrl(file: File, signedUrl: string): Promise<void> {
  const formData = new FormData();
  formData.append('cacheControl', '3600');
  formData.append('', file);
  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'x-upsert': 'true' },
    body: formData,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(
      `Upload failed (${response.status})${errorText ? `: ${errorText.slice(0, 200)}` : ''}`
    );
  }
}

export async function completeCopyrightClaimAttachment(input: {
  claimId: string;
  attachmentId: string;
  uploadToken: string;
}): Promise<void> {
  const res = await fetch(
    `/api/copyright-claims/${encodeURIComponent(input.claimId)}/attachments/${encodeURIComponent(input.attachmentId)}/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadToken: input.uploadToken }),
    }
  );
  const json = (await res.json()) as { success?: boolean; error?: string };
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? 'Could not finalize upload.');
  }
}

export const COPYRIGHT_REPORT_ATTACHMENTS_UPLOAD_CONTRACT =
  'copyright-claim-presigned-upload-v1' as const;

export async function uploadCopyrightClaimAttachments(input: {
  claimId: string;
  uploadToken: string;
  files: File[];
  onProgress?: (completed: number, total: number) => void;
}): Promise<void> {
  const total = input.files.length;
  let completed = 0;
  for (const file of input.files) {
    const { attachmentId, signedUrl } = await presignCopyrightClaimAttachment({
      claimId: input.claimId,
      uploadToken: input.uploadToken,
      file,
    });
    await uploadFileToSignedUrl(file, signedUrl);
    await completeCopyrightClaimAttachment({
      claimId: input.claimId,
      attachmentId,
      uploadToken: input.uploadToken,
    });
    completed += 1;
    input.onProgress?.(completed, total);
  }
}
