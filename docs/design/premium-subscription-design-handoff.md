# Design Handoff — Premium Subscription (Collection billing)

**Status:** Accepted with noted gaps (missing assets)  
**Date:** 2026-08-05  
**Implementation status:** [subscription-implementation-status.md](../adr/subscription-implementation-status.md)  
**Source asset:** `assets/ChatGPT_Image_Aug_5__2026__02_58_24_PM-1bbb982b-7d1e-4cf2-8430-bfa39a386f85.png`

Official UI specification for Premium billing on **Ваша коллекция**. Do not redesign without product approval.

---

## 1. Mockup catalog

### Full screens (BillingScreen)

| ID                             | Название               | BillingScreen    | Backend `status`       | Тип    | Назначение                                                                                                                                             |
| ------------------------------ | ---------------------- | ---------------- | ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `subscriptions-active`         | Active subscription    | `ACTIVE`         | `active`               | Screen | Текущий план активен, автопродление включено. Зелёный индикатор «Поддержка активна до {date}». CTA «Сменить план». Блок «Рекомендуемый план» (upsell). |
| `subscriptions-cancelled`      | Cancel at period end   | `CANCELLED`      | `cancel_at_period_end` | Screen | Banner «Поддержка отменена» + «Возобновить поддержку». Жёлтый индикатор. Текущий план до конца периода.                                                |
| `subscriptions-payment-failed` | Payment failed (grace) | `PAYMENT_FAILED` | `past_due`             | Screen | Banner «Не удалось продлить поддержку» + «Обновить платёжные данные». «Последний план» + дата истечения.                                               |
| `subscriptions-expired`        | Expired                | `EXPIRED`        | `expired`              | Screen | Banner «Поддержка завершена» + «Выбрать тариф». «Последний план» + «Истёк {date}».                                                                     |
| `subscriptions-none`           | No Premium summary     | `NONE`           | _(no row)_             | Screen | **Not in uploaded composite.** Коллекция без billing summary (never subscribed / empty). Placeholder per ADR README.                                   |

### Shared layout (all uploaded screens)

| Element          | Description                                             |
| ---------------- | ------------------------------------------------------- |
| Sidebar          | Dashboard nav; «Ваша коллекция» active                  |
| Header           | «Ваша коллекция» + close                                |
| Plan card        | «Текущий план» или «Последний план» + tier name + price |
| Recommended plan | «Рекомендуемый план» Archivist + «Повысить тариф»       |
| Collection usage | «Использование коллекции» + progress (N из M артистов)  |
| Artist list      | Artists with remove actions                             |

### Modals (referenced in ADR / PR roadmap — **not in upload**)

| ID                        | Название                   | BillingScreen (trigger)                 | Тип   | Назначение                     |
| ------------------------- | -------------------------- | --------------------------------------- | ----- | ------------------------------ |
| `modal-disable-autorenew` | Disable auto-renew confirm | `ACTIVE`                                | Modal | Confirm before PATCH disable   |
| `modal-enable-autorenew`  | Enable auto-renew confirm  | `CANCELLED`                             | Modal | Confirm before PATCH enable    |
| `modal-enable-rebind`     | Enable requires rebind     | `CANCELLED`                             | Modal | PM missing — redirect checkout |
| `modal-plan-upgrade`      | Upgrade plan confirm       | `ACTIVE` / picker                       | Modal | Full charge + new period copy  |
| `modal-plan-downgrade`    | Schedule downgrade confirm | `ACTIVE`                                | Modal | Effective next period          |
| `modal-rebind-card`       | Change payment method      | `ACTIVE`, `CANCELLED`, `PAYMENT_FAILED` | Modal | Rebind checkout                |

### Banners (overlays — **not separate uploads**)

| ID                       | Назначение                              | BillingScreen          |
| ------------------------ | --------------------------------------- | ---------------------- |
| `banner-pre-billing`     | T−3 days before charge                  | `ACTIVE`               |
| `banner-downgrade-slots` | Excess slots before scheduled downgrade | `ACTIVE` / `CANCELLED` |

State banners in upload **are part of** screen mockups (cancelled / expired / payment-failed), not separate files.

---

## 2. Copy deck (from mockups — do not paraphrase)

### `subscriptions-active`

- Section: «ТЕКУЩИЙ ПЛАН»
- Status: «Поддержка активна до {date}» (green indicator)
- CTA: «Сменить план»
- Recommended: «РЕКОМЕНДУЕМЫЙ ПЛАН», «Повысить тариф»

### `subscriptions-cancelled`

- Banner title: «Поддержка отменена»
- Banner body: «Автопродление отключено. Поддержка артистов сохранится до окончания оплаченного периода.»
- Banner CTA: «Возобновить поддержку»
- Status: «Поддержка активна до {date}» (yellow indicator)

