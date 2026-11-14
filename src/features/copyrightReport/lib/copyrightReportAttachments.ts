import {
  copyrightClaimAttachmentMimeFromMagic,
  copyrightClaimAttachmentMimeMatchesDeclared,
  readCopyrightClaimAttachmentMagic as readCopyrightReportAttachmentMagic,
} from '@shared/lib/copyright/copyrightClaimAttachmentMagic';

export const COPYRIGHT_REPORT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

export const COPYRIGHT_REPORT_ATTACHMENT_ACCEPT =
  'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png';

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export function isCopyrightReportAttachmentMimeAllowed(mime: string): boolean {
  const normalized = mime.trim().toLowerCase();
  return (
    normalized === 'application/pdf' || normalized === 'image/jpeg' || normalized === 'image/png'
  );
}

export function inferCopyrightReportAttachmentMime(file: File): string {
  const fromType = file.type.trim().toLowerCase();
  if (fromType && isCopyrightReportAttachmentMimeAllowed(fromType)) {
    return fromType;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? fromType;
}

export type CopyrightReportAttachmentItem = {
  id: string;
  file: File;
};

export type CopyrightReportAttachmentValidationError = 'type' | 'size' | 'duplicate';

export function validateCopyrightReportAttachmentFile(
  file: File
): CopyrightReportAttachmentValidationError | null {
  const mime = inferCopyrightReportAttachmentMime(file);
  if (!isCopyrightReportAttachmentMimeAllowed(mime)) {
    return 'type';
  }
  if (file.type && !isCopyrightReportAttachmentMimeAllowed(file.type.trim().toLowerCase())) {
    return 'type';
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const extMime = MIME_BY_EXT[ext];
  if (extMime && !isCopyrightReportAttachmentMimeAllowed(extMime)) {
    return 'type';
  }
  if (ext && !extMime && !['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
    return 'type';
  }
  if (file.size > COPYRIGHT_REPORT_ATTACHMENT_MAX_BYTES) {
    return 'size';
  }
  return null;
}

/** Re-reads file header; rejects extension spoofing when MIME is known. */
export async function validateCopyrightReportAttachmentFileAsync(
  file: File
): Promise<CopyrightReportAttachmentValidationError | null> {
  const base = validateCopyrightReportAttachmentFile(file);
  if (base) return base;
  const declared = inferCopyrightReportAttachmentMime(file);
  const head = await readCopyrightReportAttachmentMagic(file);
  if (!copyrightClaimAttachmentMimeFromMagic(head)) {
    return 'type';
  }
  if (!copyrightClaimAttachmentMimeMatchesDeclared(declared, head)) {
    return 'type';
  }
  return null;
}
