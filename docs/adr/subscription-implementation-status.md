# Premium autoprenewal — Implementation Status

Живой статус реализации автопродления Premium. Обновлять **в конце каждого PR** — через несколько месяцев это единственный быстрый способ понять, что уже в prod, а что только в документации.

**Feature flag (prod):** `SUBSCRIPTION_AUTO_RENEW_ENABLED` — по умолчанию **off** до rollout (PR-11).

**Связанные документы:**

- [ADR index](./README.md) — архитектурные решения
- [ADR-001…008](./subscription-premium-billing.md) — billing ADR
- [Design handoff](../design/premium-subscription-design-handoff.md) — утверждённые макеты
- [Payment architecture](../payment-architecture.md) — альбомные платежи и ЮKassa

---

## Implementation Status

**Last updated:** 2026-08-05

### ✅ PR-1 Complete — Schema + Access Layer + Feature Flag

| Capability                       | Status | Notes                                               |
| -------------------------------- | ------ | --------------------------------------------------- |
| Architecture (ADR)               | ✓      | ADR-001…008 accepted                                |
| Migration                        | ✓      | `066_subscription_auto_renew_schema.sql`            |
| Access Layer                     | ✓      | `subscription-access.ts` — not wired to runtime yet |
| Feature Flag                     | ✓      | `SUBSCRIPTION_AUTO_RENEW_ENABLED`                   |
| State Machine (logic)            | —      | PR-2                                                |
| Runtime (SM in prod)             | —      | PR-2+                                               |
| Scheduler                        | —      | PR-7                                                |
| Checkout (`save_payment_method`) | —      | PR-3                                                |
| Webhooks / dunning               | —      | PR-8                                                |
| Billing API (PATCH, schedule)    | —      | PR-5, PR-6                                          |
| BillingSnapshot in API           | —      | PR-4                                                |
| UI (Collection billing)          | —      | PR-4b+                                              |
| BillingScreen resolver           | —      | PR-4b                                               |
| Context (new fields)             | —      | PR-4                                                |
| Rebind / change card             | —      | PR-9                                                |
| Dev mode parity                  | —      | PR-10                                               |
| Production rollout               | —      | PR-11                                               |

**Prod behavior after PR-1:** идентично legacy one-time checkout. Flag off → `hasPremiumAccess` не подключён к `archive.ts` / API.

---

### ✅ PR-2 Complete — State Machine + Transitions

| Capability                       | Status | Notes                                                                  |
| -------------------------------- | ------ | ---------------------------------------------------------------------- |
| State Machine (logic)            | ✓      | `subscription-state.ts` — transitions + invariants I1–I7               |
| Access Layer integration         | ✓      | `normalizeCanonicalStatus`, `deriveAutoRenewEnabled` from state module |
| Runtime (SM in prod)             | —      | PR-3+ (webhook/scheduler/API still unwired)                            |
| Scheduler                        | —      | PR-7                                                                   |
| Checkout (`save_payment_method`) | —      | PR-3                                                                   |
| Webhooks / dunning               | —      | PR-8                                                                   |
| Billing API (PATCH, schedule)    | —      | PR-5, PR-6                                                             |
| BillingSnapshot in API           | —      | PR-4                                                                   |
| UI (Collection billing)          | —      | PR-4b+                                                                 |
| BillingScreen resolver           | —      | PR-4b                                                                  |
| Context (new fields)             | —      | PR-4                                                                   |
| Rebind / change card             | —      | PR-9                                                                   |
| Dev mode parity                  | —      | PR-10                                                                  |
| Production rollout               | —      | PR-11                                                                  |

**Prod behavior after PR-2:** без изменений — модуль pure logic, не вызывается из prod paths.

---

## PR roadmap

