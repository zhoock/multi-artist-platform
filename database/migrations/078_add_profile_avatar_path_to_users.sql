-- Canonical Storage path for account Profile Avatar (not hero/header_images).
ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_avatar_path TEXT;

COMMENT ON COLUMN users.profile_avatar_path IS 'Canonical Supabase Storage path for Profile Avatar (e.g. users/{id}/profile/profile-{hex}-128.webp). Not a proxy or site URL.';
