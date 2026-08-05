# Premium subscription billing — Architecture Decision Records

Decisions for **Premium autoprenewal** (artist support / Collection), approved during architecture and product design (2026-08).

**Status:** Accepted (implementation in progress).

---

## ADR-001: Subscription status is backend-only

**Status:** Accepted  
**Date:** 2026-08-05

### Context

Premium lifecycle includes phases: active subscription, user disabled auto-renew but still in paid period, failed renewal (grace), and expired access. Storing multiple independent flags (`status` + `auto_renew_enabled` + client-derived premium) leads to contradictory UI states (e.g. `active` with auto-renew off).

### Decision

- Single field **`subscriptions.status`** is the source of truth for lifecycle phase:
  - `active` — paid period, auto-renew **on**
  - `cancel_at_period_end` — paid period, auto-renew **off**
  - `past_due` — renewal failed, grace / dunning
  - `expired` — no Premium access
- **`auto_renew_enabled` is not stored.** It is derived: `status === 'active'`.
- Frontend **reads** `billing.status` from API; it **never** writes or guesses status locally.

### Consequences

- One transition module on backend (`subscription-state`) owns all SM changes.
- API must expose canonical status after every mutation (refetch pattern).
- Legacy DB values (`canceled`, `trial`, `paused`) map to canonical statuses at read/migration time.

---

## ADR-002: BillingScreen is derived only via resolver

**Status:** Accepted  
**Date:** 2026-08-05

### Context

Collection billing UI has several distinct layouts (active, cancelled-at-period-end, payment failed, expired). Using numeric screen IDs (`Screen1`, `Screen3`) or scattering `if (status === 'past_due')` across components makes code unreadable and error-prone.

### Decision

