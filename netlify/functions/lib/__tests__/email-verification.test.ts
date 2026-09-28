/**
 * Unit tests for email verification token lifecycle (P1-10).
 *
 * In-memory fake `users` table via jest.mock('../db').
 */

interface FakeUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  account_type: string | null;
  is_email_verified: boolean;
  preferred_language: string | null;
  email_verification_token_hash: string | null;
  email_verification_expires_at: Date | null;
  verification_email_sent_at: Date | null;
}

const fakeUsers = new Map<string, FakeUserRow>();

function clearUsers(): void {
  fakeUsers.clear();
}

function seedUser(row: Partial<FakeUserRow> & { id: string; email: string }): FakeUserRow {
  const user: FakeUserRow = {
    name: null,
    role: 'user',
    account_type: 'listener',
    is_email_verified: false,
    preferred_language: null,
    email_verification_token_hash: null,
    email_verification_expires_at: null,
    verification_email_sent_at: null,
    ...row,
  };
  fakeUsers.set(user.id, user);
  return user;
}

jest.mock('../email', () => ({
  sendVerificationEmail: jest.fn(async () => ({ success: true })),
}));

jest.mock('../db', () => ({
  query: jest.fn(async (text: string, params: unknown[] = []) => {
    const sql = text.replace(/\s+/g, ' ').trim();

    if (
      sql.startsWith(
        'UPDATE users SET email_verification_token_hash = $1, email_verification_expires_at = $2'
      )
    ) {
      const [hash, expiresIso, userId] = params as [string, string, string];
      const user = fakeUsers.get(userId);
      if (user) {
        user.email_verification_token_hash = hash;
        user.email_verification_expires_at = new Date(expiresIso);
      }
      return { rows: [] };
    }

    if (
      sql.startsWith(
        'SELECT id, email, name, role, account_type, is_email_verified FROM users WHERE email_verification_token_hash'
      )
    ) {
      const [hash] = params as [string];
      const row = Array.from(fakeUsers.values()).find(
        (u) => u.email_verification_token_hash === hash
      );
      if (!row) return { rows: [] };
      return {
        rows: [
          {
            id: row.id,
            email: row.email,
            name: row.name,
            role: row.role,
            account_type: row.account_type,
            is_email_verified: row.is_email_verified,
          },
        ],
      };
    }

    if (
      sql.startsWith(
        'UPDATE users SET is_email_verified = true, email_verification_token_hash = NULL'
      )
    ) {
      const [userId] = params as [string];
      const user = fakeUsers.get(userId);
      if (user) {
        user.is_email_verified = true;
        user.email_verification_token_hash = null;
        user.email_verification_expires_at = null;
      }
      return { rows: [] };
    }

    if (
      sql.startsWith(
        'UPDATE users SET email_verification_token_hash = NULL, email_verification_expires_at = NULL'
      )
    ) {
      const [userId] = params as [string];
      const user = fakeUsers.get(userId);
      if (user) {
        user.email_verification_token_hash = null;
        user.email_verification_expires_at = null;
      }
      return { rows: [] };
    }

    if (sql.startsWith('SELECT is_email_verified FROM users WHERE id')) {
      const [userId] = params as [string];
      const user = fakeUsers.get(userId);
      return { rows: user ? [{ is_email_verified: user.is_email_verified }] : [] };
    }

    if (sql.startsWith('UPDATE users SET verification_email_sent_at = NOW()')) {
      const [userId] = params as [string];
      const user = fakeUsers.get(userId);
      if (!user) return { rows: [] };
      const now = new Date();
      const last = user.verification_email_sent_at;
      const allowed = last == null || now.getTime() - last.getTime() >= 60_000;
      if (!allowed) return { rows: [] };
      user.verification_email_sent_at = now;
      return { rows: [{ id: user.id }] };
    }

    throw new Error(`Unhandled SQL in mock: ${sql}`);
  }),
}));

import { buildEmailVerificationUrl } from '../public-app-url';
import {
  assignVerificationToken,
  findUserByVerificationToken,
  hashEmailVerificationToken,
  markEmailVerified,
  VERIFICATION_TOKEN_TTL_HOURS,
} from '../email-verification';

