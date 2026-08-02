import { computePasswordStrength } from '@shared/lib/auth/passwordStrength';
import './PasswordStrengthIndicator.scss';

export interface PasswordStrengthLabels {
  veryWeak: string;
  weak: string;
  fair: string;
  good: string;
  strong: string;
}

interface PasswordStrengthIndicatorProps {
  password: string;
  labels: PasswordStrengthLabels;
  id?: string;
  className?: string;
}

export function PasswordStrengthIndicator({
  password,
  labels,
  id,
  className,
}: PasswordStrengthIndicatorProps) {
  const strength = computePasswordStrength(password);
  const strengthLabels = [labels.veryWeak, labels.weak, labels.fair, labels.good, labels.strong];

  return (
    <div className={`password-strength${className ? ` ${className}` : ''}`} aria-hidden={!password}>
      <div className="password-strength__bars">
        {[0, 1, 2, 3, 4].map((idx) => (
          <span
            key={idx}
            className={`password-strength__bar${
              password && idx < strength.score
                ? ` password-strength__bar--filled password-strength__bar--level-${strength.score}`
                : ''
            }`}
          />
        ))}
      </div>
      <span
        id={id}
        className={`password-strength__label password-strength__label--level-${strength.score}`}
      >
        {password ? strengthLabels[Math.max(0, strength.score - 1)] : ''}
      </span>
    </div>
  );
}
