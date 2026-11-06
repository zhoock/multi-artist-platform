-- Platform admin flag for Admin Panel access (separate from account_type listener|artist).
-- Backing enforcement: application checks DB/JWT; trigger blocks privilege self-service updates.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.is_admin IS 'Platform administrator; grants Admin Panel access when true. Not user-selectable via API.';

CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users (is_admin) WHERE is_admin = true;

-- Block client/app connections from changing admin flags unless explicitly allowed in-session (e.g. DBA maintenance).
CREATE OR REPLACE FUNCTION public.enforce_users_admin_flags_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_admin IS TRUE OR NEW.role = 'admin' THEN
      IF current_setting('app.allow_user_privilege_mutation', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Privilege fields cannot be set without authorization'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin OR NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_setting('app.allow_user_privilege_mutation', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Privilege fields cannot be changed without authorization'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_enforce_admin_flags ON users;

CREATE TRIGGER trg_users_enforce_admin_flags
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_users_admin_flags_immutable();
