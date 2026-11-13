-- Single user agreement acceptance at registration; remove per-content rights confirmation.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS user_agreement_version INT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS user_agreement_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN users.user_agreement_version IS
  'Version of the User Agreement accepted at registration (or later re-acceptance).';
COMMENT ON COLUMN users.user_agreement_accepted_at IS
  'Timestamp when the user accepted the User Agreement version in user_agreement_version.';

DROP TABLE IF EXISTS content_rights_confirmations;

ALTER TABLE albums DROP COLUMN IF EXISTS rights_material_epoch;
ALTER TABLE tracks DROP COLUMN IF EXISTS rights_material_epoch;
ALTER TABLE articles DROP COLUMN IF EXISTS rights_material_epoch;
ALTER TABLE users DROP COLUMN IF EXISTS rights_material_epoch;
ALTER TABLE users DROP COLUMN IF EXISTS header_image_rights_epoch;
