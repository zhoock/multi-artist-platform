-- Миграция: черновые изменения опубликованных статей (отдельно от is_draft)
-- has_draft_changes = true: в редакторе есть несохранённые в публичную версию правки
-- published_*: снимок последней опубликованной версии локали

ALTER TABLE articles
ADD COLUMN IF NOT EXISTS has_draft_changes BOOLEAN DEFAULT false;

ALTER TABLE articles
ADD COLUMN IF NOT EXISTS published_name_article VARCHAR(500) NULL;

ALTER TABLE articles
ADD COLUMN IF NOT EXISTS published_description TEXT NULL;

ALTER TABLE articles
ADD COLUMN IF NOT EXISTS published_details JSONB NULL;

CREATE INDEX IF NOT EXISTS idx_articles_has_draft_changes ON articles(has_draft_changes);

COMMENT ON COLUMN articles.has_draft_changes IS 'У опубликованной статьи есть несохранённые в live-версию правки';
COMMENT ON COLUMN articles.published_name_article IS 'Заголовок последней опубликованной версии (локаль)';
COMMENT ON COLUMN articles.published_description IS 'Описание последней опубликованной версии (локаль)';
COMMENT ON COLUMN articles.published_details IS 'Контент последней опубликованной версии (локаль)';

-- Снимок для уже опубликованных статей
UPDATE articles
SET
  published_name_article = name_article,
  published_description = description,
  published_details = details,
  has_draft_changes = false
WHERE is_draft = false OR is_draft IS NULL;
