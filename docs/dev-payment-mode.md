# Development Payment Mode

Локальный режим для тестирования покупок **без перехода в YooKassa**. Использует те же post-payment flow, что и production.

Работает **только в development**. На production deploy (`CONTEXT=production`) режим принудительно выключен, даже если переменная задана в env.

## Включить

В `.env` или `.env.local`:

```bash
DEV_PAYMENT_MODE=true
```

Перезапустите `netlify dev` после изменения.

`DEV_PAYMENT_MODE` — серверный флаг (Netlify Functions). Решение принимает только он; клиентский `VITE_DEV_PAYMENT_MODE` на поведение checkout не влияет.

## Что делает

### Альбомы

1. `POST /api/create-payment` создаёт заказ и payment со статусом `succeeded` (с dev-маркером в БД).
2. YooKassa **не** вызывается, `confirmationUrl` не возвращается.
3. Checkout редиректит на `/pay/status?orderId=...&returnTo=...`.
4. `GET /api/get-payment-status` читает payment из БД и вызывает `applyAlbumPaymentSuccess()` — **единственная точка fulfillment**, как после возврата с YooKassa.
5. Дальше — обычный UI: `PaymentStatus` → `PaymentSuccess` → toast, автовозврат, My Purchases, email.

### Подписки (Premium)

1. `POST /api/create-subscription-payment` создаёт `subscription_payments` и помечает payment как `succeeded` (dev-маркер в `raw_last_event`).
2. YooKassa **не** вызывается, `confirmationUrl` не возвращается.
3. Checkout редиректит на `/pay/subscription-success?subscriptionPaymentId=...&returnTo=...`.
4. `GET /api/get-subscription-payment-status` читает payment из БД и вызывает `fulfillSubscriptionPayment()` — **единственная точка fulfillment**, как после возврата с YooKassa.
5. Дальше — обычный UI: `SubscriptionPaymentSuccess` → активация Premium, автовозврат.

## Схема потока

### Альбомы

```
Checkout → create-payment (dev: payment succeeded, без YooKassa)
         → /pay/status
         → get-payment-status → applyAlbumPaymentSuccess()
         → PaymentSuccess → purchase / email / returnTo
```

### Подписки

```
Checkout → create-subscription-payment (dev: payment succeeded, без YooKassa)
         → /pay/subscription-success
         → get-subscription-payment-status → fulfillSubscriptionPayment()
         → SubscriptionPaymentSuccess → Premium activated / returnTo
```

В production между create-\* и status-страницей вставлен redirect в YooKassa; fulfillment и UI — те же.

## Логи в терминале

При активном режиме в `netlify dev` в логах функций виден единый блок:

```
🧪 DEV PAYMENT MODE
Type: album | subscription
...
Skipping YooKassa
Redirect → /pay/status?...   (create)
Fulfillment → ...            (get-*-status)
```

Ищите строку `🧪 DEV PAYMENT MODE` — сразу понятно, что checkout прошёл без YooKassa.

## Что НЕ меняет

- production (при выключенном флаге код идёт в YooKassa без изменений);
- `PaymentStatus` / `PaymentSuccess` / `SubscriptionPaymentSuccess`;
- выдачу покупки (`upsertPurchaseRecord`) и активацию подписки (`fulfillSubscriptionPayment`);
- письма (`sendPurchaseEmail` + dedupe);
- My Purchases / Premium entitlements.

## Отключение

```bash
DEV_PAYMENT_MODE=false
```

или удалите переменную из `.env`. Перезапустите `netlify dev`. Checkout снова использует YooKassa (нужны credentials продавца в БД для альбомов или env для подписок).

## См. также

- `.env.example` — комментарии к переменным
- `docs/SETUP-PAYMENTS.md`, `docs/yookassa-setup.md` — настройка реальных платежей