- Introduce named enum **`BillingScreen`**: `NONE`, `ACTIVE`, `CANCELLED`, `PAYMENT_FAILED`, `EXPIRED`.
- **Single function** `resolveCollectionBillingScreen(billingSnapshot)` maps backend snapshot → `BillingScreen`.
- React components choose **layout** only from `BillingScreen`, not directly from raw `status` (except for API actions that require it).
- Mapping to mockups is fixed — see [README.md](./README.md#backend-status--billingscreen--mockup).

### Consequences

- New billing UI states require updating resolver + Interaction source + mockup table together.
- Unit tests table-drive: `(status, hasPremiumAccess) → BillingScreen`.
- Do not return numeric screen indices from resolver.

---

## ADR-003: UI never computes hasPremiumAccess

**Status:** Accepted  
**Date:** 2026-08-05

### Context

Premium gates collection management, paywall, stems, downloads. Client-side `expires_at > Date.now()` diverges from backend when clocks skew, webhook delay, or `past_due` grace rules apply.

### Decision

- **`hasPremiumAccess`** is computed only on backend (`subscription-access.ts`) and returned in **`GET /api/my-archive`** (billing snapshot).
- Frontend uses API value for gating and display; **forbidden**: local date comparison for entitlement.
- `PremiumSubscriptionContext` mirrors API fields; it does not re-derive premium logic.

### Consequences

- Paywall and archive endpoints stay consistent with one access function.
- After billing mutations, client must **refetch** my-archive (see ADR-004).
- Tests for access rules live in backend unit tests.

---

## ADR-004: No optimistic billing UI

**Status:** Accepted  
**Date:** 2026-08-05

### Context

Optimistic updates for “disable auto-renew” or “enable auto-renew” show wrong state if PATCH fails or webhook is delayed, causing support tickets and double actions.

### Decision

- After any billing mutation (`PATCH auto-renew`, schedule downgrade, rebind success): **refetch** `getMyArchive`; update UI from response.
- Loading/disabled state on buttons during request; **no** local flip of `status` or `BillingScreen` before server confirms.
- Checkout success page may poll payment status (existing pattern); fulfillment still server-authoritative.

### Consequences

- Slightly slower UX on slow networks; correct state always.
- Modal closes only after success + refetch (or explicit error).

---

## ADR-005: Upgrade starts a new 30-day billing cycle

**Status:** Accepted  
**Date:** 2026-08-05

### Context

Plans differ by collection slot limits (Explorer / Collector / Archivist). Users upgrading mid-cycle expect more slots immediately. Proration with YooKassa + 54-FZ adds complexity without strong product need at current price points.

### Decision

- **Upgrade** (higher tier): immediate effect after successful payment.
- Charge **full price of the new plan** (no proration in v1).
- **`expires_at = now + 30 days`** (new billing cycle from payment time).
- Slot limit increases immediately; plan change may deactivate archive artists if slots shrink (upgrade only increases — no deactivation on upgrade).
- Checkout metadata: `kind=upgrade`.

### Consequences

- Clear copy in confirm modal: user pays full new plan amount, new 30-day period.
- Differs from some SaaS proration — document in help/offer.
- Downgrade handled separately (ADR-006).

---

## ADR-006: Downgrade takes effect at next period

**Status:** Accepted  
**Date:** 2026-08-05

### Context

Lowering slot limit mid-cycle would force removing supported artists immediately — conflicts with “support artists” product narrative and 30-day artist lock rules.

### Decision

- **Downgrade** is **scheduled** for next renewal (`scheduled_plan` in DB).
- **No charge** at schedule time; current plan and slots remain until `expires_at`.
- At renewal: charge lower plan price; apply new `slots_limit`.
- After **successful** renewal payment, Renewal Engine **automatically deactivates only excess** archive artists (deterministic order: `locked_until DESC`, then `created_at DESC`).
- UI shows “Effective from {date}” per Interaction source.

### Consequences

- User keeps higher tier benefits until period end.
- Renewal engine must read `scheduled_plan` when creating next charge.
- Cancel scheduled downgrade = clear `scheduled_plan`.
- On `DUNNING_EXHAUSTED` or `PERIOD_ENDED`, clear `scheduled_plan` so a stale downgrade cannot apply after resubscribe.

---

## ADR-007: Grace period with continued Premium access

**Status:** Accepted  
**Date:** 2026-08-05

### Context

On failed auto-renewal, immediate cutoff is harsh for a support product and increases churn. Alternative (instant expire) simplifies code but hurts UX and matches poorly with industry norms.

### Decision

- On first failed renewal attempt: transition `active` → **`past_due`**.
- **`hasPremiumAccess` remains true** during grace (7 calendar days from first failure).
- **Retry policy:** 4 payment attempts over 7 days (at `expires_at`, +24h, +72h, +168h from first failure).
- After exhausted retries: → **`expired`**, access ends.
- User may disable auto-renew during grace → `cancel_at_period_end`, retries stop, access until original `expires_at` (not extended).

### Consequences

- `past_due` UI uses `BillingScreen.PAYMENT_FAILED` mockup + rebind/retry CTAs.
- Emails: failure, final expiry (billing notification spec).
- Scheduler + webhook must implement dunning idempotently.

---

## ADR-008: YooKassa recurring is merchant-managed

**Status:** Accepted  
**Date:** 2026-08-05

### Context

YooKassa provides **autopayments** (saved payment method + `payment_method_id`), not a hosted subscription product with built-in schedule. Periodicity, retries, and cancellation are **merchant responsibilities** ([YooKassa recurring docs](https://yookassa.ru/developers/payment-acceptance/scenario-extensions/recurring-payments/basics)).

### Decision

- **First checkout:** `save_payment_method: true`; persist **`payment_method.id`** on success.
- **Renewals:** server cron creates new `POST /v3/payments` with `payment_method_id` (no user redirect).
- **Disable auto-renew:** merchant-side only — stop scheduling charges; set `cancel_at_period_end`; **do not** rely on YooKassa to “cancel subscription” (API does not delete saved PM).
- **Disable recurring in prod shop** until YooKassa manager enables autopayments; test shop supports by default.
- Feature flag **`SUBSCRIPTION_AUTO_RENEW_ENABLED`** gates scheduler until rollout complete.
- Idempotency: claim `next_charge_at` in DB; unique Idempotence-Key per attempt; webhook dedupe via `webhook_events`.

### Consequences

- Netlify scheduled function (or external cron) required — new operational component.
- Receipt (54-FZ) on each renewal charge.
- Rebind = new checkout saving new PM; user consent in offer/checkout copy.

---

## ADR-009: Subscription fulfillment pipelines are separate

**Status:** Accepted  
**Date:** 2026-08-05

### Context

Premium billing involves four distinct user intents that look similar in the plan picker but differ in **payment timing**, **DB mutations**, and **when plan/slots take effect**:

- First purchase vs return after expiry (resubscribe) both use “checkout”, but are not mid-cycle plan changes.
- **Upgrade** mid-cycle is immediate, full-price, and resets the billing period ([ADR-005](./subscription-premium-billing.md#adr-005-upgrade-starts-a-new-30-day-billing-cycle)).
- **Downgrade** mid-cycle is never immediate; it is scheduled for the next period ([ADR-006](./subscription-premium-billing.md#adr-006-downgrade-takes-effect-at-next-period)).

A single shared `fulfillSubscriptionPayment()` path for all checkouts caused downgrade to apply immediately, upgrade to share initial-checkout side effects, and archive artists to be deactivated outside renewal. **These pipelines must not be merged.**

### Decision

There are **four fulfillment pipelines**. Each has its own entry point, allowed triggers, and side effects. **Never route one intent through another pipeline.**

#### Pipeline map

```
Initial (first purchase)
  → POST /api/create-subscription-payment  (kind=initial, no intent)
  → processInitialSubscriptionProviderPayment()
  → fulfillInitialSubscriptionPayment() → fulfillSubscriptionPayment()

Resubscribe (after expired / no active period)
  → POST /api/create-subscription-payment  (kind=initial, no intent)
  → same initial pipeline as above
  → RESUBSCRIBE_SUCCEEDED (state machine) on fulfillment

Upgrade (higher tier, mid-cycle)
  → POST /api/create-subscription-payment  (intent=upgrade, kind=upgrade)
  → processUpgradeSubscriptionProviderPayment()
  → fulfillUpgradeSubscriptionPayment()
  → PLAN_CHANGE_SUCCEEDED; clears dunning + scheduled_plan

Downgrade (lower tier, mid-cycle)
  → POST /api/subscription/scheduled-plan   (no checkout, no payment row)
  → subscriptions.scheduled_plan = target
  → plan / slots / expires_at unchanged until renewal
  → DELETE /api/subscription/scheduled-plan to cancel

Downgrade apply (at renewal only — PR-7+)
  → renewal engine reads scheduled_plan
  → charge lower plan; apply plan + slots_limit
  → **only place** archive artists may be deactivated for slot reduction
```

#### Hard rules (invariants)

| Rule     | Detail                                                                                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I-P1** | Mid-cycle **upgrade** MUST use `intent=upgrade` and `kind=upgrade`. Initial checkout without intent for a higher tier while subscription is `active`, `cancel_at_period_end`, or `past_due` → **409 `UPGRADE_INTENT_REQUIRED`**. |
| **I-P2** | Mid-cycle **downgrade** MUST NOT create `subscription_payments` or call YooKassa. Schedule only via `scheduled_plan`.                                                                                                            |
| **I-P3** | **Upgrade** MUST NOT call `deactivateAllArchiveArtists`. Slots only increase at upgrade time.                                                                                                                                    |
| **I-P4** | **Artist deactivation** for slot reduction happens **only** when the renewal engine applies `scheduled_plan` (PR-7). Nowhere else in the system.                                                                                 |
| **I-P5** | Webhook/poll route by payment `kind`: `processInitialSubscriptionProviderPayment` rejects `upgrade`; `processUpgradeSubscriptionProviderPayment` rejects `initial`. Router: `subscription-payment-router.ts`.                    |
| **I-P6** | Open checkout guard: pending/waiting payment → **409 `CHECKOUT_IN_PROGRESS`** (no auto-cancel).                                                                                                                                  |

#### Code anchors (implementation)

| Pipeline              | Primary modules                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Initial / resubscribe | `subscription-fulfillment.ts`, `fulfillSubscriptionPayment()`                            |
| Upgrade               | `subscription-upgrade-fulfillment.ts`, `assertUpgradeIntentRequiredForMidCycleUpgrade()` |
| Downgrade schedule    | `subscription-plan-schedule.ts`, `post-subscription-scheduled-plan.ts`                   |
| Downgrade apply       | renewal engine — `subscription-renewal-fulfillment.ts`                                   |

#### Related ADRs

- Upgrade policy: [ADR-005](#adr-005-upgrade-starts-a-new-30-day-billing-cycle)
- Downgrade policy: [ADR-006](#adr-006-downgrade-takes-effect-at-next-period)
- Refetch after mutations: [ADR-004](#adr-004-no-optimistic-billing-ui)

### Consequences

- New plan-change behavior requires identifying the pipeline first — not extending a shared “fulfill payment” helper.
- Plan picker UI may look unified; backend and API contracts stay split.
- PR-7 (scheduler / renewal) owns `scheduled_plan` application and artist deactivation — PR-6 deliberately does not.
- Feature flag off: schedule/upgrade guards return 503; legacy single checkout path remains until rollout.

---

## Changelog

| Date       | Change                                                                         |
| ---------- | ------------------------------------------------------------------------------ |
| 2026-08-05 | ADR-006: excess artists deactivated at renewal apply (PR-7), not block-renewal |
| 2026-08-05 | ADR-009: separate fulfillment pipelines (PR-6)                                 |
| 2026-08-05 | Initial 8 ADRs for Premium autoprenewal                                        |
