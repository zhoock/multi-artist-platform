# Настройка ЮKassa для оплаты картой

Платформа **multi-tenant**: `shopId` и секрет API ЮKassa задаются **артистом в настройках оплаты** и хранятся в БД (`user_payment_settings`), а не через глобальные `YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY` в Netlify.

## Переменные окружения (Netlify / `.env`)

### Обязательные для платёжного контура

- `DATABASE_URL` — PostgreSQL
- `ENCRYPTION_KEY` — шифрование `secret_key_encrypted` в БД

### Опциональные (общие настройки API / поведения)

- `YOOKASSA_API_URL` — по умолчанию `https://api.yookassa.ru/v3/payments`
- `YOOKASSA_RETURN_URL` — fallback URL возврата после оплаты
- `YOOKASSA_TEST_MODE` — для логов/доков (см. `create-payment`)
- `SKIP_YOOKASSA_VALIDATION` — сохранение кредов в ЛК без строгой проверки (серверная функция)

### Legacy / не используются рантаймом оплаты

Переменные **`YOOKASSA_SHOP_ID`** и **`YOOKASSA_SECRET_KEY`** в Netlify **не читаются** функциями создания платежа и health-check. Их можно **не задавать**. Оставшиеся в окружении значения ни на build, ни на deploy не влияют на tenant-only поток.

### Пример блока в Netlify (без глобального магазина)

```
DATABASE_URL=postgresql://...
ENCRYPTION_KEY=...
YOOKASSA_API_URL=https://api.yookassa.ru/v3/payments
```

## Подключение ЮKassa артистом

Креды своего магазина сохраняются через UI (dashboard) → **`POST /api/payment-settings`** в БД. См. `docs/database-setup.md`, раздел платежные настройки.

## Настройка webhook

У **каждого** продавца в личном кабинете ЮKassa задаётся тот же URL вашего приложения (если используете webhook):

1. https://yookassa.ru/my → **Настройки** → **HTTP-уведомления**
2. URL: `https://your-site.netlify.app/.netlify/functions/payment-webhook` (или ваш `/api/payment-webhook` при проксировании)
3. События: `payment.succeeded`, `payment.canceled`, при необходимости `payment.waiting_for_capture`

_(Проверка подписи webhook в коде желательна усилить под multi-tenant — см. отдельные задачи по безопасности.)_

## Миграция базы данных

Перед использованием оплаты выполните миграции (в т.ч. `user_payment_settings`, заказы):

```sql
-- См. database/migrations/
-- 001_create_payment_settings.sql, 020_create_orders_and_payments.sql
```

## Тестирование

- Тестовые карты: https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing
- Тестовый `shop_id` / секрет берутся из кабинета **тестового** магазина и сохраняются через настройки артиста в БД.

### Проверка работы

1. Артист подключает ЮKassa в ЛК сайта
2. Создайте заказ на сайте → «Оплатить»
3. Редирект на ЮKassa, возврат на `/pay/status?orderId=...`, затем на `/pay/success` или `/pay/fail` по фактическому статусу

## Архитектура (кратко)

1. `POST /api/create-payment` → продавец из БД по альбому → `getDecryptedSecretKey` → API ЮKassa
2. Webhook обновляет `payments` / `orders`

## Безопасность

- Секрет продавца в БД в зашифрованном виде; мастер-ключ только `ENCRYPTION_KEY` в окружении
- Полный секрет через API клиенту не отдаётся

## Отладка

Логи Netlify Functions (`create-payment`, `payment-webhook`). См. `docs/YOOKASSA-DIAGNOSTICS.md` и `GET /api/yookassa-health`.
