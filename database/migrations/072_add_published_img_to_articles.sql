-- Snapshot of the last published article cover (shared across locales).
-- Working copy stays in articles.img while has_draft_changes = true.

ALTER TABLE articles
ADD COLUMN IF NOT EXISTS published_img VARCHAR(500) NULL;

COMMENT ON COLUMN articles.published_img IS 'Cover of last published version (shared across locales)';

-- Backfill published articles: public cover equals current img until next draft edit.
UPDATE articles
SET published_img = img
WHERE (is_draft = false OR is_draft IS NULL)
  AND published_img IS NULL
  AND img IS NOT NULL
  AND btrim(img) <> '';
