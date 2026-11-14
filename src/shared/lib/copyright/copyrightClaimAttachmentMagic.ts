export type CopyrightClaimAttachmentMime = 'application/pdf' | 'image/jpeg' | 'image/png';

export function copyrightClaimAttachmentMimeFromMagic(
  head: Uint8Array
): CopyrightClaimAttachmentMime | null {
  if (head.length >= 4) {
    if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) {
      return 'application/pdf';
    }
    if (
      head[0] === 0x89 &&
      head[1] === 0x50 &&
      head[2] === 0x4e &&
      head[3] === 0x47 &&
      head[4] === 0x0d &&
      head[5] === 0x0a &&
      head[6] === 0x1a &&
      head[7] === 0x0a
    ) {
      return 'image/png';
    }
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
      return 'image/jpeg';
    }
  }
  return null;
}

export function copyrightClaimAttachmentMimeMatchesDeclared(
  declared: string,
  head: Uint8Array
): boolean {
  const detected = copyrightClaimAttachmentMimeFromMagic(head);
  if (!detected) return false;
  return declared.trim().toLowerCase() === detected;
}

export async function readCopyrightClaimAttachmentMagic(file: File): Promise<Uint8Array> {
  const buf = await file.slice(0, 16).arrayBuffer();
  return new Uint8Array(buf);
}
