-- Email verification tokens at rest (P1-10).
--
-- Plaintext tokens must never be persisted. The hex value in the verification
-- email is hashed with SHA-256; only the digest is stored in
-- email_verification_token_hash. GET /api/auth/verify-email hashes the
-- supplied token before lookup.
--
-- Testing cutover: drop legacy plaintext column and invalidate outstanding tokens.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verification_token_hash TEXT;

UPDATE users
  SET email_verification_token = NULL,
      email_verification_expires_at = NULL
  WHERE email_verification_token IS NOT NULL
     OR email_verification_expires_at IS NOT NULL;

DROP INDEX IF EXISTS idx_users_email_verification_token;

ALTER TABLE users
  DROP COLUMN IF EXISTS email_verification_token;

CREATE INDEX IF NOT EXISTS idx_users_email_verification_token_hash
  ON users (email_verification_token_hash)
  WHERE email_verification_token_hash IS NOT NULL;

COMMENT ON COLUMN users.email_verification_token_hash IS
  'SHA-256 hex digest of the active email verification token (NULL when none).';
