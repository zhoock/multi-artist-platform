import type { EmailLocale } from './email-locale';
import { getEmailCopy } from './email-copy';
import { buildSupportMailtoHref, getSupportEmail } from '../../../src/shared/lib/supportEmail';

export { getSupportEmail };

export type SupportMailtoTemplate = 'accountDeleted' | 'purchase' | 'passwordReset';

export function buildSupportMailto(options?: {
  locale?: EmailLocale;
  template?: SupportMailtoTemplate;
  subject?: string;
}): string {
  const locale = options?.locale ?? 'en';
  const subject =
    options?.subject ??
    (options?.template ? getEmailCopy('supportSubjects', locale)[options.template] : undefined);

  return buildSupportMailtoHref({ subject });
}