| PR        | Title                                         | Status      | Merged |
| --------- | --------------------------------------------- | ----------- | ------ |
| **PR-1**  | Schema + access layer + feature flag          | ✅ Complete | —      |
| **PR-2**  | State machine + transitions (backend)         | ✅ Complete | —      |
| **PR-3**  | Checkout + `save_payment_method` + PM persist | ⬜ Pending  | —      |
| **PR-4**  | BillingSnapshot in API + context (**no UI**)  | ⬜ Pending  | —      |
| **PR-4b** | Collection billing UI per mockups             | ⬜ Pending  | —      |
| **PR-5**  | PATCH auto-renew + confirm modals             | ⬜ Pending  | —      |
| **PR-6**  | Upgrade / schedule downgrade                  | ⬜ Pending  | —      |
| **PR-7**  | Renewal engine + scheduler                    | ⬜ Pending  | —      |
| **PR-8**  | Webhooks + dunning + emails + banners         | ⬜ Pending  | —      |
| **PR-9**  | Rebind payment method + change card UI        | ⬜ Pending  | —      |
| **PR-10** | Dev payment mode parity + integration tests   | ⬜ Pending  | —      |
| **PR-11** | Backfill + production rollout                 | ⬜ Pending  | —      |
| **PR-12** | Polish (retry-now, help, observability)       | ⬜ Pending  | —      |

**Legend:** ✅ Complete · 🔄 In progress · ⬜ Pending · ⏸ Blocked

---

## Design handoff

| Item                        | Status                                       |
| --------------------------- | -------------------------------------------- |
| Screen mockups (4/5)        | ✓ ACTIVE, CANCELLED, PAYMENT_FAILED, EXPIRED |
| Screen `subscriptions-none` | ⬜ asset missing                             |
| Modal mockups               | ⬜ assets missing                            |
| Overlay banners             | ⬜ assets missing                            |

Details: [premium-subscription-design-handoff.md](../design/premium-subscription-design-handoff.md)

---

## Changelog

### 2026-08-05 — PR-1 complete

**Added**

- Migration `database/migrations/066_subscription_auto_renew_schema.sql`
  - Columns: `payment_method_id`, `next_charge_at`, `renewal_attempt_count`, `scheduled_plan`, `first_failed_at`
  - Status CHECK extended: `cancel_at_period_end`, `past_due`
- Access layer: `netlify/functions/lib/subscription-access.ts`
  - `hasPremiumAccess`, `normalizeCanonicalStatus`, `deriveAutoRenewEnabled`
  - Legacy parity when flag off
- Feature flag: `netlify/functions/lib/subscription-feature-flag.ts`
- Tests: `netlify/functions/lib/__tests__/subscription-access.test.ts` (13 tests)
- Types: extended `SUBSCRIPTION_STATUSES` in `subscriptions.ts`
- Env: `SUBSCRIPTION_AUTO_RENEW_ENABLED` in `.env.example`

**Design**

- Design handoff accepted: `docs/design/premium-subscription-design-handoff.md`
- ADR index + ADR-001…008: `docs/adr/`

**Not changed (by design)**

- No scheduler, webhooks, checkout, new API, UI, Context wiring
- `isSubscriptionActive()` unchanged
- `archive.ts` still uses legacy access path

**Next:** PR-3 — checkout + `save_payment_method` + PM persist

---

### 2026-08-05 — PR-2 complete

**Added**

- State machine: `netlify/functions/lib/subscription-state.ts`
  - `SUBSCRIPTION_EVENTS`, `getNextSubscriptionStatus`, `isValidSubscriptionTransition`
  - Invariants I1–I7: `getSubscriptionInvariantViolations`, `assertSubscriptionInvariants`
  - Derived rules: `deriveAutoRenewEnabled`, `willScheduleCharge`, `canCreateRenewalPayment`
  - Legacy read mapping: `normalizeCanonicalStatus`, `toPresenceStatus`
- Tests: `netlify/functions/lib/__tests__/subscription-state.test.ts`

**Changed**

- `subscription-access.ts` — imports canonical helpers from `subscription-state.ts`

**Not changed (by design)**

- No DB writes, webhooks, scheduler, API, UI
- Prod behavior unchanged

**Next:** PR-3 — checkout + `save_payment_method`

---

<!-- Template for future entries:

### YYYY-MM-DD — PR-N complete

**Added**
- …

**Changed**
- …

**Not changed**
- …

**Next:** PR-(N+1) — …

-->