beforeEach(() => {
  clearUsers();
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
    now: new Date('2026-01-01T00:00:00Z'),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() < Date.now();
}

describe('hashEmailVerificationToken', () => {
  it('returns a deterministic SHA-256 hex digest', () => {
    const raw = 'a'.repeat(64);
    expect(hashEmailVerificationToken(raw)).toBe(hashEmailVerificationToken(raw));
    expect(hashEmailVerificationToken(raw)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('assignVerificationToken', () => {
  it('stores SHA-256 digest, not the raw token', async () => {
    seedUser({ id: 'u1', email: 'a@b.c' });
    const raw = await assignVerificationToken('u1');
    const user = fakeUsers.get('u1');
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(user?.email_verification_token_hash).toBe(hashEmailVerificationToken(raw));
    expect(user?.email_verification_token_hash).not.toBe(raw);
  });

  it('sets expiry approximately VERIFICATION_TOKEN_TTL_HOURS ahead', async () => {
    seedUser({ id: 'u1', email: 'a@b.c' });
    await assignVerificationToken('u1');
    const user = fakeUsers.get('u1');
    const ttlMs = user!.email_verification_expires_at!.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan((VERIFICATION_TOKEN_TTL_HOURS - 1) * 60 * 60_000);
    expect(ttlMs).toBeLessThanOrEqual(VERIFICATION_TOKEN_TTL_HOURS * 60 * 60_000);
  });
});

describe('findUserByVerificationToken', () => {
  it('resolves the user when given the raw token from email', async () => {
    seedUser({ id: 'u1', email: 'a@b.c' });
    const raw = await assignVerificationToken('u1');
    const found = await findUserByVerificationToken(raw);
    expect(found?.id).toBe('u1');
  });

  it('does not resolve when the URL token is the DB digest', async () => {
    seedUser({ id: 'u1', email: 'a@b.c' });
    const raw = await assignVerificationToken('u1');
    const digest = fakeUsers.get('u1')!.email_verification_token_hash!;
    expect(digest).not.toBe(raw);
    expect(await findUserByVerificationToken(digest)).toBeNull();
  });

  it('rejects expired tokens at consume time (expiry column)', async () => {
    seedUser({ id: 'u1', email: 'a@b.c' });
    const raw = await assignVerificationToken('u1');
    jest.advanceTimersByTime((VERIFICATION_TOKEN_TTL_HOURS + 1) * 60 * 60_000);
    const found = await findUserByVerificationToken(raw);
    expect(found?.id).toBe('u1');
    expect(isExpired(fakeUsers.get('u1')!.email_verification_expires_at)).toBe(true);
  });
});

describe('markEmailVerified', () => {
  it('clears hash and expiry after successful verification', async () => {
    seedUser({ id: 'u1', email: 'a@b.c' });
    await assignVerificationToken('u1');
    await markEmailVerified('u1');
    const user = fakeUsers.get('u1');
    expect(user?.is_email_verified).toBe(true);
    expect(user?.email_verification_token_hash).toBeNull();
    expect(user?.email_verification_expires_at).toBeNull();
  });
});

describe('token rotation on resend', () => {
  it('invalidates the previous raw token and accepts the new one', async () => {
    seedUser({ id: 'u1', email: 'a@b.c' });
    const first = await assignVerificationToken('u1');
    const second = await assignVerificationToken('u1');
    expect(first).not.toBe(second);
    expect(await findUserByVerificationToken(first)).toBeNull();
    expect(await findUserByVerificationToken(second)).not.toBeNull();
  });
});

describe('verification email URL', () => {
  it('embeds the raw token unchanged', async () => {
    seedUser({ id: 'u1', email: 'a@b.c' });
    const raw = await assignVerificationToken('u1');
    const url = buildEmailVerificationUrl(raw);
    expect(url).toContain(`token=${encodeURIComponent(raw)}`);
    expect(url).toMatch(/\/api\/auth\/verify-email\?token=/);
  });
});
