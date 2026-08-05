# Architecture Decision Records (ADR)

Краткие записи **почему** принято то или иное архитектурное решение.  
Если через год спросят «зачем так» — ответ здесь, а не в истории чатов.

## Формат

Каждый ADR содержит:

- **Status** — `Accepted`, `Superseded`, `Deprecated`
- **Context** — проблема и ограничения
- **Decision** — что решили
- **Consequences** — плюсы, минусы, что следует из решения

Новые ADR нумеруются последовательно. При отмене решения старый ADR помечается `Superseded` со ссылкой на новый.

## Индекс

| ID      | Тема                                            | Документ                                                                                                                     |
| ------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| —       | **Implementation status (PR-1…12)**             | [subscription-implementation-status.md](./subscription-implementation-status.md)                                             |
| ADR-001 | Статус подписки — только backend                | [subscription-premium-billing.md](./subscription-premium-billing.md#adr-001-subscription-status-is-backend-only)             |
| ADR-002 | BillingScreen — только через resolver           | [subscription-premium-billing.md](./subscription-premium-billing.md#adr-002-billingscreen-is-derived-only-via-resolver)      |
| ADR-003 | UI не вычисляет hasPremiumAccess                | [subscription-premium-billing.md](./subscription-premium-billing.md#adr-003-ui-never-computes-haspremiumaccess)              |
| ADR-004 | Без optimistic billing UI                       | [subscription-premium-billing.md](./subscription-premium-billing.md#adr-004-no-optimistic-billing-ui)                        |
| ADR-005 | Upgrade — полная оплата и новый 30-дневный цикл | [subscription-premium-billing.md](./subscription-premium-billing.md#adr-005-upgrade-starts-a-new-30-day-billing-cycle)       |
| ADR-006 | Downgrade — со следующего периода               | [subscription-premium-billing.md](./subscription-premium-billing.md#adr-006-downgrade-takes-effect-at-next-period)           |
| ADR-007 | Grace period с сохранением доступа              | [subscription-premium-billing.md](./subscription-premium-billing.md#adr-007-grace-period-with-continued-premium-access)      |
| ADR-008 | Автопродление через ЮKassa на стороне магазина  | [subscription-premium-billing.md](./subscription-premium-billing.md#adr-008-yookassa-recurring-is-merchant-managed)          |
| ADR-009 | Раздельные fulfillment pipelines                | [subscription-premium-billing.md](./subscription-premium-billing.md#adr-009-subscription-fulfillment-pipelines-are-separate) |

## State ownership (Premium billing)

| Что                       | Источник истины                                        |
| ------------------------- | ------------------------------------------------------ |
| Subscription `status`     | Backend (`subscriptions.status`)                       |
| `hasPremiumAccess`        | Backend (API snapshot)                                 |
| `autoRenewEnabled`        | Backend (derived: `status === 'active'`)               |
| `BillingScreen`           | Frontend resolver (`resolveCollectionBillingScreen`)   |
| Layout                    | Mockup (Design source)                                 |
| Copy                      | Copy deck                                              |
| When screen/modal appears | Interaction source (`Approved subscription UX states`) |
| Animations                | Frontend (не влияют на billing)                        |

## Backend status → BillingScreen → Mockup

| Backend `status`              | `hasPremiumAccess` | `BillingScreen`  | Mockup (placeholder)               |
| ----------------------------- | ------------------ | ---------------- | ---------------------------------- |
| _(no row)_                    | false              | `NONE`           | `subscriptions-none.png`           |
| `active`                      | true               | `ACTIVE`         | `subscriptions-active.png`         |
| `cancel_at_period_end`        | true               | `CANCELLED`      | `subscriptions-cancelled.png`      |
| `past_due`                    | true               | `PAYMENT_FAILED` | `subscriptions-payment-failed.png` |
| `expired` / legacy `canceled` | false              | `EXPIRED`        | `subscriptions-expired.png`        |

## Связанные документы

- [payment-architecture.md](../payment-architecture.md) — альбомные платежи и общая схема ЮKassa
- [dev-payment-mode.md](../dev-payment-mode.md) — локальный checkout без YooKassa
- [architecture.md](../architecture.md) — FSD и слои проекта
- [subscription-implementation-status.md](./subscription-implementation-status.md) — статус PR-1…12 и changelog
