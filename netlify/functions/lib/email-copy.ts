import type { EmailLocale } from './email-locale';

export interface VerificationEmailCopy {
  subject: string;
  htmlTitle: string;
  greetingNamed: string;
  greetingGeneric: string;
  body: string;
  cta: string;
  copyLinkLabel: string;
  footer: string;
}

export interface AccountDeletedEmailCopy {
  subject: string;
  htmlTitle: string;
  subtitle: string;
  warningTitle: string;
  warningBody: string;
  cta: string;
  footer: string;
  textIntro: string;
  textWarningTitle: string;
  textWarningBody: string;
  textCtaLabel: string;
}

export interface PurchaseEmailCopy {
  subjectPrefix: string;
  /** Plain-text fallback / accessible title (single line). */
  documentTitle: string;
  /** Hero title rendered in two lines: line 1 white, line 2 gold accent. */
  heroTitleLine1: string;
  heroTitleLine2: string;
  greetingNamed: string;
  greetingGeneric: string;
  heroSubtitle: string;
  /** Short atmospheric paragraph describing ownership confirmation. */
  albumDescription: string;
  /** Primary CTA label. `{{siteName}}` is interpolated. */
  ctaLabel: string;
  closingLine1: string;
  closingLine2: string;
  /** Plain-text fallback strings. */
  textThanks: string;
  textCtaLabel: string;
}

export interface PasswordResetEmailCopy {
  subject: string;
  title: string;
  greetingNamed: string;
  greetingGeneric: string;
  body: string;
  cta: string;
  expiryNotice: string;
  fallbackLabel: string;
  ignoreNotice: string;
  footer: string;
}

export interface SupportSubjectsCopy {
  accountDeleted: string;
  purchase: string;
  passwordReset: string;
}

