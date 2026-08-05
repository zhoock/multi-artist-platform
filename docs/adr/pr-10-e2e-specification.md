# PR-10 E2E Integration Test Specification

Living specification for Premium subscription integration tests. **Scenarios are frozen** — refinements below add priority, CI profiles, retry policy, diagnostics, assertion helpers, and mutation coverage only.

**Related:** [Implementation status](./subscription-implementation-status.md) · [Autorenew backfill](./subscription-autorenew-backfill.md) · [PR-10 Readiness Audit](./subscription-implementation-status.md#pre-pr-10-hardening--production-blockers-b-1b-4)

---

## 1. Test architecture (unchanged)

Three tiers — **T1** backend lifecycle (real Postgres), **T2** UI billing (mocked `getMyArchive`), **T3** cross-layer smoke (webhook + poll races).

**Assertion oracles:** `hasPremiumAccess` · `buildBillingSnapshot` · `resolveCollectionBillingScreen` · `resolveCollectionBillingOverlays` · `getSubscriptionInvariantViolations` (I1–I6) · `canCreateRenewalPayment` (I7).

---

## 2. Scenario priority

| Priority | Meaning                                                                  | CI profile |
| -------- | ------------------------------------------------------------------------ | ---------- |
| **P0**   | Merge gate — regression on core revenue & access paths                   | `quick`    |
| **P1**   | Nightly — full lifecycle, idempotency, flag-on autorenew                 | `nightly`  |
| **P2**   | Full suite — edge cases, known-gap documentation, UI matrix completeness | `full`     |

### Group A — Initial subscription

| ID         | Priority |
| ---------- | -------- |
| A-BOTH-001 | P0       |
| A-BOTH-002 | P1       |
| A-BOTH-003 | P1       |
| A-BOTH-004 | P0       |
| A-ON-005   | P1       |
| A-OFF-006  | P1       |
| A-ON-007   | P1       |
| A-ON-008   | P2       |

### Group B — Resubscribe

| ID         | Priority |
| ---------- | -------- |
| B-BOTH-001 | P0       |
| B-BOTH-002 | P1       |
| B-ON-003   | P1       |
| B-ON-004   | P2       |
| B-ON-005   | P1       |
| B-ON-006   | P2       |
| B-ON-007   | P1       |
| B-ON-008   | P1       |
| B-BOTH-009 | P0       |

### Group C — Upgrade

| ID        | Priority |
| --------- | -------- |
| C-ON-001  | P0       |
| C-ON-002  | P1       |
| C-ON-003  | P1       |
| C-ON-004  | P1       |
| C-ON-005  | P1       |
| C-OFF-006 | P2       |
| C-ON-007  | P1       |

### Group D — Scheduled downgrade

| ID        | Priority |
| --------- | -------- |
| D-ON-001  | P1       |
| D-ON-002  | P2       |
| D-ON-003  | P1       |
| D-ON-004  | P0       |
| D-ON-005  | P0       |
| D-ON-006  | P1       |
| D-ON-007  | P2       |
| D-OFF-008 | P1       |

### Group E — Renewal

| ID        | Priority |
| --------- | -------- |
| E-ON-001  | P0       |
| E-ON-002  | P0       |
| E-ON-003  | P1       |
| E-ON-004  | P1       |
| E-ON-005  | P1       |
| E-ON-006  | P0       |
| E-ON-007  | P1       |
| E-ON-008  | P1       |
| E-ON-009  | P0       |
| E-ON-010  | P1       |
| E-OFF-011 | P1       |

### Group F — Auto-renew (PATCH)

| ID        | Priority |
| --------- | -------- |
| F-ON-001  | P0       |
| F-ON-002  | P0       |
| F-ON-003  | P1       |
| F-ON-004  | P1       |
| F-ON-005  | P2       |
| F-ON-006  | P2       |
| F-OFF-007 | P1       |

### Group G — Rebind

| ID        | Priority |
| --------- | -------- |
| G-ON-001  | P0       |
| G-ON-002  | P1       |
| G-ON-003  | P1       |
| G-ON-004  | P2       |
| G-ON-005  | P1       |
| G-ON-006  | P2       |
| G-OFF-007 | P1       |

### Group H — Entitlement gates

| ID         | Priority |
| ---------- | -------- |
| H-BOTH-001 | P0       |
| H-BOTH-002 | P0       |
| H-BOTH-003 | P0       |
| H-BOTH-004 | P1       |
| H-BOTH-005 | P1       |
| H-BOTH-006 | P1       |
| H-ON-007   | P1       |
| H-ON-008   | P1       |
| H-OFF-009  | P1       |
| H-OFF-010  | P1       |

### Group I — Feature flag

| ID            | Priority |
| ------------- | -------- |
| I-OFF (suite) | P1       |
| I-ON (suite)  | P1       |
| I-001         | P1       |
| I-002         | P2       |
| I-003         | P2       |

### Group J — Database invariants

| ID    | Priority |
| ----- | -------- |
| J-001 | P1       |
| J-002 | P2       |
| J-003 | P2       |
| J-004 | P1       |
| J-005 | P1       |

### Group K — BillingScreen + BillingSnapshot (T2)

| ID                   | Priority |
| -------------------- | -------- |
| K-NONE-001           | P0       |
| K-ACTIVE-001         | P0       |
| K-CANCELLED-001      | P0       |
| K-PAYMENT_FAILED-001 | P0       |
| K-EXPIRED-001        | P0       |
| K-ACTIVE-002         | P1       |
| K-ACTIVE-003         | P1       |
| K-PAST-004           | P1       |
| K-NONE-005           | P2       |

### Group L — BillingOverlay (T2)

| ID    | Priority |
| ----- | -------- |
| L-001 | P1       |
| L-002 | P1       |
| L-003 | P1       |
| L-004 | P1       |
| L-005 | P1       |
| L-006 | P1       |

### Group M — Banners & modals (T2)

| ID    | Priority |
| ----- | -------- |
| M-001 | P1       |
| M-002 | P1       |
| M-003 | P1       |
| M-004 | P1       |
| M-005 | P1       |
| M-006 | P1       |
| M-007 | P1       |
| M-008 | P1       |
| M-009 | P1       |
| M-010 | P2       |

### Group N — Plan identity split (T2)

| ID    | Priority |
| ----- | -------- |
| N-001 | P2       |
| N-002 | P2       |

**Tier 3 (O):** Uses existing scenario IDs — A-BOTH-003, C-ON-005, G-ON-003, G-ON-004 — no additional IDs.

**Priority totals:** P0 ≈ 22 · P1 ≈ 58 · P2 ≈ 18 · **~98 scenario IDs**

---

## 3. CI execution profiles

### 3.1 `quick` (PR merge gate)

| Property             | Value                                                                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trigger**          | Every PR touching `netlify/functions/**`, `src/features/premiumSubscription/**`, `src/pages/UserDashboard/components/archive/**`, subscription migrations |
| **Scenarios**        | All **P0**                                                                                                                                                |
| **Tiers**            | T1 flag-OFF + T1 flag-ON (minimal P0 only) + T2 P0 screens                                                                                                |
| **Workers**          | T1 serial (1 worker); T2 parallel                                                                                                                         |
| **Target wall time** | **≤ 8 min**                                                                                                                                               |
| **Env**              | `DATABASE_URL_TEST`, `DEV_PAYMENT_MODE=true`, per-job flag                                                                                                |

```yaml
# Example job split
jobs:
  pr10-quick-off: { env: SUBSCRIPTION_AUTO_RENEW_ENABLED=false, grep: '@p0.*@flag-off|@p0' }
  pr10-quick-on: { env: SUBSCRIPTION_AUTO_RENEW_ENABLED=true, grep: '@p0.*@flag-on|@p0' }
  pr10-quick-ui: { grep: '@p0', tier: ui }
```

### 3.2 `nightly`

| Property             | Value                                                       |
| -------------------- | ----------------------------------------------------------- |
| **Trigger**          | Scheduled 02:00 UTC + manual                                |
| **Scenarios**        | **P0 + P1**                                                 |
| **Tiers**            | T1 both flags, T2 K/L/M P1, T3 smoke (A-BOTH-003, G-ON-004) |
| **Workers**          | T1 serial; T2 50% CPUs                                      |
| **Target wall time** | **≤ 20 min**                                                |

### 3.3 `full`

| Property             | Value                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| **Trigger**          | Pre-release, weekly, manual before flag enablement in staging                                      |
| **Scenarios**        | **P0 + P1 + P2** (entire matrix)                                                                   |
| **Tiers**            | All T1/T2/T3                                                                                       |
| **Workers**          | Same as nightly                                                                                    |
| **Target wall time** | **≤ 25 min**                                                                                       |
| **Notes**            | P2 scenarios tagged `@known-gap-I2` may use `expect.soft` or allowed-failure list until gap closed |

---

## 4. Retry policy (by test group)

Jest retry applies **only to transient failures** (DB connection, port timeout). **Never retry assertion failures.**

| Group                     | `retry` (CI)          | Rationale                                                         |
| ------------------------- | --------------------- | ----------------------------------------------------------------- |
| **A** Initial             | 0                     | Deterministic fulfillment; race tests (A-BOTH-003) must not retry |
| **B** Resubscribe         | 0                     | I2 gap assertions are intentional; retry would mask flakes        |
| **C** Upgrade             | 0                     | Idempotency tests (C-ON-004/005) conflict with retry              |
| **D** Scheduled downgrade | 0                     | Deterministic SQL                                                 |
| **E** Renewal             | 1 (nightly/full only) | Scheduler + dev payment occasionally slow on cold DB              |
| **F** Auto-renew PATCH    | 0                     | Synchronous PATCH                                                 |
| **G** Rebind              | 0                     | Duplicate-callback tests (G-ON-003) must not retry                |
| **H** Entitlement         | 0                     | Read-only gates                                                   |
| **I** Feature flag        | 0                     | Env is process-scoped                                             |
| **J** Invariants          | 0                     | Pure assertion on snapshot                                        |
| **K/L/M/N** UI            | 0                     | Render tests; retry hides React act warnings                      |
| **O** Smoke (T3)          | 0                     | Race tests — retry destroys signal                                |

**Global rule:** `maxRetries: 0` in `quick`. Nightly/full: `maxRetries: 1` only for files matching `**/renewal/**/*.test.ts`.

**Flake quarantine:** After 3 consecutive nightly flakes on a non-E scenario, downgrade to P2 and open issue — do not increase retries.

---

## 5. Failure diagnostics checklist

When any T1/T3 scenario fails, the test harness **must dump** (in `afterEach` on failure or custom reporter):

### 5.1 Subscription row

```sql
SELECT id, user_id, status, plan, slots_limit,
       provider_subscription_id, started_at, expires_at,
       payment_method_id, payment_method_title,
       next_charge_at, renewal_attempt_count, scheduled_plan, first_failed_at,
       created_at, updated_at
FROM subscriptions
WHERE user_id = $testUserId
ORDER BY created_at DESC;
```

Log as JSON. Include: scenario ID, flag mode, frozen `now` if fake timers.

### 5.2 Payment row(s)

```sql
SELECT id, user_id, provider, provider_payment_id, status, amount, currency,
       plan, kind, created_at, updated_at
FROM subscription_payments
WHERE user_id = $testUserId
ORDER BY created_at DESC
LIMIT 10;
```

Note open rows: `status IN ('pending', 'waiting_for_capture')`.

### 5.3 BillingSnapshot

From `GET /api/my-archive` response (or `buildBillingSnapshot(subscription)` in-process):

- `status`, `plan`, `slotsLimit`, `expiresAt`
- `autoRenewEnabled`, `hasPremiumAccess`
- `paymentMethodTitle`, `nextChargeAt`, `scheduledPlan`
- `renewalAttemptCount`, `firstFailedAt`
- Cross-check: `isPremium === billing.hasPremiumAccess`

### 5.4 Invariant violations

```typescript
getSubscriptionInvariantViolations(mapToInvariantSnapshot(subscription), now);
// Expected: [] or tagged e.g. ['I2'] for @known-gap-I2 scenarios
```

Log violated ids: I1–I6, UNKNOWN_STATUS (I7 via `canCreateRenewalPayment` when testing renewal eligibility).

### 5.5 Archive state

```sql
SELECT artist_user_id, is_active, locked_until, created_at, updated_at
FROM user_archive
WHERE user_id = $testUserId
ORDER BY created_at ASC;
```

Plus: `slotsUsed` (count active), `inactiveCount`, any artist `isLocked` mismatch.

### 5.6 Derived UI state (T2 failures)

Log: `billingScreen`, `overlays[]`, `resolveCurrentPlanSlug(...)` vs `billing.plan`.

### 5.7 Checklist order (on-call)

1. Wrong flag env? (`SUBSCRIPTION_AUTO_RENEW_ENABLED`, `DEV_PAYMENT_MODE`)
2. Migration 066–069 applied on test DB?
3. Frozen time drift? (grace / pre-billing / retry offsets)
4. Open payment blocking checkout?
5. Invariant violation unexpected?
6. Snapshot vs row mismatch?

---

## 6. Shared assertion helpers (test infrastructure)

Planned location: `netlify/functions/lib/__tests__/helpers/subscription-e2e-assertions.ts` (+ re-export for T2 UI helpers where applicable).

### 6.1 `expectSubscriptionState`

```typescript
expectSubscriptionState(
  subscription: Subscription | null,
  expected: Partial<{
    status: SubscriptionStatus;
    plan: SubscriptionPlanSlug;
    slotsLimit: number;
    paymentMethodId: string | null;
    paymentMethodTitle: string | null;
    nextChargeAt: Date | null;       // null = assert IS NULL
    scheduledPlan: string | null;
    renewalAttemptCount: number;
    firstFailedAt: Date | null;
    expiresAt: Date;
    providerSubscriptionId: string | null;
  }>,
  options?: { now?: Date }
): void
```

- Normalizes Date vs ISO comparisons.
- Optional `now` for expires-relative assertions.
- On mismatch → triggers diagnostics checklist §5.1.

### 6.2 `expectBillingSnapshot`

```typescript
expectBillingSnapshot(
  snapshot: BillingSnapshot,
  expected: Partial<BillingSnapshot>,
  options?: {
    compareTopLevel?: { isPremium?: boolean; slotsLimit?: number }; // my-archive API
  }
): void
```

- Asserts full or partial snapshot match.
- When `compareTopLevel` provided, asserts API duplication consistency.
- Derives and logs `resolveCollectionBillingScreen(snapshot)` on failure.

### 6.3 `expectInvariantSet`

```typescript
expectInvariantSet(
  subscription: Subscription,
  expected: {
    violations: string[];           // e.g. [] or ['I2']
    allowKnownGaps?: string[];     // tags: @known-gap-I2 → ['I2']
  },
  now?: Date
): void
```

- Wraps `getSubscriptionInvariantViolations`.
- **Known gaps:** when `allowKnownGaps` includes `'I2'`, passes if violations ⊆ allowKnownGaps (for B-ON-003, J-002).
- Fails if extra violations appear beyond allowed set.

### 6.4 Companion helpers (non-assertion)

| Helper                                    | Purpose                    |
| ----------------------------------------- | -------------------------- |
| `dumpSubscriptionDiagnostics(ctx)`        | Runs checklist §5.1–5.5    |
| `loadSubscriptionForUser(userId)`         | Latest row by `created_at` |
| `loadSubscriptionPaymentsForUser(userId)` | Recent payment rows        |
| `fetchMyArchiveSnapshot(token)`           | T1 API round-trip          |

---

## 7. Mutation-to-test coverage table

Every `subscriptions` / `subscription_payments` mutation path must map to **≥1 integration scenario**. No new scenarios — mapping uses existing IDs only.

| Mutation / code path                                     | File                                                                      | Scenario ID(s)                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| INSERT subscription (first purchase)                     | `subscription-billing.ts` `fulfillSubscriptionPayment`                    | A-BOTH-001                               |
| UPDATE subscription (canReuse resubscribe, B-4 cleanup)  | `subscription-billing.ts` `fulfillSubscriptionPayment`                    | B-BOTH-001, B-ON-003, B-ON-007, B-ON-008 |
| UPDATE subscription (active extension, no dunning clear) | `subscription-billing.ts` `fulfillSubscriptionPayment`                    | A-BOTH-001 (same-plan renew path)        |
| PM persist COALESCE (initial)                            | `subscription-fulfillment.ts` `persistInitialAutorenewFieldsIfMissing`    | A-ON-005, B-BOTH-001                     |
| PM persist skip (PM already exists)                      | `subscription-fulfillment.ts` `maybePersistPaymentMethod`                 | B-ON-003, B-ON-006                       |
| INSERT `subscription_payments` pending initial           | `subscription-billing.ts` `createPendingSubscriptionPayment`              | A-BOTH-001                               |
| INSERT `subscription_payments` pending renewal           | `subscription-billing.ts` `createPendingSubscriptionPayment`              | E-ON-001                                 |
| INSERT `subscription_payments` pending upgrade           | `subscription-billing.ts` `createPendingSubscriptionPayment`              | C-ON-001                                 |
| INSERT `subscription_payments` pending rebind            | `subscription-billing.ts` `createPendingSubscriptionPayment`              | G-ON-001                                 |
| UPDATE payment `claimSubscriptionPaymentSuccess`         | `subscription-billing.ts`                                                 | A-BOTH-002, A-ON-008, G-ON-003           |
| UPDATE payment `claimSubscriptionPaymentCanceled`        | `subscription-billing.ts`                                                 | G-ON-002, E-ON-002                       |
| PATCH disable auto-renew                                 | `subscription-auto-renew-patch.ts`                                        | F-ON-002, F-ON-006                       |
| PATCH enable auto-renew                                  | `subscription-auto-renew-patch.ts`                                        | F-ON-001, F-ON-003, B-ON-005             |
| UPDATE `scheduled_plan` (schedule)                       | `subscription-plan-schedule.ts`                                           | D-ON-001, D-ON-002                       |
| UPDATE `scheduled_plan = NULL` (cancel schedule)         | `subscription-plan-schedule.ts`                                           | D-ON-003                                 |
| Renewal success UPDATE                                   | `subscription-renewal-fulfillment.ts` `fulfillRenewalSubscriptionPayment` | E-ON-001, E-ON-003, E-ON-010, D-ON-004   |
| Renewal failure UPDATE (attempts 1–3)                    | `subscription-renewal-fulfillment.ts` `handleRenewalPaymentFailure`       | E-ON-002                                 |
| Dunning exhausted UPDATE                                 | `subscription-renewal-fulfillment.ts` `handleRenewalPaymentFailure`       | E-ON-006                                 |
| Period ended UPDATE                                      | `subscription-renewal-fulfillment.ts` `applySubscriptionPeriodEnded`      | E-ON-009                                 |
| Upgrade success UPDATE                                   | `subscription-upgrade-fulfillment.ts`                                     | C-ON-001, C-ON-002, C-ON-003             |
| Upgrade PM persist COALESCE                              | `subscription-upgrade-fulfillment.ts`                                     | C-ON-001                                 |
| Rebind UPDATE PM + title                                 | `subscription-rebind-fulfillment.ts`                                      | G-ON-001, G-ON-005, G-ON-006             |
| Renewal claim `next_charge_at` lock                      | `subscription-renewal-engine.ts` `claimSubscriptionForRenewalCharge`      | E-ON-007, E-ON-008                       |
| Renewal rollback                                         | `subscription-renewal-engine.ts` `rollbackRenewalChargeAttempt`           | E-ON-008 (error path)                    |
| `runRenewalCycle` orchestration                          | `subscription-renewal-engine.ts`                                          | E-ON-001, E-ON-007, E-ON-009, E-OFF-011  |
| Backfill `next_charge_at` (069)                          | migration 069                                                             | B-ON-004, J-003                          |
| Archive: deactivate excess on renewal                    | `archive.ts` `deactivateExcessArchiveArtists`                             | D-ON-005                                 |
| Archive: extend `locked_until` on renewal                | `archive.ts` `extendActiveArchiveLockedUntil`                             | E-ON-001                                 |
| Webhook → router → initial                               | `subscription-webhook.ts` → `subscription-payment-router.ts`              | A-BOTH-002, A-BOTH-003                   |
| Webhook → router → renewal                               | `subscription-webhook.ts` → router                                        | E-ON-002                                 |
| Webhook → router → upgrade                               | router                                                                    | C-ON-005                                 |
| Webhook → router → rebind                                | router                                                                    | G-ON-003                                 |
| Poll → fulfillment (dev)                                 | `get-subscription-payment-status.ts`                                      | A-BOTH-004, A-BOTH-003                   |
| `buildBillingSnapshot` projection                        | `subscription-billing-snapshot.ts`                                        | K-\* (all), H-BOTH-002                   |
| Entitlement gate (no mutation)                           | `subscription-access.ts`                                                  | H-\* (all)                               |

**Coverage rule:** Before PR-10 merge, every row must have at least one implemented test. Uncovered mutation → block merge or add mapping note in PR (no new scenario IDs).

---

## 8. Implementation file plan (infrastructure only)

```
netlify/functions/lib/__tests__/
  helpers/
    subscription-e2e-assertions.ts
    subscription-e2e-diagnostics.ts
    subscription-e2e-fixtures.ts
    subscription-e2e-scaffold.ts
    subscription-e2e-seed.ts
    subscription-e2e-setup.ts
    subscription-e2e-tags.ts
    subscription-e2e-time.ts
    subscription-e2e-ui-setup.ts
    jest.env.tier1-flag-off.ts
    jest.env.tier1-flag-on.ts
    index.ts
  integration/
    tier1-backend/   # Groups A–J
    tier2-ui/        # Groups K–N
    tier3-smoke/     # Group O
jest.config.pr10.ts  # tier1-flag-off | tier1-flag-on | tier2-ui | tier3-smoke
```

**npm scripts:** `test:e2e:quick` · `test:e2e:nightly` · `test:e2e:full`

Tag tests: `@p0`, `@p1`, `@p2`, `@flag-on`, `@flag-off`, `@known-gap-I2`, `@tier1|@tier2|@tier3`.

---

## 9. Document history

| Date       | Change                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| 2026-08-05 | Initial scenario matrix (PR-10 planning)                                                                         |
| 2026-08-05 | Refinement: priority, CI profiles, retry, diagnostics, assertion helpers, mutation map — **no scenario changes** |
