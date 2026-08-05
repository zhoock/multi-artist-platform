# Subscription auto-renew — Operations guide (PR-10.3)

Operational reference for Premium subscription auto-renew. **No product behavior** — logging, metrics, diagnostics, and incident response only.

**Related:** [Rollout checklist](../release/subscription-autorenew-rollout-checklist.md) · [Implementation status](../adr/subscription-implementation-status.md)

---

## Correlation IDs

All subscription lifecycle logs share a **`correlationId`** when possible:

| Priority | ID used                                                       |
| -------- | ------------------------------------------------------------- |
| 1        | `subscriptionPaymentId` (internal `subscription_payments.id`) |
| 2        | `providerPaymentId` (YooKassa payment UUID)                   |
| 3        | `subscriptionId` (scheduler charge / period-end)              |
| 4        | Random UUID (scheduler cycle root)                            |

Filter Netlify function logs: `correlationId:"<uuid>"` or `"correlationId":"<uuid>"`.

Webhook dedup id is logged as **`webhookEventId`** (`type-event-paymentId`).

---

## Log reference

All logs are **single-line JSON** with `"domain":"subscription"`.

### Checkout & lifecycle

| Event                                       | When                                           |
| ------------------------------------------- | ---------------------------------------------- |
| `subscription.checkout.created`             | Pending payment row + provider payment created |
| `subscription.initial.completed`            | First purchase fulfillment applied             |
| `subscription.resubscribe.completed`        | Initial pipeline reused expired/canceled row   |
| `subscription.upgrade.completed`            | Upgrade fulfillment applied                    |
| `subscription.scheduled_downgrade.applied`  | `scheduled_plan` set                           |
| `subscription.scheduled_downgrade.canceled` | Scheduled downgrade cleared                    |

### Fulfillment (webhook / poll / scheduler)

| Event                                | When                                     |
| ------------------------------------ | ---------------------------------------- |
| `subscription.fulfillment.started`   | Router dispatch begins                   |
| `subscription.fulfillment.completed` | Processor returned (see result fields)   |
| `subscription.fulfillment.rejected`  | Terminal payment state / validation skip |
| `subscription.fulfillment.failed`    | Processor threw                          |

### Renewal & dunning

| Event                                 | When                            |
| ------------------------------------- | ------------------------------- |
| `subscription.scheduler.cycle`        | Cron cycle aggregate counts     |
| `subscription.scheduler.charge`       | Per-subscription charge attempt |
| `subscription.scheduler.unauthorized` | Failed scheduler auth (PR-10.1) |
| `subscription.scheduler.error`        | Charge/engine failure           |
| `subscription.renewal.succeeded`      | Renewal period extended         |
| `subscription.renewal.failed`         | Dunning retry scheduled         |
| `subscription.renewal.exhausted`      | Dunning exhausted → expired     |
| `subscription.dunning.step`           | Dunning state transition        |
| `subscription.period.ended`           | Period-end expiry applied       |

### Webhook & poll

| Event                            | When                                       |
| -------------------------------- | ------------------------------------------ |
| `subscription.webhook.received`  | Verified notification entering processing  |
| `subscription.webhook.skipped`   | Rejected / duplicate / verification failed |
| `subscription.webhook.processed` | Handler completed                          |
| `subscription.webhook.error`     | Processing error (503 retry)               |
| `subscription.poll.processed`    | Poll handler completed fulfillment path    |

### Common fields

- `userId`, `userIdSuffix` (last 6 chars)
- `subscriptionId`, `subscriptionPaymentId`
- `providerPaymentIdSuffix` (last 6 chars — never full PAN)
- `kind`: `initial` \| `upgrade` \| `renewal` \| `rebind`
- `source`: `checkout` \| `webhook` \| `poll` \| `scheduler` \| `scheduled_plan`
- `statusBefore` / `statusAfter` (dunning, downgrade, period-end)

**Never logged:** secrets, cron tokens, payment method PAN/CVC, raw YooKassa payloads.

---

## Metric reference

Metrics emit as JSON lines with `"level":"metric"`. Parse from log drains or use in-memory counters in tests.

