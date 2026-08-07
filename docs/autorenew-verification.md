# Проверка автопродления подписки

Скрипты для регрессионной проверки цепочки **checkout → конец периода → scheduler → renewal payment → fulfillment → UI**.

## Что гарантирует каждый скрипт

| Скрипт                 | Что проверяет                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `verify:autorenew`     | Полный backend-цикл: checkout → scheduler → renewal → fulfillment → обновление `expires_at` / `next_charge_at` |
| `seed:autorenew-ui`    | Создаёт тестового пользователя в состоянии **после** успешного автопродления (для ручной проверки или UI)      |
| `capture:autorenew-ui` | Проверяет UI «Ваша коллекция» и делает скриншоты до и после обновления страницы                                |

Требуют `DATABASE_URL` в `.env`, миграции `066+`, и для dev-режима:

```bash
SUBSCRIPTION_AUTO_RENEW_ENABLED=true
DEV_PAYMENT_MODE=true
NETLIFY_DEV=true   # период поддержки 1 ч вместо 30 дней
```

## Файлы и команды

| Файл                                    | npm-команда                               | Примечание                                    |
| --------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| `scripts/verify-autorenew-cycle.ts`     | `npm run verify:autorenew`                | Temp-пользователь **удаляется** после прогона |
| `scripts/seed-autorenew-ui-proof.ts`    | `npm run seed:autorenew-ui`               | Пользователь **остаётся в БД**                |
| `scripts/capture-autorenew-ui-proof.ts` | `npm run capture:autorenew-ui -- <email>` | Нужен запущенный dev-сервер и Playwright      |

Пароль seed-пользователя (константа в скриптах): `AutorenewProof1!`

## Быстрый прогон (backend)

```bash
npm run verify:autorenew
```

Успех: `Autorenew cycle proof: PASSED`, exit code `0`.

## UI-доказательство (локально)

1. Запустите dev-сервер (`npm run dev` / `dev:all`).
2. Установите браузер Playwright (один раз): `npx playwright install chromium`
3. Создайте пользователя после renewal:

   ```bash
   npm run seed:autorenew-ui
   ```

   Сохраните `email` из JSON-вывода.

4. Снимите UI (webpack на `:8080`, API на `:8888`):

   ```bash
   npm run capture:autorenew-ui -- autorenew-ui-xxxxxxxx@pr10-e2e.test
   ```

   Скриншоты: `tmp/autorenew-ui-proof/01-after-autorenew.png`, `02-after-page-refresh.png`.

5. Или войдите вручную: http://localhost:8080/dashboard/collection

## Что проверяет capture-скрипт

- `nextChargeLabelVisible` — на странице есть «Следующее списание»
- `supportEndedBannerAbsent` — **нет** баннера «Поддержка завершена»
- `activePlanVisible` — отображается текущий план
- те же проверки после `page.reload()`

Переменные `showsSupportEndedBanner*` в коде означают «баннер **виден**» (плохо); в JSON-отчёте используются положительные имена `supportEndedBannerAbsent*`.

## Очистка seed-пользователя

```sql
DELETE FROM subscription_payments WHERE user_id = '<uuid>';
DELETE FROM subscriptions WHERE user_id = '<uuid>';
DELETE FROM users WHERE id = '<uuid>';
```

`userId` печатается в выводе `seed:autorenew-ui`.

## Связанное

- Sidecar scheduler: `docs/LOCAL-DEVELOPMENT.md` → «Автопродление локально»
- Dev checkout: `docs/dev-payment-mode.md`
