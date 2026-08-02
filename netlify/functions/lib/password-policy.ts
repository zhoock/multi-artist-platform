/** Minimum password length enforced across registration, reset, and change-password flows. */
export const MIN_PASSWORD_LENGTH = 8;

/** Upper bound keeps bcrypt costs predictable. */
export const MAX_PASSWORD_LENGTH = 200;

export interface PasswordPolicyError {
  code: 'PASSWORD_TOO_SHORT' | 'PASSWORD_TOO_LONG' | 'PASSWORD_REQUIRED';
  message: string;
}

export function validatePassword(password: unknown): PasswordPolicyError | null {
  if (typeof password !== 'string' || password.length === 0) {
    return { code: 'PASSWORD_REQUIRED', message: 'Password is required' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      code: 'PASSWORD_TOO_SHORT',
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { code: 'PASSWORD_TOO_LONG', message: 'Password is too long' };
  }
  return null;
}

/** @deprecated Use `validatePassword`. Kept for existing reset-password imports. */
export const validateNewPassword = validatePassword;

/** @deprecated Use `MIN_PASSWORD_LENGTH`. Kept for existing reset-password imports. */
export const PASSWORD_RESET_MIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH;
