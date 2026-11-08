-- Restore JSONB `albums.cover` for { img, playerBackground } (migration 015 flattened to TEXT).
-- Safe for plain string covers: quoted jsonb strings become {"img":"<base>"}.

ALTER TABLE albums
  ALTER COLUMN cover TYPE jsonb
  USING (
    CASE
      WHEN cover IS NULL OR btrim(cover) = '' THEN NULL
      WHEN cover ~ '^\s*\{' THEN cover::jsonb
      ELSE jsonb_build_object('img', trim(both '"' from btrim(cover)))
    END
  );
