import { CircleAlert as CircleAlertIcon, CircleCheck as CircleCheckIcon } from 'lucide-react';

import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useLang } from '@app/providers/lang';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

import './SettingsEmailVerificationStatus.scss';

type SettingsEmailVerificationStatusProps = {
  verified: boolean;
};

const emailVerificationIconProps = {
  ...dashboardActionIconProps({ size: 16 }),
  className: 'settings-email-verification__icon',
};

export function SettingsEmailVerificationStatus({
  verified,
}: SettingsEmailVerificationStatusProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.dashboard?.profileFields?.emailVerification;

  if (verified) {
    return (
      <div
        className="settings-email-verification settings-email-verification--verified"
        role="status"
      >
        <CircleCheckIcon {...emailVerificationIconProps} />
        <span>{copy?.verified ?? 'Verified'}</span>
      </div>
    );
  }

  return (
    <div
      className="settings-email-verification settings-email-verification--unverified"
      role="status"
    >
      <div className="settings-email-verification__row">
        <CircleAlertIcon {...emailVerificationIconProps} />
        <span className="settings-email-verification__title">
          {copy?.notVerified ?? 'Email not verified'}
        </span>
      </div>
      <p className="settings-email-verification__hint">
        {copy?.notVerifiedHint ??
          'Please verify your email to unlock all features and secure your account.'}
      </p>
    </div>
  );
}
