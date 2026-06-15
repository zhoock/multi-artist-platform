import { useMemo } from 'react';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';

export function useEmailVerificationCopy() {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const ev = ui?.auth?.emailVerification;

  return useMemo(() => {
    const en = lang !== 'ru';
    const fallback = en
      ? {
          verifyTitle: 'Verify your email',
          verifyBody:
            'We use email confirmation to protect your account and access to content publishing.',
          sendConfirmationEmail: 'Send confirmation email',
          emailWillBeSentTo: 'The email will be sent to {{email}}',
          onboardingBodyAlbums:
            'We use email confirmation to protect your account and access to music uploads.',
          onboardingBodyPosts:
            'We use email confirmation to protect your account and access to article publishing.',
          onboardingBodyMixer:
            'We use email confirmation to protect your account and access to mixer tools.',
          onboardingBodyPaymentSettings:
            'We use email confirmation to protect your account and access to payment settings.',
          onboardingBodyContent:
            'We use email confirmation to protect your account and access to content publishing.',
          resendEmail: 'Resend email',
          changeEmail: 'Change email',
          continueLater: 'Continue later',
          bannerText: 'Verify your email to unlock all features',
          bannerSubtitle: 'We sent a verification link to {{email}}',
          successTitle: 'Email verified',
          successBody:
            'Your email has been successfully verified. You now have full access to all features.',
          continue: 'Continue',
          continueToHome: 'Continue to Home',
          openDashboard: 'Open dashboard',
          openDashboardPrefix: 'Or open your ',
          openDashboardLink: 'dashboard',
          expiredTitle: 'Verification link expired',
          expiredBody: 'This link is no longer valid.',
          sendNewLink: 'Send new link',
          backToLogin: 'Back to login',
          changeEmailTitle: 'Change email',
          changeEmailBody:
            "Enter your new email address. We'll send a verification link to the new email.",
          newEmailLabel: 'New email',
          newEmailPlaceholder: 'name@example.com',
          sendVerificationEmail: 'Send verification email',
          cancel: 'Cancel',
          back: 'Back',
          restrictedHint: 'Verify your email to unlock',
          emailRequired: 'Enter your email',
          emailInvalid: 'Enter a valid email address',
          resendFailed: 'Could not send email. Try again later.',
          resendCooldown: 'Please wait {{seconds}} seconds before requesting another email.',
          resendRateLimited: 'Too many requests. Please try again later.',
          verificationSentTitle: 'Verification email sent',
          verificationSentBody: 'Check your inbox for a new verification link.',
          submitting: 'Sending…',
          close: 'Close',
          restrictedPremium: 'Verify your email to purchase Premium',
          restrictedUpload: 'Verify your email to upload content',
          restrictedPaymentSettings: 'Payment Settings',
          restrictedPaymentSettingsHint: 'Verify your email to configure payment settings',
          restrictedMixer: 'Mixer',
          restrictedMixerHint: 'Verify your email to upload stems and manage the mixer',
        }
      : {
          verifyTitle: 'Подтвердите email',
          verifyBody:
            'Мы используем подтверждение email для защиты вашего аккаунта и доступа к публикации контента.',
          sendConfirmationEmail: 'Отправить письмо для подтверждения',
          emailWillBeSentTo: 'Письмо придёт на {{email}}',
          onboardingBodyAlbums:
            'Мы используем подтверждение email для защиты вашего аккаунта и доступа к загрузке музыки.',
          onboardingBodyPosts:
            'Мы используем подтверждение email для защиты вашего аккаунта и доступа к публикации статей.',
          onboardingBodyMixer:
            'Мы используем подтверждение email для защиты вашего аккаунта и доступа к инструментам миксера.',
          onboardingBodyPaymentSettings:
            'Мы используем подтверждение email для защиты вашего аккаунта и доступа к настройке приёма платежей.',
          onboardingBodyContent:
            'Мы используем подтверждение email для защиты вашего аккаунта и доступа к публикации контента.',
          resendEmail: 'Отправить снова',
          changeEmail: 'Изменить email',
          continueLater: 'Продолжить позже',
          bannerText: 'Подтвердите email, чтобы открыть все функции',
          bannerSubtitle: 'Мы отправили ссылку для подтверждения на {{email}}',
          successTitle: 'Email подтверждён',
          successBody: 'Ваш email успешно подтверждён. Теперь вам доступны все функции проекта.',
          continue: 'Продолжить',
          continueToHome: 'На главную',
          openDashboard: 'Открыть дашборд',
          openDashboardPrefix: 'Или открыть ',
          openDashboardLink: 'дашборд',
          expiredTitle: 'Ссылка устарела',
          expiredBody: 'Ссылка больше не действительна.',
          sendNewLink: 'Отправить новую ссылку',
          backToLogin: 'Вернуться ко входу',
          changeEmailTitle: 'Изменить email',
          changeEmailBody:
            'Укажите новый email. Мы отправим ссылку для подтверждения на новый адрес.',
          newEmailLabel: 'Новый email',
          newEmailPlaceholder: 'name@example.com',
          sendVerificationEmail: 'Отправить письмо',
          cancel: 'Отмена',
          back: 'Назад',
          restrictedHint: 'Подтвердите email для доступа',
          emailRequired: 'Укажите email',
          emailInvalid: 'Укажите корректный email',
          resendFailed: 'Не удалось отправить письмо. Попробуйте позже.',
          resendCooldown: 'Подождите {{seconds}} сек. перед повторной отправкой.',
          resendRateLimited: 'Слишком много запросов. Попробуйте позже.',
          verificationSentTitle: 'Письмо отправлено',
          verificationSentBody: 'Проверьте почту — мы прислали новую ссылку для подтверждения.',
          submitting: 'Отправка…',
          close: 'Закрыть',
          restrictedPremium: 'Подтвердите email, чтобы оформить Premium',
          restrictedUpload: 'Подтвердите email, чтобы загружать контент',
          restrictedPaymentSettings: 'Платежи',
          restrictedPaymentSettingsHint: 'Подтвердите email, чтобы настроить приём платежей',
          restrictedMixer: 'Миксер',
          restrictedMixerHint: 'Подтвердите email, чтобы загружать стемы и управлять миксером',
        };
    return { ...fallback, ...ev };
  }, [lang, ev]);
}
