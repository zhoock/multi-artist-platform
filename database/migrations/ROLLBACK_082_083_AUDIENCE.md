# Откат миграций 082 + 083 (только `qualified_track_plays`)

## Что будет потеряно

При откате **удаляются все строки** в `qualified_track_plays`:

- квалифицированные прослушивания;
- агрегаты вкладки «Аудитория» (слушатели, plays, timeline, топ треков из этой таблицы).

Данные **users**, **tracks**, **albums**, **subscriptions**, **user_archive**, Storage и платежи **не затрагиваются**.

## SQL отката

Выполнить один раз от имени роли с правом `DROP` (обычно `postgres` / pooler user):

```sql
BEGIN;

DROP TABLE IF EXISTS qualified_track_plays CASCADE;

DELETE FROM schema_migrations
WHERE filename IN (
  '082_create_qualified_track_plays.sql',
  '083_harden_qualified_track_plays_rls.sql',
  '082_083_qualified_track_plays_combined.sql'
);

COMMIT;
```

`CASCADE` снимает индексы и политики, связанные только с этой таблицей. FK **на** `qualified_track_plays` из других таблиц в проекте **нет**.

## После отката

- Клиент может продолжать вызывать `POST /api/record-qualified-play` — будет ошибка БД до повторного применения 082.
- Вкладка «Аудитория» покажет пустую статистику или ошибку загрузки.

## Повторное применение

Снова выполните `082` и `083` (или combined) по инструкции `APPLY_082_083_AUDIENCE.md`.
