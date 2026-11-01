# Применение миграций аналитики аудитории (082 + 083)

## Что меняется

- **Добавляется** только таблица `qualified_track_plays` (индексы, CHECK, FK на `users` и `tracks`).
- **Не изменяются** существующие таблицы, подписки, платежи, Storage, пользовательские данные.
- **083** включает RLS без policies и отзывает права у `PUBLIC`, `anon`, `authenticated` **только** на эту таблицу.

## Предварительные условия

1. **`DATABASE_URL`** в окружении указывает на целевую Supabase Postgres (transaction pooler, порт 6543 — как в `.env.example`).
2. **Резервная копия:** в Supabase Dashboard → Project → **Database → Backups**. Через SQL наличие бэкапа **не проверяется** — перед apply убедитесь вручную.
3. В `COMMENT ON ...` не используйте символ `;` внутри одинарных кавычек — runner режет SQL по `;` (исправлено в 082).
4. Установлены зависимости: `npm ci`.

## Способ A — официальный runner (рекомендуется)

Применяет **только** файлы из `database/migrations/`, которых ещё нет в `schema_migrations`, и записывает их туда.

Перед запуском убедитесь, что в очереди **нет других** pending-миграций (кроме 082 и 083):

```bash
# pending = все *.sql в database/migrations минус schema_migrations
npx tsx scripts/migrate-database.ts
```

Combined SQL для ручного запуска лежит в `database/manual/082_083_qualified_track_plays_combined.sql` (не подхватывается runner’ом).

## Способ B — одна миграция / combined SQL

```bash
npx tsx scripts/apply-single-migration.ts 082_create_qualified_track_plays.sql
npx tsx scripts/apply-single-migration.ts 083_harden_qualified_track_plays_rls.sql
```

Или combined (эквивалент 082+083) через SQL Editor / `psql` и файл `database/manual/082_083_qualified_track_plays_combined.sql`, затем вручную `INSERT` в `schema_migrations` для 082 и 083.

После **способа B** отметьте миграции в учёте (если используете `schema_migrations`):

```sql
INSERT INTO schema_migrations (filename) VALUES
  ('082_create_qualified_track_plays.sql'),
  ('083_harden_qualified_track_plays_rls.sql')
ON CONFLICT (filename) DO NOTHING;
```

## Проверка после применения

```bash
node scripts/check-qualified-plays-db-role.mjs
node scripts/verify-audience-migrations-applied.mjs
npx tsx scripts/smoke-audience-api-integration.ts   # handlers + DATABASE_URL, без HTTP
```

На production URL (`https://smolyanoechuchelko.ru/api/...`) smoke возможен **после деплоя** функций; до деплоя endpoints могут отдавать 404.

## Откат

См. `database/migrations/ROLLBACK_082_083_AUDIENCE.md`.
