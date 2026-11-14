import { describe, expect, test } from '@jest/globals';

import {
  copyrightClaimAttachmentMimeFromMagic,
  copyrightClaimAttachmentMimeMatchesDeclared,
} from '../copyrightClaimAttachmentMagic';

describe('copyrightClaimAttachmentMagic', () => {
  test('detects PDF magic bytes', () => {
    const head = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(copyrightClaimAttachmentMimeFromMagic(head)).toBe('application/pdf');
  });

  test('detects PNG magic bytes', () => {
    const head = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(copyrightClaimAttachmentMimeFromMagic(head)).toBe('image/png');
  });

  test('rejects exe bytes claimed as pdf', () => {
    const head = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
    expect(copyrightClaimAttachmentMimeMatchesDeclared('application/pdf', head)).toBe(false);
  });
});
