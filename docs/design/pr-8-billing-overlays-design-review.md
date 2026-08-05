# PR-8 — UI Design Review: Billing Overlays & Dunning Display

**Status:** Approved for implementation (frozen)  
**Date:** 2026-08-05  
**Handoff:** [premium-subscription-design-handoff.md](./premium-subscription-design-handoff.md#pr-8-implementation-handoff) — implementation constraints for coders  
**Depends on:** [premium-subscription-design-handoff.md](./premium-subscription-design-handoff.md), PR-4b (screens), PR-7.1 (BillingSnapshot fields)

Read-only design spec. **No date arithmetic in React components.** All visibility and dunning line selection via pure helpers.

---

## Architecture

```
BillingSnapshot + slotsUsed + now
        ↓
resolveCollectionBillingScreen(billing)  →  BillingScreen       (existing, PR-4b)
        ↓
resolveCollectionBillingOverlays({ billing, screen, slotsUsed, now })  →  BillingOverlay[]
        ↓
resolveDunningBannerSupplement(billing, now)  →  ≤2 supplemental lines  (PAYMENT_FAILED only)
        ↓
CollectionBillingSummary (render only — no business logic)
```

Symmetry with ADR-002: **screen** and **overlays** are both derived via named enums; JSX never branches on raw `status` or ad-hoc overlay strings.

---

## 1. `BillingOverlay` — strict enum (symmetry with `BillingScreen`)

Do **not** scatter string literals (`'pre-billing'`, `'downgrade'`, `'banner-pre-billing'`) across the codebase.

**File:** `src/features/premiumSubscription/lib/billingOverlay.ts` (mirrors `billingScreen.ts`)

```typescript
/** Named overlay variants for Collection billing (PR-8). */
export const BILLING_OVERLAY = {
  PRE_BILLING: 'pre_billing',
  DOWNGRADE_SLOTS: 'downgrade_slots',
} as const;

export type BillingOverlay = (typeof BILLING_OVERLAY)[keyof typeof BILLING_OVERLAY];

export const BILLING_OVERLAYS = Object.values(BILLING_OVERLAY);
```

Design-handoff asset IDs (`banner-pre-billing`, `banner-downgrade-slots`) are **documentation labels only**. Code uses `BillingOverlay` exclusively.

| Design handoff ID        | `BillingOverlay`                        |
| ------------------------ | --------------------------------------- |
| `banner-pre-billing`     | `PRE_BILLING` (`'pre_billing'`)         |
| `banner-downgrade-slots` | `DOWNGRADE_SLOTS` (`'downgrade_slots'`) |

### UI mapping

```typescript
switch (overlay) {
  case BILLING_OVERLAY.PRE_BILLING:
    return <PreBillingOverlayBanner ... />;
  case BILLING_OVERLAY.DOWNGRADE_SLOTS:
    return <DowngradeSlotsOverlayBanner ... />;
  default:
    return assertNever(overlay);
}
```

No string comparisons against `'pre-billing'` / `'downgrade'` anywhere outside `billingOverlay.ts`.

---

## 2. Banner taxonomy

| Kind                  | `BillingScreen` / `BillingOverlay` | Priority | Notes                       |
| --------------------- | ---------------------------------- | -------- | --------------------------- |
| State: cancelled      | `CANCELLED`                        | **100**  | PR-4b                       |
| State: expired        | `EXPIRED`                          | **100**  | PR-4b                       |
| State: payment-failed | `PAYMENT_FAILED`                   | **100**  | PR-4b + dunning supplements |
| Overlay               | `DOWNGRADE_SLOTS`                  | **50**   | `ACTIVE`, `CANCELLED`       |
| Overlay               | `PRE_BILLING`                      | **40**   | `ACTIVE` only               |

### Overlay vs state

- **State banners** — mutually exclusive (one `BillingScreen` → at most one state banner). Already implemented in PR-4b.
- **Overlay banners** — stack on allowed screens; never change `BillingScreen`.
- **Dunning UI** — enrichment of existing payment-failed state banner; **not** a `BillingOverlay`.

### Rendering order (fixed)

**Overlay rendering order is fixed and must never depend on JSX declaration order.**

1. State banner (priority 100) — keyed off `BillingScreen`
2. Overlays — **exact iteration order** of `resolveCollectionBillingOverlays()` return value

`resolveCollectionBillingOverlays` returns `BillingOverlay[]` **already sorted** by priority descending:

- `[DOWNGRADE_SLOTS, PRE_BILLING]` when both visible
- `[DOWNGRADE_SLOTS]` or `[PRE_BILLING]` when one visible
- `[]` when none

Priority values live **only** inside the resolver module (`BILLING_OVERLAY_PRIORITY` map). UI does not read or re-sort priorities.

---

## 3. UI never filters overlays

> **CollectionBillingSummary renders overlays exactly as returned by `resolveCollectionBillingOverlays()`. Components must not add additional conditions, hide overlays, or reorder them. All visibility rules belong exclusively to the resolver.**

Forbidden in UI components (including `CollectionBillingSummary`, `MyArchiveContent`, and overlay subcomponents):

```typescript
// ❌ never
overlays.filter(o => o !== BILLING_OVERLAY.PRE_BILLING && isMobile)
overlays.filter(() => billing.hasPremiumAccess)
if (overlay === BILLING_OVERLAY.PRE_BILLING && someLocalFlag) return null
[...overlays].sort(...)
```

Allowed:

```typescript
// ✅ render-only
const overlays = resolveCollectionBillingOverlays({ billing, screen, slotsUsed, now });
overlays.map((overlay) => <CollectionBillingOverlay key={overlay} overlay={overlay} ... />)
```

Responsive layout (CSS) may change **presentation**; it must not **omit** an overlay the resolver returned. If an overlay should be hidden on mobile, that rule belongs in the resolver (product decision) — not in JSX.

Same principle applies to dunning supplements: render exactly what `resolveDunningBannerSupplement()` returns (0–2 lines), no extra filtering.

---

## 4. Shared policy constants (single module)

**File:** `src/features/premiumSubscription/lib/subscriptionBillingPolicy.ts`

| Constant                       | Value              | Must match                                    |
| ------------------------------ | ------------------ | --------------------------------------------- |
| `PRE_BILLING_WINDOW_MS`        | `3 * 24 * HOUR_MS` | Design handoff T−3                            |
| `SUBSCRIPTION_GRACE_PERIOD_MS` | `7 * 24 * HOUR_MS` | `netlify/functions/lib/subscription-state.ts` |
| `MAX_RENEWAL_ATTEMPTS`         | `4`                | same backend module                           |

**Rule:** Date arithmetic for overlay visibility and dunning supplemental lines lives **only** in pure helpers that import from this module. React components receive pre-resolved enums, formatted strings, or line objects.

---

## 5. Overlay resolver

### API

```typescript
function resolveCollectionBillingOverlays(input: {
  billing: BillingSnapshot;
  screen: BillingScreen;
  slotsUsed: number;
  now?: Date;
}): BillingOverlay[];
```

Returns a sorted array of enum values — **not** `{ id, priority }` objects. Sorting is an implementation detail of the resolver.

### Visibility rules (pure helpers — resolver only)

| `BillingOverlay`  | `screen`                | Conditions                                                                                                        |
| ----------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `PRE_BILLING`     | `ACTIVE`                | `billing.nextChargeAt != null` **and** `now >= nextChargeAt - PRE_BILLING_WINDOW_MS` **and** `now < nextChargeAt` |
| `DOWNGRADE_SLOTS` | `ACTIVE` or `CANCELLED` | `billing.scheduledPlan != null` **and** `slotsUsed > slotsLimit(scheduledPlan)`                                   |

Helpers (private to resolver module):

- `isWithinPreBillingWindow(nextChargeAt, now)`
- `hasExcessSlotsForScheduledDowngrade(billing, slotsUsed)`

### BillingScreen × overlay matrix

| BillingScreen    | State banner               | Overlays allowed                 |
| ---------------- | -------------------------- | -------------------------------- |
| `NONE`           | — (summary hidden)         | none                             |
| `ACTIVE`         | none                       | `PRE_BILLING`, `DOWNGRADE_SLOTS` |
| `CANCELLED`      | cancelled                  | `DOWNGRADE_SLOTS` only           |
| `PAYMENT_FAILED` | payment-failed (+ dunning) | **none**                         |
| `EXPIRED`        | expired                    | none                             |

### Impossible combinations

| Combination                                          | Reason                                 |
| ---------------------------------------------------- | -------------------------------------- |
| `PRE_BILLING` on `CANCELLED`                         | Invariant I3: `next_charge_at IS NULL` |
| any overlay on `PAYMENT_FAILED` / `EXPIRED` / `NONE` | Matrix above                           |
| `DOWNGRADE_SLOTS` without excess slots               | `slotsUsed ≤ limit(scheduledPlan)`     |
| `PRE_BILLING` outside T−3 window                     | Window helper returns false            |
| two state banners                                    | Single `BillingScreen`                 |

---

## 6. Dunning banner (`PAYMENT_FAILED`) — content rules

Do **not** turn the banner into a long dump of all BillingSnapshot fields.

### Structure (fixed)

1. **Title** — copy deck
2. **Body** — copy deck
3. **Supplemental lines** — **maximum 2**, from `resolveDunningBannerSupplement(billing, now)`
4. **CTA** — copy deck

### Supplemental line selection

| Priority | Line key    | Shown when                      | Template (RU example)          |
| -------- | ----------- | ------------------------------- | ------------------------------ |
| 1        | `nextRetry` | `billing.nextChargeAt != null`  | «Следующая попытка: {date}»    |
| 2        | `graceEnd`  | `billing.firstFailedAt != null` | «Доступ сохранится до: {date}» |

**`graceEnd` date** = `firstFailedAt + SUBSCRIPTION_GRACE_PERIOD_MS` (helper only).

**Do not show:** `renewalAttemptCount` as its own line; `expiresAt` as supplemental when `graceEnd` is shown.

### Example

```
Не удалось продлить поддержку

[body copy]

Следующая попытка: 8 авг. 2026 г.
Доступ сохранится до: 12 авг. 2026 г.

[Обновить платёжные данные]
```

---

## 7. BillingSnapshot field usage

| Banner / area              | Fields                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------ |
| State: cancelled           | `expiresAt`, `autoRenewEnabled`                                                            |
| State: expired             | `expiresAt`, `plan`                                                                        |
| State: payment-failed      | copy deck + supplements from `nextChargeAt`, `firstFailedAt`; status line uses `expiresAt` |
| Overlay: `PRE_BILLING`     | `nextChargeAt`, `plan`                                                                     |
| Overlay: `DOWNGRADE_SLOTS` | `scheduledPlan`, `plan`, `expiresAt`; `slotsUsed` from archive                             |

UI **never** recomputes `hasPremiumAccess` (ADR-003).

---

## 8. Table-driven tests

### Existing

`resolveCollectionBillingScreen.test.ts` — `(status, hasPremiumAccess) → BillingScreen`

### New (required)

**File:** `resolveCollectionBillingOverlays.test.ts`  
Fixed `now = 2026-08-05T12:00:00.000Z`.

| status                 | screen         | scheduledPlan        | slotsUsed | slotsLimit | nextChargeAt        | expected `BillingOverlay[]`      |
| ---------------------- | -------------- | -------------------- | --------- | ---------- | ------------------- | -------------------------------- |
| `active`               | ACTIVE         | null                 | 1         | 2          | T−2d (`2026-08-07`) | `[PRE_BILLING]`                  |
| `active`               | ACTIVE         | `explorer` (limit 1) | 2         | 2          | T−2d                | `[DOWNGRADE_SLOTS, PRE_BILLING]` |
| `active`               | ACTIVE         | null                 | 1         | 2          | T−5d (`2026-08-10`) | `[]`                             |
| `active`               | ACTIVE         | `explorer`           | 1         | 2          | T−2d                | `[PRE_BILLING]`                  |
| `cancel_at_period_end` | CANCELLED      | `explorer`           | 2         | 2          | null                | `[DOWNGRADE_SLOTS]`              |
| `cancel_at_period_end` | CANCELLED      | null                 | 1         | 2          | null                | `[]`                             |
| `past_due`             | PAYMENT_FAILED | any                  | any       | any        | retry date          | `[]`                             |
| `expired`              | EXPIRED        | any                  | any       | any        | any                 | `[]`                             |

Additional cases: `screen === 'NONE'` → `[]`; `now >= nextChargeAt` → no `PRE_BILLING`; array order always `[DOWNGRADE_SLOTS, PRE_BILLING]` when both.

Use `BILLING_OVERLAY.*` constants in assertions — no string literals.

---

## 9. Implementation checklist (PR-8)

| Step | File / action                                                                            |
| ---- | ---------------------------------------------------------------------------------------- |
| 1    | `billingOverlay.ts` — enum + type (symmetry with `billingScreen.ts`)                     |
| 2    | `subscriptionBillingPolicy.ts` — date constants                                          |
| 3    | `resolveCollectionBillingOverlays.ts` + table-driven tests                               |
| 4    | `resolveDunningBannerSupplement.ts` + tests                                              |
| 5    | `CollectionBillingSummary.tsx` — `switch (overlay)` render; **no filtering/reordering**  |
| 6    | i18n — overlay copy + dunning templates (after copy deck)                                |
| 7    | Cancel scheduled downgrade CTA on `DOWNGRADE_SLOTS` overlay                              |
| 8    | Export `BillingOverlay`, `BILLING_OVERLAY`, resolver from `premiumSubscription/index.ts` |

---

## 10. Open gaps

| ID        | Note                                                          |
| --------- | ------------------------------------------------------------- |
| D-3       | Overlay PNGs not uploaded — reuse `BillingAlertBanner` chrome |
| Copy deck | Overlay strings not in handoff                                |
| PR-9      | Dunning CTA → rebind checkout                                 |

---

## Changelog

- **2026-08-05** — Initial review + refinements (date helpers, dunning cap, priority, tests).
- **2026-08-05** — `BillingOverlay` strict enum; **UI never filters overlays** rule.
