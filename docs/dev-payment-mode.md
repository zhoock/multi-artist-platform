# Development Payment Mode

Локальный режим для тестирования покупки альбома **без перехода в YooKassa**. Использует тот же post-payment flow, что и production: `PaymentStatus` → `PaymentSuccess` → выдача покупки, письмо, My Purchases, `returnTo`.

Работает **только в development**. На production deploy (`CONTEXT=production`) режим принудительно выключен, даже если переменная задана в env.

## Включить

В `.env` или `.env.local`:

```bash
DEV_PAYMENT_MODE=true
```

Перезапустите `netlify dev` после изменения.

`DEV_PAYMENT_MODE` — серверный флаг (Netlify Functions). Решение принимает только он; клиентский `VITE_DEV_PAYMENT_MODE` на поведение checkout не влияет.

## Что делает

1. `POST /api/create-payment` создаёт заказ и payment со статусом `succeeded` (с dev-маркером в БД).
2. YooKassa **не** вызывается, `confirmationUrl` не возвращается.
3. Checkout редиректит на `/pay/status?orderId=...&returnTo=...`.
4. `GET /api/get-payment-status` читает payment из БД и вызывает `applyAlbumPaymentSuccess()` — **единственная точка fulfillment**, как после возврата с YooKassa.
5. Дальше — обычный UI: `PaymentStatus` → `PaymentSuccess` → toast, автовозврат, My Purchases, email.

## Схема потока

```
Checkout → create-payment (dev: payment succeeded, без YooKassa)
         → /pay/status
         → get-payment-status → applyAlbumPaymentSuccess()
         → PaymentSuccess → purchase / email / returnTo
```

В production между `create-payment` и `/pay/status` вставлен redirect в YooKassa; fulfillment и UI — те же.

## Что НЕ меняет

- production (при выключенном флаге код идёт в YooKassa без изменений);
- `PaymentStatus` / `PaymentSuccess`;
- выдачу покупки (`upsertPurchaseRecord`);
- письма (`sendPurchaseEmail` + dedupe);
- My Purchases.

## Отключение

```bash
DEV_PAYMENT_MODE=false
```

или удалите переменную из `.env`. Перезапустите `netlify dev`. Checkout снова использует YooKassa (нужны credentials продавца в БД).

## См. также

- `.env.example` — комментарии к переменным
- `docs/SETUP-PAYMENTS.md`, `docs/yookassa-setup.md` — настройка реальных платежей
