# Subscription autoprenew rollout checklist (PR-11)

Production rollout guide for Premium subscription autoprenewal. Use after PR-10 P0 merge gate is green in CI.

**Related:** [Implementation status](../adr/subscription-implementation-status.md) · [Autorenew backfill](../adr/subscription-autorenew-backfill.md) · [PR-10 E2E spec](../adr/pr-10-e2e-specification.md) · [Design handoff](../design/premium-subscription-design-handoff.md)

---

## Pre-rollout gates

- [ ] PR-10 P0 suite green in CI (`.github/workflows/pr10-e2e-quick.yml`)
- [ ] Staging deploy includes migrations 066–069
- [ ] Staging `SUBSCRIPTION_AUTO_RENEW_ENABLED=false` smoke (legacy checkout unchanged)
- [ ] Staging flag-on QA complete (manual checklist below)

---

## 1. Database migrations (066–069)

Apply in order on **staging**, then **production** (maintenance window not required — additive schema + data backfill only):

| #   | File                                                            | Purpose                                                                     |
| --- | --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 066 | `database/migrations/066_subscription_auto_renew_schema.sql`    | Autorenew columns: `next_charge_at`, dunning fields, `scheduled_plan`, etc. |
| 067 | `database/migrations/067_subscription_payments_kind.sql`        | `subscription_payments.kind` (`initial`, `renewal`, `upgrade`, `rebind`)    |
| 068 | `database/migrations/068_subscription_payment_method_title.sql` | Masked PM label for billing UI                                              |
| 069 | `database/migrations/069_subscription_autorenew_backfill.sql`   | Backfill `next_charge_at` for eligible active subs                          |

```bash
# Staging / production (uses DATABASE_URL)
npm run migrate
```

Verify all four appear in `schema_migrations`:

```bash
npx tsx scripts/ci/verify-subscription-migrations.ts
```

---

## 2. Migration 069 verification

Run after 069 on staging/production **before** enabling the feature flag.

**Count backfilled rows:**

```sql
SELECT COUNT(*) AS backfilled
FROM subscriptions
WHERE status IN ('active', 'cancel_at_period_end')
  AND expires_at > NOW()
  AND payment_method_id IS NOT NULL
  AND TRIM(payment_method_id) <> ''
  AND next_charge_at = expires_at;
```

**Eligible but still missing `next_charge_at` (expect 0):**

```sql
SELECT id, user_id, status, expires_at, payment_method_id, next_charge_at
FROM subscriptions
WHERE status IN ('active', 'cancel_at_period_end')
  AND expires_at > NOW()
  AND payment_method_id IS NOT NULL
  AND TRIM(payment_method_id) <> ''
  AND next_charge_at IS NULL;
```

**Active subs without PM (expected — scheduler skips until checkout/rebind):**

```sql
SELECT id, user_id, status, expires_at, next_charge_at
FROM subscriptions
WHERE status IN ('active', 'cancel_at_period_end')
  AND expires_at > NOW()
  AND (payment_method_id IS NULL OR TRIM(payment_method_id) = '');
```

Document counts in rollout ticket. See [subscription-autorenew-backfill.md](../adr/subscription-autorenew-backfill.md) for rollback SQL.

---

## 3. Feature flag enable sequence

**Default today:** `SUBSCRIPTION_AUTO_RENEW_ENABLED=false` — legacy one-time checkout only; renewal scheduler no-op.

| Step | Environment | Action                                                   |
| ---- | ----------- | -------------------------------------------------------- |
| 1    | Staging     | Migrations 066–069 applied; 069 verification queries run |
| 2    | Staging     | Set `SUBSCRIPTION_AUTO_RENEW_ENABLED=true`               |
| 3    | Staging     | Manual QA (§8) + optional `npm run test:e2e:nightly`     |
| 4    | Production  | Migrations 066–069 + 069 verification                    |
| 5    | Production  | Enable flag during low-traffic window                    |
| 6    | Production  | Confirm scheduler runs (§5) and monitor (§7)             |

**Do not enable production flag before:** migrations applied, 069 verified, YooKassa prerequisites (§4), staging sign-off.

**Related env (already required for payments):**

- `DEV_PAYMENT_MODE` — **must remain false/unset in production**
- `YOOKASSA_TEST_MODE` — **false in production**
- `YOOKASSA_SHOP_ID` / `YOOKASSA_SECRET_KEY` — platform shop credentials

---

## 4. YooKassa autopayments prerequisites

- [ ] Platform YooKassa shop configured in Netlify env (`YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`)
- [ ] **Autopayments (recurring)** enabled on YooKassa merchant account
- [ ] Return URLs set: `YOOKASSA_RETURN_URL`, optional `YOOKASSA_SUBSCRIPTION_RETURN_URL`
- [ ] Initial checkout saves `payment_method_id` (verified in staging P0 A-BOTH-001)
- [ ] Rebind flow updates PM without mutating plan (staging G-ON-001)
- [ ] Renewal charges use saved PM + `kind=renewal` idempotency (staging E-ON-001)
- [ ] Webhook endpoint reachable for `payment.succeeded` / `payment.canceled`

---

## 5. Scheduler enable

Renewal scheduler: `netlify/functions/scheduled-subscription-renewals.ts`