| Metric                                     | Labels    | Meaning                            |
| ------------------------------------------ | --------- | ---------------------------------- |
| `subscription.renewal.succeeded`           | `source`  | Renewal period extended            |
| `subscription.renewal.failed`              | `source`  | Dunning retry step                 |
| `subscription.renewal.exhausted`           | `source`  | Dunning exhausted                  |
| `subscription.webhook.fulfilled`           | `kind`    | Webhook path completed fulfillment |
| `subscription.poll.fulfilled`              | `kind`    | Poll path completed fulfillment    |
| `subscription.rebind.completed`            | `source`  | PM updated                         |
| `subscription.upgrade.completed`           | `source`  | Upgrade applied                    |
| `subscription.initial.completed`           | `source`  | Initial purchase applied           |
| `subscription.resubscribe.completed`       | `source`  | Resubscribe applied                |
| `subscription.scheduled_downgrade.applied` | —         | Downgrade scheduled                |
| `subscription.dunning.step`                | `outcome` | `retry_scheduled` \| `exhausted`   |

---

## Operational diagnostics (read-only)

```typescript
import { dumpSubscriptionLifecycleDiagnostics } from './netlify/functions/lib/subscription-lifecycle-diagnostics';

const dump = await dumpSubscriptionLifecycleDiagnostics(userId);
// dump: subscription, payments[], billingSnapshot, billingScreen, billingOverlays, invariants, archive
```

By provider payment id (webhook incident):

```typescript
import { dumpSubscriptionLifecycleDiagnosticsByProviderPaymentId } from './netlify/functions/lib/subscription-lifecycle-diagnostics';
```

**Read-only** — safe for ops scripts; does not mutate data.

---

## Troubleshooting

### User paid but subscription not active

1. Find `subscriptionPaymentId` or YooKassa `providerPaymentId` from checkout response.
2. Search logs: `correlationId` = payment row id.
3. Check `subscription.webhook.skipped` reason vs `subscription.fulfillment.completed`.
4. Run diagnostics dump; verify `subscription_payments.status` and `provider_subscription_id`.
5. If payment `succeeded` but subscription stale: poll endpoint may still fulfill — check `subscription.poll.processed`.

### Duplicate charge concern

1. Filter `subscription.fulfillment.completed` for same `correlationId`.
2. Expect `alreadyFulfilled: true` on replay (PR-10.2 guards).
3. Check `provider_subscription_id IS DISTINCT FROM` — only one lifecycle extension.

### Renewal not firing

1. Confirm `SUBSCRIPTION_AUTO_RENEW_ENABLED=true`.
2. Check `subscription.scheduler.cycle` every 15 min.
3. Verify `next_charge_at <= now`, `status IN (active, past_due)`, PM present.
4. Look for `subscription.scheduler.charge` with `outcome: skipped` + `reason`.

### POST_PROVIDER stuck (PR-10.1)

1. Search `subscription.scheduler.error` with `phase: POST_PROVIDER`.
2. **Do not** reset `next_charge_at` blindly.
3. Confirm webhook/poll completes fulfillment for pending renewal row.

### Dunning loop

1. Track `subscription.dunning.step` + `renewalAttemptCount`.
2. After `subscription.renewal.exhausted`, user should see `PAYMENT_FAILED` / `EXPIRED` screen.

---

## Incident checklist

| Step | Action                                                             |
| ---- | ------------------------------------------------------------------ |
| 1    | Identify `userId` or `providerPaymentId`                           |
| 2    | Pull correlated logs via `correlationId`                           |
| 3    | Run `dumpSubscriptionLifecycleDiagnostics`                         |
| 4    | Compare `billingSnapshot` vs user report                           |
| 5    | Check recent `subscription_payments` rows (kind, status)           |
| 6    | If scheduler-related: verify auth + `subscription.scheduler.cycle` |
| 7    | If payment provider outage: expect webhook 503 retries             |
| 8    | Escalate with dump JSON (redact if sharing externally)             |

### Rollback (no code)

- Set `SUBSCRIPTION_AUTO_RENEW_ENABLED=false` — stops scheduler; in-flight webhooks may still complete (documented in rollout checklist).

---

## Document history

| Date       | Change                           |
| ---------- | -------------------------------- |
| 2026-08-05 | PR-10.3 initial operations guide |