### `subscriptions-expired`

- Banner title: «Поддержка завершена»
- Banner body: «Срок оплаченного периода закончился. Чтобы снова поддерживать любимых артистов и пользоваться премиум-функциями, выберите тариф.»
- Banner CTA: «Выбрать тариф»
- Section: «ПОСЛЕДНИЙ ПЛАН»
- Status: «Истёк {date}»

### `subscriptions-payment-failed`

- Banner title: «Не удалось продлить поддержку»
- Banner body: «Не удалось списать ежемесячный платёж. Обновите платёжные данные, чтобы возобновить поддержку.»
- Banner CTA: «Обновить платёжные данные»
- Section: «ПОСЛЕДНИЙ ПЛАН»
- Status: «Истёк {date}» _(access continues during grace per policy)_

---

## 3. Compliance check

| Check                                                       | Result                                     |
| ----------------------------------------------------------- | ------------------------------------------ |
| One BillingScreen → one screen layout (uploaded)            | ✔ 4/4 uploaded screens map 1:1            |
| Each backend status with premium/expired UI has screen      | ✔ except `NONE` (asset missing)           |
| ADR BillingScreen enum names                                | ✔ match                                   |
| State ownership                                             | ✔ layout from mockup; status from backend |
| Interaction: banner on CANCELLED / EXPIRED / PAYMENT_FAILED | ✔ matches Interaction source              |
| Interaction: no banner on ACTIVE                            | ✔                                         |
| Modals in PR-5/6/9                                          | ⚠ assets not uploaded (see discrepancies) |

---

## 4. Discrepancies (do not fix without approval)

| #   | Type               | Description                                                                                                                                                                                                                                                |
| --- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | **Missing assets** | `subscriptions-none` not in upload. Required for `BillingScreen.NONE`.                                                                                                                                                                                     |
| D-2 | **Missing assets** | All modals (`modal-disable-autorenew`, `modal-enable-autorenew`, plan change, rebind) not uploaded.                                                                                                                                                        |
| D-3 | **Missing assets** | Overlay banners `banner-pre-billing`, `banner-downgrade-slots` not uploaded.                                                                                                                                                                               |
| D-4 | **Documentation**  | «Рекомендуемый план» upsell block on all 4 screens — not listed in ADR mapping table; treat as **shared chrome** on Collection billing layout (document in Interaction source v2026-08-05 amendment).                                                      |
| D-5 | **Copy vs policy** | Mockup shows «Истёк {date}» on **payment-failed** screen while grace policy keeps access — UI label reflects billing period end, not entitlement; backend `hasPremiumAccess` remains true in `past_due`. Confirm with product (wording OK if intentional). |
| D-6 | **Price display**  | Mockup Archivist **199 ₽**; `PLAN_CATALOG` production **149 ₽** — implementation uses backend catalog, mockup is visual reference only until catalog updated.                                                                                              |

**No changes made** to mockups, ADR, or Interaction source per handoff rules.

---

## 5. Design Handoff Summary

| Metric                              | Count |
| ----------------------------------- | ----- |
| Full screens in upload              | **4** |
| Full screens required (incl. NONE)  | **5** |
| Modals (documented, pending assets) | **6** |
| Overlay banners (pending assets)    | **2** |

| Gate                                     | Status                                                       |
| ---------------------------------------- | ------------------------------------------------------------ |
| BillingScreen mapping (uploaded screens) | ✔ **COMPLETE**                                              |
| BillingScreen `NONE`                     | ⚠ pending asset                                             |
| Interaction Source (screens)             | ✔ **COMPLETE**                                              |
| Interaction Source (modals)              | ⚠ pending assets                                            |
| Modals copy                              | ⚠ pending assets                                            |
| **PR-4** (data only)                     | **READY** — no UI                                            |
| **PR-4b** (UI per mockup)                | **READY** for 4 screens; blocked on D-1, D-2 for full parity |
| **PR-5**                                 | **READY** logic; **blocked** on modal assets (D-2)           |
| **PR-6**                                 | **READY** logic; **blocked** on modal assets (D-2)           |
| **PR-8**                                 | **READY** logic; **blocked** on banner assets (D-3)          |
| **PR-9**                                 | **READY** logic; **blocked** on rebind modal (D-2)           |

**Design accepted for implementation** of uploaded screens and documented interactions. Missing assets must be supplied before modal/banner PR UI sign-off.

---

## 6. Interaction source reference

```
NONE          → subscriptions-none (asset TBD)
ACTIVE        → subscriptions-active
CANCELLED     → subscriptions-cancelled
PAYMENT_FAILED → subscriptions-payment-failed
EXPIRED       → subscriptions-expired
```

Resolver: `BillingScreen` enum only — see [docs/adr/README.md](../adr/README.md).