- **Schedule:** every 15 minutes (`netlify.toml` → `[functions."scheduled-subscription-renewals"]`)
- **Gate:** no-op when `SUBSCRIPTION_AUTO_RENEW_ENABLED=false`
- **When flag on:** claims rows where `next_charge_at <= NOW()`, creates renewal charges, runs dunning retries

**Post-enable verification:**

- [ ] Netlify function deploy includes `scheduled-subscription-renewals`
- [ ] Cron invocations appear in function logs after flag enable
- [ ] Test subscription with `next_charge_at` in past (staging) receives renewal charge row
- [ ] No duplicate charges on webhook retry (E-ON-002 P1 — spot-check manually)

Optional: set `SUBSCRIPTION_CRON_SECRET` if manual trigger endpoint is used.

---

## 6. Rollback steps

### Immediate (flag off)

1. Set `SUBSCRIPTION_AUTO_RENEW_ENABLED=false` in Netlify production env
2. Redeploy or wait for env propagation
3. Scheduler stops enqueueing new renewal charges (existing pending payments may still complete via webhook)

### Data rollback (069 only, pre-renewal activity)

If rollback needed **before** any post-enablement renewals:

```sql
UPDATE subscriptions
SET
  next_charge_at = NULL,
  updated_at = CURRENT_TIMESTAMP
WHERE status IN ('active', 'cancel_at_period_end')
  AND next_charge_at IS NOT NULL
  AND expires_at IS NOT NULL
  AND next_charge_at = expires_at
  AND payment_method_id IS NOT NULL;
```

> After live renewals, prefer point-in-time DB restore over blanket 069 rollback.

### Code rollback

Revert to previous deploy if critical defect. Flag-off preserves legacy one-time checkout behavior.

---

## 7. Monitoring checklist

**First 24–72 hours after production flag enable:**

- [ ] Renewal scheduler success/error logs (`scheduled-subscription-renewals`)
- [ ] Spike in `subscription_payments` with `kind='renewal'`
- [ ] `past_due` subscription count (dunning)
- [ ] YooKassa dashboard: failed autopayment rate
- [ ] Support tickets: billing / collection access
- [ ] Invariant spot-check: no `active` subs with `expires_at < NOW()` and premium access (H-\* scenarios)

**Alerts (recommended):**

- Scheduler function error rate > 0 for 2 consecutive cycles
- Renewal fulfillment failures (webhook errors on `kind=renewal`)
- Unusual growth in `past_due` or `expired` statuses

---

## 8. Manual QA checklist (staging, flag on)

### Checkout & lifecycle

- [ ] New subscriber: initial checkout → `ACTIVE`, PM saved, `next_charge_at` set (flag on)
- [ ] Resubscribe after expiry → premium restored
- [ ] Upgrade mid-cycle → new period, plan updated
- [ ] Schedule downgrade → `scheduled_plan` set; no immediate slot deactivation
- [ ] Cancel auto-renew → `CANCELLED` screen; access until period end
- [ ] Re-enable auto-renew → `ACTIVE`; rebind when PM missing

### Renewal & dunning

- [ ] Simulated renewal success (dev payment or staging clock) → period extended
- [ ] Failed renewal → `PAYMENT_FAILED` screen, grace access
- [ ] Rebind from dunning banner → PM updated

### Rebind

- [ ] Change card from `ACTIVE` enable modal
- [ ] `CANCELLED` resume with missing PM → rebind checkout
- [ ] Duplicate webhook/poll → idempotent PM update

---

## 9. Expected BillingScreen states after rollout

Mapping: `BillingSnapshot.status` → `resolveCollectionBillingScreen()` → UI screen.

| BillingScreen      | Backend `status`        | When user sees it (flag on)                                             |
| ------------------ | ----------------------- | ----------------------------------------------------------------------- |
| **NONE**           | _(no subscription row)_ | Never subscribed; billing summary hidden                                |
| **ACTIVE**         | `active`                | Paid period current; auto-renew on; green “Поддержка активна до {date}” |
| **CANCELLED**      | `cancel_at_period_end`  | User disabled auto-renew; yellow indicator; access until `expires_at`   |
| **PAYMENT_FAILED** | `past_due`              | Renewal failed; grace period; “Обновить платёжные данные” CTA           |
| **EXPIRED**        | `expired`               | Period ended without successful renewal/resubscribe                     |

**Overlays (flag on, when applicable):**

- Pre-billing banner: `ACTIVE` + `nextChargeAt` within 3 days
- Scheduled downgrade banner: `ACTIVE` or `CANCELLED` + excess archive slots + `scheduledPlan`

**Flag off (production today):** same screens for display where subscription row exists; renewal scheduler inactive; checkout remains one-time legacy path until flag enabled.

---

## 10. CI test isolation (reference)

PR-10 merge gate does **not** depend on shared Supabase or pre-existing data:

- Ephemeral PostgreSQL 16 service container per workflow run
- Full `npm run migrate` on empty database
- `truncateSubscriptionE2eTables()` + `@pr10-e2e.test` user cleanup before each tier1 test
- `DEV_PAYMENT_MODE=true` + YooKassa test mode — no live payment provider

See `.github/workflows/pr10-e2e-quick.yml`.

---

## Document history

| Date       | Change                                  |
| ---------- | --------------------------------------- |
| 2026-08-05 | Initial PR-10 Phase 3 rollout checklist |
