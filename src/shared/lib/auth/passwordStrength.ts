/**
 * Lightweight password-strength heuristic for auth forms.
 *
 * Goal: give the user a fast visual cue while typing — NOT a security check.
 * Real password policy is enforced server-side (`netlify/functions/lib/password-policy.ts`).
 *
 * Score is an integer 0..5:
 *   0 — empty
 *   1 — very weak  (< MIN_PASSWORD_LENGTH chars)
 *   2 — weak
 *   3 — fair
 *   4 — good
 *   5 — strong
 */

import { MIN_PASSWORD_LENGTH } from './passwordPolicy';

export interface PasswordStrength {
  /** 0..5 — used both for the bar fill count and the localized label. */
  score: number;
  /** True iff the password meets the absolute minimum length policy. */
  meetsMinLength: boolean;
}

function classesPresent(password: string): number {
  let classes = 0;
  if (/[a-z]/.test(password)) classes += 1;
  if (/[A-Z]/.test(password)) classes += 1;
  if (/\d/.test(password)) classes += 1;
  // Anything that isn't a letter or a digit counts as a "symbol" class.
  if (/[^A-Za-z0-9]/.test(password)) classes += 1;
  return classes;
}

export function computePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, meetsMinLength: false };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { score: 1, meetsMinLength: false };
  }

  const classes = classesPresent(password);
  const longish = password.length >= 12;
  const longEnough = password.length >= 16;

  // Below-min already handled above.
  let score: number;
  if (classes <= 1) {
    score = 2;
  } else if (classes === 2) {
    score = longish ? 3 : 2;
  } else if (classes === 3) {
    score = longEnough ? 5 : 4;
  } else {
    score = longEnough ? 5 : 4;
  }

  return { score, meetsMinLength: true };
}
