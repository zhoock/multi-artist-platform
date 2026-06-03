import { CircleAlert as CircleAlertIcon, CircleCheck as CircleCheckIcon } from 'lucide-react';

import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useLang } from '@app/providers/lang';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import { dashboardActionIconProps } from '@shared/ui/icons/dashboardActionIcon';

import './ProfileEmailVerificationStatus.scss';

type ProfileEmailVerificationStatusProps = {
  verified: boolean;
};

const emailVerificationIconProps = {
  ...dashboardActionIconProps({ size: 16 }),
  className: 'profile-email-verification__icon',
};

export function ProfileEmailVerificationStatus({ verified }: ProfileEmailVerificationStatusProps) {
  const { lang } = useLang();
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.dashboard?.profileFields?.emailVerification;

  if (verified) {
    return (
      <div
        className="profile-email-verification profile-email-verification--verified"
        role="status"
      >
        <CircleCheckIcon {...emailVerificationIconProps} />
        <span>{copy?.verified ?? 'Verified'}</span>
      </div>
    );
  }

  return (
    <div
      className="profile-email-verification profile-email-verification--unverified"
      role="status"
    >
      <div className="profile-email-verification__row">
        <CircleAlertIcon {...emailVerificationIconProps} />
        <span className="profile-email-verification__title">
          {copy?.notVerified ?? 'Email not verified'}
        </span>
      </div>
      <p className="profile-email-verification__hint">
        {copy?.notVerifiedHint ??
          'Please verify your email to unlock all features and secure your account.'}
      </p>
    </div>
  );
}
