# Premium autoprenewal — Implementation Status

Живой статус реализации автопродления Premium. Обновлять **в конце каждого PR** — через несколько месяцев это единственный быстрый способ понять, что уже в prod, а что только в документации.

**Feature flag (prod):** `SUBSCRIPTION_AUTO_RENEW_ENABLED` — по умолчанию **off** до rollout (PR-11).

**Связанные документы:**

- [ADR index](./README.md) — архитектурные решения
- [ADR-001…009](./subscription-premium-billing.md) — billing ADR
- [Design handoff](../design/premium-subscription-design-handoff.md) — утверждённые макеты; [PR-8 implementation handoff](../design/premium-subscription-design-handoff.md#pr-8-implementation-handoff)
- [PR-8 overlay spec](../design/pr-8-billing-overlays-design-review.md) — frozen; display-only
- [Payment architecture](../payment-architecture.md) — альбомные платежи и ЮKassa

---

## Implementation Status

**Last updated:** 2026-08-05 — **Engineering complete** (PR-1…PR-10.3); rollout = PR-11 ops only

### Capability matrix (current)

| Capability                        | Status | Notes                                                                                                          |
| --------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| Architecture (ADR-001…009)        | ✓      | Accepted; pipelines documented in ADR-009                                                                      |
| Schema + access layer             | ✓      | Migration 066, `subscription-access.ts`                                                                        |
| **Production PLAN_CATALOG (B-1)** | **✓**  | **30-day period; 20/60/100 slots; 149/149/199₽**                                                               |
| **Entitlement unification (B-2)** | **✓**  | **Runtime paths use `hasPremiumAccess()` (ADR-003)**                                                           |
| **Autorenew backfill (B-3)**      | **✓**  | **Migration 069 + [backfill doc](./subscription-autorenew-backfill.md)**                                       |
| **Resubscribe cleanup (B-4)**     | **✓**  | **`fulfillSubscriptionPayment` clears stale dunning on reuse**                                                 |
| **Payment idempotency (PR-10.2)** | **✓**  | **Webhook DB cross-check; claim hardening; UNIQUE(user_id); fulfillment guards**                               |
| **Observability (PR-10.3)**       | **✓**  | **Structured logs, metrics, correlation IDs, [ops guide](../operations/subscription-autorenew-operations.md)** |
| State machine                     | ✓      | `subscription-state.ts` — wired in PATCH, renewal, upgrade                                                     |
| Feature flag                      | ✓      | `SUBSCRIPTION_AUTO_RENEW_ENABLED` — default **off**                                                            |
| Initial checkout + PM persist     | ✓      | PR-3 / PR-3.1                                                                                                  |
| BillingSnapshot API + context     | ✓      | PR-4                                                                                                           |
| Collection billing UI (screens)   | ✓      | PR-4b — merge gate passed                                                                                      |
| PATCH auto-renew + modals         | ✓      | PR-5                                                                                                           |
| Upgrade + schedule downgrade      | ✓      | PR-6                                                                                                           |
| **Renewal engine + scheduler**    | **✓**  | **PR-7 + PR-7.1 — production-ready behind feature flag**                                                       |
| Renewal hardening (idempotency)   | ✓      | PR-7.1 — integration review: no blockers                                                                       |
| Dunning / grace **UI**            | ✓      | PR-8 — overlays + dunning supplements                                                                          |
| Rebind / change card              | ✓      | PR-9 — YooKassa rebind + `paymentMethodTitle`                                                                  |
| **Integration E2E P0 (PR-10)**    | **✓**  | **22 P0 scenarios; green on real Postgres; [E2E spec](./pr-10-e2e-specification.md)**                          |
| **CI merge gate (PR-10)**         | **✓**  | **`.github/workflows/pr10-e2e-quick.yml` — ephemeral Postgres**                                                |
| Production rollout                | —      | PR-11 — [rollout checklist](../release/subscription-autorenew-rollout-checklist.md)                            |

**Prod today (flag off):** legacy one-time checkout; renewal scheduler no-op.  
**Prod with flag on:** full server-side renewal lifecycle + billing overlay UI ready for staging QA.

**Engineering status:** **Complete** — no further feature PRs unless a production incident or new business requirement.  
**Rollout (ops):** [rollout checklist](../release/subscription-autorenew-rollout-checklist.md) · [operations guide](../operations/subscription-autorenew-operations.md)

**Invariants (I7 doc):** `getSubscriptionInvariantViolations` checks subscription-row rules **I1–I6**; **I7** = `canCreateRenewalPayment()` (renewal payment eligibility).

---

### ✅ PR-10.2 Complete — Payment/webhook idempotency hardening

| Capability                                  | Status | Notes                                                                                       |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `claimSubscriptionPaymentSuccess` hardening | ✓      | Only `pending`/`waiting_for_capture` → `succeeded`; `rejected_terminal` for canceled/failed |
| Webhook DB cross-check                      | ✓      | `subscription-payment-row-verify.ts`; routes via DB `user_id` + `kind`                      |
| Initial/upgrade fulfillment guards          | ✓      | `provider_subscription_id IS DISTINCT FROM` (parity with renewal PR-10.1)                   |
| Single subscription per user                | ✓      | Migration `070_subscriptions_unique_user_id.sql`; INSERT `ON CONFLICT (user_id)`            |
| Cancel path alignment                       | ✓      | Initial/upgrade/webhook cancel → `claimSubscriptionPaymentCanceled`                         |
| Regression tests                            | ✓      | Unit: claim, row-verify; integration: `pr-10.2-idempotency.integration.test.ts`             |

**Not modified:** UI, `BillingSnapshot`, `BillingScreen`, `BillingOverlay`, ADRs, feature flags, scheduler, rollout docs.

**Apply with PR-10.2 deploy:** migration **070** (after 066–069).

---

### ✅ PR-10.3 Complete — Observability & operational hardening

| Capability                   | Status | Notes                                                                                      |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| Structured lifecycle logging | ✓      | `subscription-observability.ts` — dot-notation events at all entry points                  |
| Correlation IDs              | ✓      | `subscriptionPaymentId` / `providerPaymentId` / `subscriptionId` via AsyncLocalStorage     |
| Lightweight metrics          | ✓      | JSON metric lines + in-memory counters (no external deps)                                  |
| Lifecycle diagnostics        | ✓      | `subscription-lifecycle-diagnostics.ts` — read-only dump incl. BillingScreen/overlays      |
| Operations docs              | ✓      | [subscription-autorenew-operations.md](../operations/subscription-autorenew-operations.md) |

**Not modified:** business logic, UI, BillingSnapshot, BillingScreen, BillingOverlay, feature flags, scheduler algorithms, ADRs, schema.

**Tests:** `subscription-observability.test.ts`, `subscription-lifecycle-diagnostics.test.ts`

---

### ✅ PR-10 Complete — Integration E2E P0 + CI merge gate

| Capability                   | Status | Notes                                                       |
| ---------------------------- | ------ | ----------------------------------------------------------- |
| P0 scenarios (Groups A–H, K) | ✓      | 22 merge-gate IDs; `@p0` tag                                |
| Real Postgres validation     | ✓      | Migrations 066–069; `DATABASE_URL_TEST`                     |
| Test isolation               | ✓      | Truncate + `@pr10-e2e.test` users; no shared Supabase in CI |
| CI workflow                  | ✓      | Ephemeral PG16; `npm run test:e2e:quick`                    |
| P1/P2 scenarios              | —      | Scaffold `test.todo`; nightly/full profiles deferred        |

**npm scripts:** `test:e2e:quick` (P0 merge gate) · `test:e2e:nightly` · `test:e2e:full`

**Rollout doc:** [subscription-autorenew-rollout-checklist.md](../release/subscription-autorenew-rollout-checklist.md)

**Not modified:** application business logic (Phase 3); only CI infra + docs.

---

### ✅ Pre-PR-10 Hardening — Production blockers B-1…B-4

| Blocker                     | Status | Deliverable                                                                                      |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| B-1 Production PLAN_CATALOG | ✓      | `subscription-billing.ts` + client mirror; dev 1₽/1h via env                                     |
| B-2 Entitlement unification | ✓      | Backend runtime → `hasPremiumAccess()`                                                           |
| B-3 Backfill preparation    | ✓      | `069_subscription_autorenew_backfill.sql` + [backfill doc](./subscription-autorenew-backfill.md) |
| B-4 Resubscribe cleanup     | ✓      | Stale `scheduled_plan`, dunning fields cleared on checkout reuse                                 |

**Not modified:** ADRs, `BillingScreen`, `BillingOverlay`, `BillingSnapshot` structure, renewal engine/scheduler logic, feature-flag-off behavior.

**Apply before staging flag-on:** migrations 066–069; run backfill verification queries from [subscription-autorenew-backfill.md](./subscription-autorenew-backfill.md).

---

### ✅ PR-9 Complete — Rebind payment method

| Capability                           | Status | Notes                                                  |
| ------------------------------------ | ------ | ------------------------------------------------------ |
| `payment_method_title` column        | ✓      | Migration 068 — masked label only                      |
| `POST …/payment-method/rebind`       | ✓      | YooKassa redirect; kind `rebind`; 1 RUB verification   |
| Rebind fulfillment                   | ✓      | Updates `payment_method_id` + title only               |
| `BillingSnapshot.paymentMethodTitle` | ✓      | From DB; graceful null when missing                    |
| `RebindPaymentMethodModal` wired     | ✓      | CANCELLED enable-rebind + PAYMENT_FAILED banner CTA    |
| Polling / webhook rebind path        | ✓      | `paymentMethodUpdated` + archive refetch               |
| Unit tests                           | ✓      | Fulfillment, masks, snapshot, yookassa payload, UI CTA |

**Not modified (by design):** `BillingScreen`, `BillingOverlay`, `resolveCollectionBillingScreen`, ADRs

**Manual QA checklist:**

- [ ] `ACTIVE` — plan section unchanged; enable modal shows mask when PM stored
- [ ] `ACTIVE` — enable → rebind when PM missing; change PM from enable modal
- [ ] `CANCELLED` — resume → rebind when `PAYMENT_METHOD_REQUIRED`
- [ ] `PAYMENT_FAILED` — banner CTA opens rebind (not support)
- [ ] Rebind success → archive refetch; `paymentMethodTitle` updates only
- [ ] Cancel rebind checkout → no billing mutation
- [ ] Duplicate webhook/poll → idempotent PM update

---

### ✅ PR-8 Complete — Billing overlays + dunning display

**Spec:** [pr-8-billing-overlays-design-review.md](../design/pr-8-billing-overlays-design-review.md) (frozen)

**Not modified (by design):** `BillingSnapshot`, `BillingScreen`, `resolveCollectionBillingScreen`, ADRs

**Visual sign-off:** overlay PNGs still missing (D-3) — reuses PR-4b `BillingAlertBanner` chrome

**Manual QA checklist:**

- [ ] `ACTIVE` — no overlays outside T−3 / scheduled downgrade conditions
- [ ] `ACTIVE` + pre-billing (`nextChargeAt` within 3 days)
- [ ] `ACTIVE` + scheduled downgrade (excess slots)
- [ ] `ACTIVE` + both overlays (downgrade above pre-billing)
- [ ] `CANCELLED` — state banner only
- [ ] `CANCELLED` + downgrade overlay
- [ ] `PAYMENT_FAILED` — dunning supplements + no overlays
- [ ] `EXPIRED` — no overlays
- [ ] `NONE` — billing summary hidden
- [ ] Cancel scheduled downgrade CTA refetches archive
- [ ] `BillingScreen` unchanged when overlays appear/disappear

**Next:** PR-10 — dev payment mode parity + integration tests

---

### Known issues (open)

| Severity | Item                                                                              | Target                   |
| -------- | --------------------------------------------------------------------------------- | ------------------------ |
| Minor    | P1/P2 E2E scenarios not implemented                                               | Nightly/full CI profiles |
| Minor    | I2: resubscribe with existing PM → `next_charge_at` NULL until backfill/re-enable | Post-rollout             |
| Minor    | Scheduler batch `LIMIT 100`                                                       | Pre-rollout ops          |
| Minor    | M-1: Rebind does not block renewal scheduler                                      | Accepted delta           |

**Resolved in PR-10.2:** R-1 webhook metadata-only routing · R-2 initial/upgrade concurrent webhook+poll · R-3 duplicate subscription rows · R-5 canceled payment resurrection. **R-4** mitigated via atomic claim + fulfillment idempotency guards (full multi-step transactions deferred).

**Resolved in PR-10.1:** C-1 POST_PROVIDER double-charge · C-2 unauthenticated scheduler.

---

### ✅ PR-7 + PR-7.1 Complete — Renewal engine, scheduler, hardening

| Capability                           | Status | Notes                                                                 |
| ------------------------------------ | ------ | --------------------------------------------------------------------- |
| Scheduled renewals                   | ✓      | `scheduled-subscription-renewals.ts` — every 15 min, flag-gated       |
| Renewal charge creation              | ✓      | YooKassa `payment_method_id`, `kind=renewal`, Idempotence-Key         |
| Renewal fulfillment pipeline         | ✓      | `subscription-renewal-fulfillment.ts` — separate from initial/upgrade |
| Apply `scheduled_plan` at renewal    | ✓      | Only in renewal fulfillment after successful payment                  |
| `deactivateExcessArchiveArtists`     | ✓      | `locked_until DESC`, `created_at DESC`; reconcile on retry (PR-7.1)   |
| Dunning / retry scheduling           | ✓      | ADR-007 offsets via `computeRenewalRetryChargeAt`                     |
| `DUNNING_EXHAUSTED` / `PERIOD_ENDED` | ✓      | Clears `scheduled_plan`; period-end for `cancel_at_period_end`        |
| Webhook renewal routing              | ✓      | `payment.succeeded` + `payment.canceled` → renewal processor          |
| Router `kind=renewal`                | ✓      | `subscription-payment-router.ts`                                      |
| Side-effect idempotency (B1)         | ✓      | `applyRenewalArchiveSideEffects` on every payment-applied reconcile   |
| Charge attempt rollback (B2)         | ✓      | `rollbackRenewalChargeAttempt` + `cleanupPendingRenewalPayment`       |
| Grace premium access (M1)            | ✓      | `past_due`: `first_failed_at + 7d` (`SUBSCRIPTION_GRACE_PERIOD_MS`)   |

**Integration review:** PR-7 audit blockers closed in PR-7.1 — **merge-ready behind feature flag**.

**Not in PR-7/7.1:** dunning/grace **UI** (PR-8), emails (PR-8+), cancel scheduled downgrade UI, integration E2E.

**Architecture:** [ADR-009](./subscription-premium-billing.md#adr-009-subscription-fulfillment-pipelines-are-separate) — downgrade apply + artist deactivation only at renewal

**Next:** PR-8 — dunning UI + downgrade slots banner

---

### ✅ PR-6 Complete — Upgrade checkout + schedule downgrade

| Capability                                     | Status    | Notes                                                         |
| ---------------------------------------------- | --------- | ------------------------------------------------------------- |
| Upgrade checkout `kind=upgrade`                | ✓         | Separate `processUpgradeSubscriptionProviderPayment` pipeline |
| Mid-cycle upgrade guard                        | ✓         | 409 `UPGRADE_INTENT_REQUIRED` without `intent=upgrade`        |
| Upgrade fulfillment (ADR-005)                  | ✓         | Full price, new period, clears dunning + `scheduled_plan`     |
| `POST/DELETE /api/subscription/scheduled-plan` | ✓         | Downgrade schedule only — no payment row                      |
| Pending checkout guard                         | ✓         | 409 `CHECKOUT_IN_PROGRESS`                                    |
| Artist deactivation on upgrade                 | ✓ removed | Deactivation only at PR-7 renewal apply                       |
| State machine                                  | ✓         | `past_due` + `PLAN_CHANGE_SUCCEEDED` → `active`               |
| Upgrade / downgrade modals                     | ✓         | PR-5 visual language; PNG sign-off pending                    |
| Frontend routing                               | ✓         | `resolvePlanChangeAction`, picker + recommended upgrade CTA   |

**Not in PR-6:** downgrade slots banner (PR-8).

**Architecture:** [ADR-009](./subscription-premium-billing.md#adr-009-subscription-fulfillment-pipelines-are-separate) — separate fulfillment pipelines

---

### ✅ PR-5 Complete — PATCH auto-renew + confirm modals

| Capability                           | Status | Notes                                               |
| ------------------------------------ | ------ | --------------------------------------------------- |
| `PATCH /api/subscription/auto-renew` | ✓      | Flag-gated; state machine transitions               |
| State machine integration            | ✓      | `subscription-auto-renew-patch.ts`                  |
| Refetch after PATCH                  | ✓      | ADR-004; `getMyArchive` + `ARCHIVE_CHANGED_EVENT`   |
| Backend unit tests                   | ✓      | 6 tests                                             |
| Frontend wiring                      | ✓      | disable link, cancelled banner → modals → PATCH     |
| Modal UI vs mockups                  | ✓      | Visual fix-pack + S-1; merge gate passed 2026-08-05 |
| `billingModals/`                     | ✓      | Disable / Enable / Rebind per PNG composite         |

**Not in PR-5:** plan upgrade/downgrade modals (PR-6), PM mask formatting (PR-9).

**Next:** PR-6 — upgrade / schedule downgrade

---

### ✅ PR-4b Complete — Collection Billing UI (merge gate passed)

| Capability                       | Status    | Notes                                       |
| -------------------------------- | --------- | ------------------------------------------- |
| `resolveCollectionBillingScreen` | ✓         | NONE ⇔ `status === null` only               |
| `CollectionBillingSummary`       | ✓         | BillingScreen switch; two-card layout       |
| Premium gating                   | ✓         | `billing.hasPremiumAccess` only             |
| Legacy `expiring` UI             | ✓ removed | Not carried to new UI                       |
| Copy deck (ru/en)                | ✓         | Design Handoff §2                           |
| Visual fix-pack V-1…V-8          | ✓         | Merge gate confirmed 2026-08-05             |
| Accepted minor deltas            | ✓         | C-1, C-2, C-3, D-1, M-1, M-3 — non-blocking |

---

### ✅ PR-4 Complete — BillingSnapshot (Data Layer Only)

| Capability                           | Status | Notes                                      |
| ------------------------------------ | ------ | ------------------------------------------ |
| `BillingSnapshot` DTO + builder      | ✓      | `subscription-billing-snapshot.ts`         |
| `GET /api/my-archive` → `billing`    | ✓      | Legacy fields unchanged                    |
| Frontend API types                   | ✓      | `src/shared/api/billing/`                  |
| `PremiumSubscriptionContext.billing` | ✓      | Mirrors API; no UI wiring                  |
| Entitlement / runtime unchanged      | ✓      | `isPremium` still `isSubscriptionActive()` |
| BillingScreen / UI                   | —      | PR-4b                                      |

**Prod behavior after PR-4:** API returns nested `billing`; old UI reads legacy fields only; context holds billing for PR-4b+.

---

### ✅ PR-3.1 Complete — Payment Idempotency + Unified Provider DTO

| Capability                                | Status | Notes                                                                           |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| Unified `SubscriptionProviderPayment` DTO | ✓      | `subscription-provider-payment.ts` — webhook + poll                             |
| Idempotent initial fulfillment            | ✓      | `claimSubscriptionPaymentSuccess` + `isSubscriptionFulfilledForProviderPayment` |
| PM persist parity (webhook / poll)        | ✓      | `resolvePaymentMethodIdFromProviderPayment` in shared processor                 |
| Double-extend prevention (same payment)   | ✓      | Skip `fulfillSubscriptionPayment` when already fulfilled for payment id         |
| Scheduler / renewal / retry               | ✓      | PR-7 + PR-7.1                                                                   |

**Prod behavior after PR-3.1:** flag off → unchanged. Flag on → PM saved from webhook or poll; repeat webhook/poll for same payment does not re-extend subscription.

---

### ✅ PR-1 Complete — Schema + Access Layer + Feature Flag

| Capability                       | Status | Notes                                               |
| -------------------------------- | ------ | --------------------------------------------------- |
| Architecture (ADR)               | ✓      | ADR-001…009 accepted                                |
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

| Capability                       | Status | Notes                                                                                                                |
| -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| State Machine (logic)            | ✓      | `subscription-state.ts` — transitions; I1–I6 in `getSubscriptionInvariantViolations`; I7 = `canCreateRenewalPayment` |
| Access Layer integration         | ✓      | `normalizeCanonicalStatus`, `deriveAutoRenewEnabled` from state module                                               |
| Runtime (SM in prod)             | —      | PR-3+ (webhook/scheduler/API still unwired)                                                                          |
| Scheduler                        | —      | PR-7                                                                                                                 |
| Checkout (`save_payment_method`) | —      | PR-3                                                                                                                 |
| Webhooks / dunning               | —      | PR-8                                                                                                                 |
| Billing API (PATCH, schedule)    | —      | PR-5, PR-6                                                                                                           |
| BillingSnapshot in API           | —      | PR-4                                                                                                                 |
| UI (Collection billing)          | —      | PR-4b+                                                                                                               |
| BillingScreen resolver           | —      | PR-4b                                                                                                                |
| Context (new fields)             | —      | PR-4                                                                                                                 |
| Rebind / change card             | —      | PR-9                                                                                                                 |
| Dev mode parity                  | —      | PR-10                                                                                                                |
| Production rollout               | —      | PR-11                                                                                                                |

**Prod behavior after PR-2:** без изменений — модуль pure logic, не вызывается из prod paths.

---

### ✅ PR-3 Complete — Checkout + save_payment_method + PM persist

| Capability                       | Status | Notes                                               |
| -------------------------------- | ------ | --------------------------------------------------- |
| Checkout (`save_payment_method`) | ✓      | Flag-gated in `subscription-yookassa.ts`            |
| Initial payment fulfillment      | ✓      | `subscription-fulfillment.ts` — `kind=initial` only |
| PM persist in DB                 | ✓      | `payment_method_id`, `next_charge_at` when flag on  |
| Webhook initial success          | ✓      | Ignores non-initial `kind` (renewals deferred)      |
| Scheduler / auto-renew runtime   | ✓      | PR-7 — flag-gated scheduled function                |
| Billing API (PATCH, schedule)    | —      | PR-5, PR-6                                          |
| BillingSnapshot in API           | —      | PR-4                                                |
| UI (Collection billing)          | —      | PR-4b+                                              |

**Prod behavior after PR-3:** flag off → checkout и fulfillment идентичны legacy. Flag on → YooKassa `save_payment_method`, PM сохраняется после первой оплаты; renewal scheduler активен при flag on (PR-7).

---

## PR roadmap

| PR         | Title                                          | Status      | Merged                                                   |
| ---------- | ---------------------------------------------- | ----------- | -------------------------------------------------------- |
| **PR-1**   | Schema + access layer + feature flag           | ✅ Complete | —                                                        |
| **PR-2**   | State machine + transitions (backend)          | ✅ Complete | —                                                        |
| **PR-3**   | Checkout + `save_payment_method` + PM persist  | ✅ Complete | —                                                        |
| **PR-3.1** | Payment idempotency + unified Provider DTO     | ✅ Complete | —                                                        |
| **PR-4**   | BillingSnapshot in API + context (**no UI**)   | ✅ Complete | —                                                        |
| **PR-4b**  | Collection billing UI per mockups              | ✅ Complete | ✓ gate                                                   |
| **PR-5**   | PATCH auto-renew + confirm modals              | ✅ Complete | ✓ gate                                                   |
| **PR-6**   | Upgrade / schedule downgrade                   | ✅ Complete | —                                                        |
| **PR-7**   | Renewal engine + scheduler                     | ✅ Complete | —                                                        |
| **PR-7.1** | Renewal hardening (B1, B2, M1)                 | ✅ Complete | —                                                        |
| **PR-8**   | Dunning UI + banners + BillingSnapshot display | ✅ Complete | [spec](../design/pr-8-billing-overlays-design-review.md) |
| **PR-9**   | Rebind payment method + change card UI         | ✅ Complete | —                                                        |
| **PR-10**  | Dev payment mode parity + integration tests    | ⬜ Pending  | —                                                        |
| **PR-11**  | Backfill + production rollout                  | ⬜ Pending  | —                                                        |
| **PR-12**  | Polish (retry-now, help, observability)        | ⬜ Pending  | —                                                        |

**Legend:** ✅ Complete · 🔄 In progress · ⬜ Pending · ⏸ Blocked

---

## Design handoff

| Item                        | Status                                                  |
| --------------------------- | ------------------------------------------------------- |
| Screen mockups (4/5)        | ✓ ACTIVE, CANCELLED, PAYMENT_FAILED, EXPIRED            |
| Screen `subscriptions-none` | ⬜ asset missing                                        |
| Modal mockups (PR-5)        | ✓ disable / enable / rebind — signed off 2026-08-05     |
| Modal mockups (PR-6)        | ✓ upgrade / downgrade modals (PR-5 visual language)     |
| Overlay banners             | ✓ implemented (PR-4b chrome) — D-3 PNG sign-off pending |

Details: [premium-subscription-design-handoff.md](../design/premium-subscription-design-handoff.md)

---

## Changelog

### 2026-08-05 — PR-9 complete

**Added**

- Migration `database/migrations/068_subscription_payment_method_title.sql` — `subscriptions.payment_method_title`
- `POST /api/subscription/payment-method/rebind` — YooKassa setup flow (kind `rebind`, 1 RUB verification)
- `subscription-rebind-fulfillment.ts` — PM id + masked title only; no status/plan mutation
- `subscription-payment-method.ts` — card mask formatting (`Visa •••• 4242`)
- `buildRebindSubscriptionPaymentPayload` in `subscription-yookassa.ts`
- `useSubscriptionRebindPayment` + `createSubscriptionPaymentMethodRebind` API client
- Rebind polling path in `get-subscription-payment-status` (`paymentMethodUpdated`, optional `archive`)
- Tests: rebind fulfillment, payment-method masks, billing snapshot title, yookassa rebind payload, UI rebind CTA

**Changed**

- `BillingSnapshot.paymentMethodTitle` populated from `subscriptions.payment_method_title`
- `RebindPaymentMethodModal` wired to real rebind checkout (CANCELLED enable-rebind + PAYMENT_FAILED banner CTA)
- `SubscriptionPaymentSuccess` — rebind success copy + `ARCHIVE_CHANGED_EVENT` (no subscription activation)
- Initial checkout persists `payment_method_title` when PM saved (COALESCE, first bind only)
- Webhook validates rebind amount/kind separately from plan checkout

**Not changed (by design)**

- `BillingScreen`, `BillingOverlay`, `resolveCollectionBillingScreen`, ADRs
- No new billing states or overlays; no optimistic UI

**Manual QA checklist**

| Screen / case  | PM exists                                                      | PM missing                                      | Replace PM                                    | Cancel flow                                     | Duplicate callback                         |
| -------------- | -------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| ACTIVE         | Plan section unchanged; enable modal shows mask when PM stored | Enable → rebind modal → checkout                | Enable modal → Change payment method → rebind | Cancel rebind → modal closes, no archive change | Repeat webhook/poll → idempotent PM update |
| CANCELLED      | Resume → enable modal shows mask                               | Resume → PAYMENT_METHOD_REQUIRED → rebind modal | Change payment method from enable modal       | Cancel rebind                                   | —                                          |
| PAYMENT_FAILED | Banner CTA → rebind → archive refetch                          | Same                                            | Same                                          | Cancel rebind                                   | —                                          |

Verify: only `paymentMethodTitle` / PM fields change in billing summary; no screen or overlay changes.

**Next:** PR-10 — dev payment mode parity + integration tests

---

### 2026-08-05 — PR-8 complete

**Added**

- `billingOverlay.ts` — `BillingOverlay` enum (`pre_billing`, `downgrade_slots`)
- `subscriptionBillingPolicy.ts` — `PRE_BILLING_WINDOW_MS`, grace constants, dunning supplement resolver
- `resolveCollectionBillingOverlays.ts` + table-driven tests
- `PreBillingBanner`, `ScheduledDowngradeBanner`, `CollectionBillingOverlay`
- Dunning supplemental lines on `PAYMENT_FAILED` (≤2 lines)
- Cancel scheduled downgrade CTA → `DELETE /api/subscription/scheduled-plan` + archive refetch
- i18n overlay + dunning supplement keys (ru/en)
- `CollectionBillingSummary.overlays.test.tsx`

**Changed**

- `CollectionBillingSummary.tsx` — overlay stack; no overlay visibility logic in JSX
- `MyArchiveContent.tsx` — resolver wiring, cancel downgrade handler

**Not changed (by design)**

- `BillingSnapshot`, `BillingScreen`, `resolveCollectionBillingScreen`, ADRs
- PAYMENT_FAILED screen layout (banner enrichment only)

**Next:** PR-10 — dev payment mode parity + integration tests

---

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
- ADR index + ADR-001…009: `docs/adr/`

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
  - Invariants I1–I6: `getSubscriptionInvariantViolations`, `assertSubscriptionInvariants`; I7: `canCreateRenewalPayment`
  - Derived rules: `deriveAutoRenewEnabled`, `willScheduleCharge`, `canCreateRenewalPayment`
  - Legacy read mapping: `normalizeCanonicalStatus`, `toPresenceStatus`
- Tests: `netlify/functions/lib/__tests__/subscription-state.test.ts`

**Changed**

- `subscription-access.ts` — imports canonical helpers from `subscription-state.ts`

**Not changed (by design)**

- No DB writes, webhooks, scheduler, API, UI
- Prod behavior unchanged

**Next:** PR-4 — BillingSnapshot in API (data only, no UI)

---

### 2026-08-05 — PR-3 complete

**Added**

- Migration `database/migrations/067_subscription_payments_kind.sql` — `subscription_payments.kind`
- `netlify/functions/lib/subscription-yookassa.ts` — payload builder + PM extraction
- `netlify/functions/lib/subscription-fulfillment.ts` — initial fulfillment + PM persist
- Tests: `subscription-yookassa.test.ts`, `subscription-fulfillment.test.ts`

**Changed**

- `create-subscription-payment.ts` — uses `buildInitialSubscriptionPaymentPayload`
- `subscription-webhook.ts` — initial success via fulfillment module
- `get-subscription-payment-status.ts` — initial fulfillment + dev mock PM
- `subscription-billing.ts` — `createPendingSubscriptionPayment` sets `kind=initial`
- `yookassa-webhook-verify.ts` — `payment_method` on API shape

**Not changed (by design)**

- No scheduler, PATCH auto-renew, UI, renewal webhooks, rebind
- `next_charge_at` stored but not consumed by runtime

**Next:** PR-3.1 — payment idempotency + unified Provider DTO

---

### 2026-08-05 — PR-3.1 complete

**Added**

- `netlify/functions/lib/subscription-provider-payment.ts` — `SubscriptionProviderPayment` DTO + YooKassa/dev mappers
- `claimSubscriptionPaymentSuccess`, `isSubscriptionFulfilledForProviderPayment` in `subscription-billing.ts`
- Tests: `subscription-provider-payment.test.ts`; extended `subscription-fulfillment.test.ts`

**Changed**

- `subscription-fulfillment.ts` — single entry `processInitialSubscriptionProviderPayment` for webhook + poll
- `subscription-webhook.ts` — maps API payment → DTO → shared processor
- `get-subscription-payment-status.ts` — full YooKassa payment (incl. `payment_method`) via DTO mapper

**Fixed (integration review M-1, M-2)**

- Poll path now persists PM same as webhook when flag on
- Repeat webhook/poll for same succeeded payment skips second `expires_at` extension

**Not changed (by design)**

- No scheduler, renewal, retry, BillingSnapshot, UI, Context, API, auto-renew runtime

**Next:** PR-5 — PATCH auto-renew + confirm modals

---

### 2026-08-05 — PR-4b complete (merge gate)

**Added**

- `resolveCollectionBillingScreen.ts`, `billingScreen.ts` + tests
- `CollectionBillingSummary.tsx` + styles — BillingScreen switch
- i18n billing copy deck in `ru.json` / `en.json`
- Visual fix-pack V-1…V-8 (two-card layout, status in plan card, yellow banners/CTAs)

**Changed**

- `MyArchiveContent.tsx` — billing summary per mockup; gating via `hasPremiumAccess`
- `CollectionArtistRemoveAction.tsx` — `hasPremiumAccess` prop
- Removed legacy `expiring` subscription chrome

**Merge gate checklist**

- Architecture matches ADR; BillingScreen resolver is sole layout source
- `billing.hasPremiumAccess` for Premium-gating UI
- Layout matches approved mockups (4/4 uploaded screens)
- Resolver unit-tested; visual fix-pack closed
- Non-blocking: C-1, C-2, C-3, D-1, M-1, M-3

**Not changed (by design)**

- PATCH auto-renew API (PR-5), plan modals (PR-6), rebind (PR-9), overlay banners (PR-8)

**Next:** PR-5 — PATCH auto-renew + confirm modals

---

### 2026-08-05 — PR-4b visual fix-pack

**Changed**

- `CollectionBillingSummary.tsx` / `.scss` — two-card grid, in-card status, yellow alert banners, solid upgrade CTA

**Not changed**

- Resolver, BillingScreen types, BillingSnapshot data layer

---

### 2026-08-05 — PR-4 complete

**Added**

- `netlify/functions/lib/subscription-billing-snapshot.ts` — `BillingSnapshot`, `buildBillingSnapshot()`
- Frontend types: `src/shared/api/billing/billingSnapshot.ts`
- Tests: `subscription-billing-snapshot.test.ts` (7 tests)

**Changed**

- `getMyArchiveForUser` — nested `billing` on response (legacy fields unchanged)
- `getViewerSubscription` — loads autoprenew columns from migration 066
- `PremiumSubscriptionContext` — exposes `billing` from API
- `MyArchiveData` — required `billing` field

**Not changed (by design)**

- `isPremium` / archive entitlement paths unchanged
- No UI, JSX, SCSS, BillingScreen resolver, banners, copy

**Next:** PR-4b — Collection billing UI

---

<!-- Template for future entries:

### YYYY-MM-DD — PR-5 complete

**Added**
- …

-->

### 2026-08-05 — PR-7.1 complete (renewal hardening)

**Added**

- `applyRenewalArchiveSideEffects()` — idempotent archive reconcile on every renewal payment-applied path
- `rollbackRenewalChargeAttempt()` + `cleanupPendingRenewalPayment()` — engine error recovery
- `SUBSCRIPTION_GRACE_PERIOD_MS` in `subscription-state.ts`; grace access in `subscription-access.ts`
- Tests: extended `subscription-renewal-fulfillment.test.ts`, `subscription-renewal-engine.test.ts`, `subscription-access.test.ts`

**Fixed (PR-7 integration review)**

- **B1** — crash after subscription UPDATE no longer skips deactivation / `locked_until` extend; side effects run on retry
- **B2** — orphan `pending` renewal rows cleaned up; `next_charge_at` restored on charge-creation failure
- **M1** — `past_due` premium access follows ADR-007 grace (`first_failed_at + 7 days`), not `expires_at` alone

**Changed**

- `fulfillRenewalSubscriptionPayment` — conditional UPDATE + always reconcile archive side effects
- `attemptRenewalChargeForSubscription` — validate email before pending row; rollback on any error
- `claimSubscriptionForRenewalCharge` — returns `previousNextChargeAt` for rollback

**Integration review:** no blockers; merge-ready behind feature flag.

**Next:** PR-8 — dunning UI + BillingSnapshot field display

---

### 2026-08-05 — PR-7 complete

**Added**

- `subscription-renewal-fulfillment.ts` — renewal success/failure, apply `scheduled_plan`, PERIOD_ENDED
- `subscription-renewal-engine.ts` — charge claim, YooKassa renewal create, dev inline fulfillment
- `scheduled-subscription-renewals.ts` — Netlify cron (15 min), flag-gated
- `deactivateExcessArchiveArtists()` — deterministic excess deactivation at renewal only
- `computeRenewalRetryChargeAt()` — ADR-007 retry offsets
- Router + webhook routing for `kind=renewal`

**Changed**

- ADR-006 — auto-deactivate excess artists after successful renewal (not block-renewal)
- `subscription-payment-router.ts` — renewal pipeline
- `subscription-webhook.ts` — renewal `payment.canceled` → dunning handler

**Not changed (by design)**

- PR-1…PR-6 behavior when flag off
- Dunning emails/banners (PR-8)

**Next:** PR-8 — dunning UI + downgrade slots banner

---

### 2026-08-05 — PR-6 complete

**Added**

- `subscription-upgrade-fulfillment.ts` — separate upgrade processor + fulfillment
- `subscription-plan-schedule.ts` — schedule / cancel downgrade
- `subscription-payment-router.ts` — routes initial vs upgrade webhooks/poll
- `POST/DELETE /api/subscription/scheduled-plan`
- `UpgradePlanConfirmModal`, `ScheduleDowngradeConfirmModal`
- `resolvePlanChangeAction()` client routing

**Added**

- ADR-009 — separate subscription fulfillment pipelines (Initial / Resubscribe / Upgrade / Downgrade)

**Changed**

- `create-subscription-payment` — `intent=upgrade`, 409 pending checkout, **409 `UPGRADE_INTENT_REQUIRED`** mid-cycle guard
- `fulfillSubscriptionPayment` — removed archive deactivation on plan change
- `ArchiveAccessModalView`, `MyArchiveContent` — upgrade/downgrade flows
- State machine — `past_due` + `PLAN_CHANGE_SUCCEEDED`

**Not changed (by design)**

- PR-1…PR-5 behavior when flag off

---

---

### 2026-08-05 — PR-5 complete

**Added**

- `PATCH /api/subscription/auto-renew` + `subscription-auto-renew-patch.ts`
- `billingModals/` — Disable / Enable / Rebind confirm modals per PNG
- `useSubscriptionBilling`, `patchSubscriptionAutoRenew` client
- Full modal copy deck (ru/en); frontend + backend tests

**Changed**

- `MyArchiveContent` — modal wiring, refetch after PATCH
- `CollectionBillingSummary` — disable auto-renew link (ACTIVE)

**Visual sign-off (final)**

- M-0…M-3 closed; **S-1** (rebind card+plus icon) fixed — `BillingModalPaymentAddIcon`
- No open Block or Should items
- Accepted non-blockers: **S-2** (enable PM empty in neutral card), **S-3** (PM mask until PR-9)

**Next:** PR-6 — upgrade / schedule downgrade

---

### 2026-08-05 — PR-5 modal visual fix-pack

**Added**

- `billingModals/` — `BillingModalShell`, `DisableAutoRenewConfirmModal`, `EnableAutoRenewConfirmModal`, `RebindPaymentMethodModal`
- Full modal copy deck (ru/en) per approved PNG composite

**Removed**

- Placeholder `BillingAutoRenewConfirmModal` (single-paragraph layout)

**Changed**

- Modal structure: header icon → title → intro → info blocks → note → actions → lock footer
- `max-width: 32rem`; yellow accent info cards, dashed empty state (rebind)
- Enable modal: PM empty-state when `paymentMethodTitle === null`

**Next:** (see PR-5 complete entry above)

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