const COPY = {
  supportSubjects: {
    en: {
      accountDeleted: 'Unauthorized account deletion',
      purchase: 'Purchase support',
      passwordReset: 'Password reset help',
    },
    ru: {
      accountDeleted: 'Несанкционированное удаление аккаунта',
      purchase: 'Вопрос по покупке',
      passwordReset: 'Помощь со сбросом пароля',
    },
  },
  verification: {
    en: {
      subject: 'Verify your email',
      htmlTitle: 'Verify your email',
      greetingNamed: 'Hi {{name}},',
      greetingGeneric: 'Hi there,',
      body: 'Thanks for joining {{siteName}}! Please verify your email address to activate your account and unlock all features.',
      cta: 'Verify email address',
      copyLinkLabel: 'Or copy this link:',
      footer: '© {{siteName}}. All rights reserved.',
    },
    ru: {
      subject: 'Подтвердите email',
      htmlTitle: 'Подтвердите email',
      greetingNamed: 'Здравствуйте, {{name}}!',
      greetingGeneric: 'Здравствуйте!',
      body: 'Спасибо, что присоединились к {{siteName}}! Подтвердите email, чтобы активировать аккаунт и открыть все функции.',
      cta: 'Подтвердить email',
      copyLinkLabel: 'Или скопируйте ссылку:',
      footer: '© {{siteName}}. Все права защищены.',
    },
  },
  accountDeleted: {
    en: {
      subject: 'Your account has been deleted',
      htmlTitle: 'Your account has been deleted',
      subtitle:
        'Your account on {{siteName}} and all associated data have been permanently deleted.',
      warningTitle: 'Didn&rsquo;t do this?',
      warningBody:
        'If you didn&rsquo;t delete your account, please contact our support team immediately.',
      cta: 'Contact Support',
      footer: 'This is an automated message, please do not reply.',
      textIntro:
        'Your account on {{siteName}} and all associated data have been permanently deleted.',
      textWarningTitle: "Didn't do this?",
      textWarningBody:
        "If you didn't delete your account, please contact our support team immediately.",
      textCtaLabel: 'Contact Support',
    },
    ru: {
      subject: 'Ваш аккаунт удалён',
      htmlTitle: 'Ваш аккаунт удалён',
      subtitle: 'Ваш аккаунт на {{siteName}} и все связанные данные были безвозвратно удалены.',
      warningTitle: 'Это были не вы?',
      warningBody: 'Если вы не удаляли аккаунт, немедленно свяжитесь с нашей службой поддержки.',
      cta: 'Связаться с поддержкой',
      footer: 'Это автоматическое сообщение, пожалуйста, не отвечайте на него.',
      textIntro: 'Ваш аккаунт на {{siteName}} и все связанные данные были безвозвратно удалены.',
      textWarningTitle: 'Это были не вы?',
      textWarningBody:
        'Если вы не удаляли аккаунт, немедленно свяжитесь с нашей службой поддержки.',
      textCtaLabel: 'Связаться с поддержкой',
    },
  },
  purchase: {
    en: {
      subjectPrefix: 'Thank you for your purchase',
      documentTitle: 'Thank you for your purchase',
      heroTitleLine1: 'Thank you',
      heroTitleLine2: 'for your purchase!',
      greetingNamed: 'Hello, {{name}}!',
      greetingGeneric: 'Hello!',
      heroSubtitle: 'Your purchase was successful.',
      albumDescription:
        'The album is now available in My Purchases. You can stream, download and enjoy it whenever you want.',
      ctaLabel: 'Open in {{siteName}}',
      closingLine1: 'We truly appreciate your support.',
      closingLine2: 'Stay tuned for more music.',
      textThanks: 'Thank you for your purchase.',
      textCtaLabel: 'Open album',
    },
    ru: {
      subjectPrefix: 'Спасибо за покупку',
      documentTitle: 'Спасибо за покупку',
      heroTitleLine1: 'Спасибо',
      heroTitleLine2: 'за покупку!',
      greetingNamed: 'Здравствуйте, {{name}}!',
      greetingGeneric: 'Здравствуйте!',
      heroSubtitle: 'Покупка прошла успешно.',
      albumDescription:
        'Альбом доступен в разделе «Мои покупки». Слушайте, скачивайте и наслаждайтесь им в любое время.',
      ctaLabel: 'Открыть в {{siteName}}',
      closingLine1: 'Спасибо, что поддерживаете нас.',
      closingLine2: 'До встречи в новых релизах.',
      textThanks: 'Спасибо за покупку.',
      textCtaLabel: 'Открыть альбом',
    },
  },
  passwordReset: {
    en: {
      subject: 'Reset your password',
      title: 'Reset your password',
      greetingNamed: 'Hi {{name}},',
      greetingGeneric: 'Hi there,',
      body: 'We received a request to reset the password for your {{siteName}} account. Click the button below to set a new password.',
      cta: 'Reset password',
      expiryNotice: 'This link will expire in {{minutes}} minutes.',
      fallbackLabel: 'Or copy this link into your browser:',
      ignoreNotice:
        "If you didn't request a password reset, you can safely ignore this email. Your password will not change.",
      footer: '© {{siteName}}. All rights reserved.',
    },
    ru: {
      subject: 'Сброс пароля',
      title: 'Сброс пароля',
      greetingNamed: 'Здравствуйте, {{name}}!',
      greetingGeneric: 'Здравствуйте!',
      body: 'Мы получили запрос на сброс пароля для вашего аккаунта на {{siteName}}. Нажмите кнопку ниже, чтобы задать новый пароль.',
      cta: 'Сбросить пароль',
      expiryNotice: 'Ссылка действительна {{minutes}} мин.',
      fallbackLabel: 'Или скопируйте ссылку в браузер:',
      ignoreNotice:
        'Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо. Ваш пароль не изменится.',
      footer: '© {{siteName}}. Все права защищены.',
    },
  },
} as const;

export type EmailCopyKey = keyof typeof COPY;

type EmailCopyByKey = {
  supportSubjects: SupportSubjectsCopy;
  verification: VerificationEmailCopy;
  accountDeleted: AccountDeletedEmailCopy;
  purchase: PurchaseEmailCopy;
  passwordReset: PasswordResetEmailCopy;
};

export function getEmailCopy<K extends EmailCopyKey>(
  key: K,
  locale: EmailLocale
): EmailCopyByKey[K] {
  const resolvedLocale: EmailLocale = locale === 'ru' ? 'ru' : 'en';
  return COPY[key][resolvedLocale] as EmailCopyByKey[K];
}

export function fillEmailTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, value),
    template
  );
}
