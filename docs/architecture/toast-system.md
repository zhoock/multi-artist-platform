# Toast System

**Статус:** Phase 6 — legacy удалён; единая toast-система в production.

**Цель:** единый runtime для кратких transient-уведомлений без превращения Provider в универсальную систему popup/modal/notification.

**Исходники (план):** `src/shared/lib/toast/`

---

## Toast Architecture Rules

1. **`toast.show()` всегда in-memory.** Никакого sessionStorage, URL-параметров и другого persist в generic API.
2. **Provider не импортирует feature-код.** Только React, стили, `ToastTopLayer`, generic types.
3. **Provider не знает про navigation.** Нет path matching, redirect, ownership gating.
4. **Provider не знает про sessionStorage.**
5. **Provider не знает про auth / payment / account lifecycle.**
6. **Cross-navigation показы реализуются только через `arm*()` helpers** (отдельный surface, не `toast.show()`).
7. **Любой новый persistent toast требует отдельного архитектурного решения**, а не расширения `toast.show()`.

---

## Что такое toast (и что — нет)

| Toast ✅                                         | Не toast ❌                                         |
| ------------------------------------------------ | --------------------------------------------------- |
| Краткое подтверждение действия («Track deleted») | Подтверждение с выбором (`ConfirmationModal`)       |
| Auto-dismiss или явный dismiss                   | Блокирующий alert (`AlertModal`)                    |
| Пользователь может проигнорировать               | Banner, меняющий layout (`EmailVerificationBanner`) |
| Optional action / undo                           | Loading / saving state на кнопке или inline         |

Toast **не заменяет** modal system. Новый popup сначала проходит проверку: нужен ли blocking UI?

---

## Два entry point

### 1. Generic API (99% случаев)

```typescript
toast.show({
  variant: 'success' | 'error' | 'warning' | 'info',
  title: string,
  description?: string,
  duration?: number | null,       // null = persistent до dismiss
  dismissible?: boolean,
  placement?: 'top-right' | 'top-right-offset' | 'bottom-center',
  layer?: 'default' | 'top',        // 'top' → ToastTopLayer (поверх native <dialog>)
  action?: { label: string; onClick: () => void },
  undo?: { label: string; onUndo: () => void },
});

toast.dismiss(id: string);
```

- Только in-memory store внутри `ToastProvider`.
- Caller передаёт готовые строки (i18n lookup — на стороне feature).
- Форматирование domain-сообщений (`formatTrackDeletedSuccessMessage` и т.п.) — в feature/shared helpers, не в Provider.

### 2. Navigation persistence (2 кейса)

Full page navigation уничтожает React tree. Для таких сценариев — **отдельные helpers**, не флаги в `toast.show()`:

| Helper                                | Когда вызывать                                      | После reload                                                       |
| ------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| `armAccountDeletedToast()`            | Перед `location.replace('/')` при удалении аккаунта | Hydrator → `toast.show()` (persistent, bottom-center)              |
| `armPurchaseSuccessToast(returnPath)` | Перед `window.location.href = path` после оплаты    | Gating в `ServiceButtons` (`isOwned`, path match) → `toast.show()` |

Persistence — implementation detail модуля `toastNavigationPersistence.ts` (private). Feature-код **не** пишет в sessionStorage напрямую.

---

## Слои

```
toast.show() / toast.dismiss()     ← public generic API
ToastProvider + toastStore         ← runtime: stack, timers, variants, viewport

armAccountDeletedToast()           ← public feature helpers (2 шт.)
armPurchaseSuccessToast()
toastNavigationPersistence         ← private write/consume
useHydrateNavigationToasts()       ← App boot hook
```

**ToastProvider не импортирует** `toastNavigationPersistence`. Hydrator живёт в App и связывает persistence → `toast.show()`.

---

## Modal bridge

Modal → parent communication через **React callbacks**, не sessionStorage:

- `onEditAlbumNext(..., { createdNewAlbum })` → `toast.show()`
- `onSyncLyricsSaved` → `toast.show()`
- `onArticleEditorToast(payload)` → `toast.show({ action })`
- In-modal draft/error (article editor) → `toast.show()` или local state, пока modal open

Исторический паттерн `queue*()` + `sessionStorage` + `triggerKey` — legacy, подлежит удалению.

---

## Файловая структура (целевая)

```
src/shared/lib/toast/
  toastApi.ts                      ← toast.show / dismiss
  toastStore.ts
  toastNavigationPersistence.ts    ← private
  useHydrateNavigationToasts.ts
  ToastProvider.tsx
  ToastViewport.tsx
  types.ts
  toastDurations.ts
  showArticleEditorToast.ts

features/account/armAccountDeletedToast.ts
features/checkout/armPurchaseSuccessToast.ts   (или shared/lib/checkout/)
```

---

## Инварианты поведения (миграция)

| #   | Инвариант                                                                 |
| --- | ------------------------------------------------------------------------- |
| 1   | Account deleted toast переживает full reload                              |
| 2   | Account deleted: persistent, dismiss button, bottom-center                |
| 3   | Purchase success: только при `isOwned && !ownershipLoading && path match` |
| 4   | Error toasts: `role="alert"`, `aria-live="assertive"`                     |
| 5   | Article published: action + navigate, duration 6500 ms                    |
| 6   | Article draft/error: показ пока modal open                                |
| 7   | `layer: 'top'` — видимость поверх native `<dialog>`                       |
| 8   | Durations: 4000 / 4500 / 6500 ms (без silent unification)                 |
| 9   | `prefers-reduced-motion` отключает progress animation                     |
| 10  | Default toasts рендерятся через `ToastViewportLayer` (portal + top layer) |

---

## Root cause (layering regression)

После миграции P2-14 toast рендерился как обычный DOM-узел (`position: fixed; z-index: 2500`) внутри React-дерева `ToastProvider`, **без portal в `document.body`**.

Это не работает с модалками приложения по двум причинам:

1. **Browser top layer.** Все `Popup` / `AlertModal` / `ConfirmationModal` / Dashboard-модалки используют native `<dialog showModal()>`. Такой dialog попадает в browser top layer — слой **выше любого z-index** в обычном DOM. Toast с `z-index: 2500` оказывается под modal backdrop (на скриншоте toast «потемнён»).
2. **Точка монтирования.** `ToastViewport` жил внутри React-дерева провайдера; без portal toast теоретически мог попадать в stacking context предков (`transform`, `filter`, `overflow` у layout/header/player).

**Почему z-index «наугад» не помогает:** даже `z-index: 999999` не поднимет узел над `showModal()` — нужен собственный top-layer shell.

## Решение

```
ToastTopLayer            (dialog.showModal, z-index 10010, без backdrop)
ToastViewportLayer       (dialog.showModal, z-index 10000, без backdrop)
Native dialogs / Modals  (Popup, AlertModal, …)
Application UI
```

- `ToastProvider` монтирует `ToastViewport` через `createPortal(..., document.body)`.
- Default toast оборачиваются в прозрачный fullscreen `ToastViewportLayer` (`background: transparent`, `::backdrop { background: transparent }`, `pointer-events: none` на shell).
- `ToastTopLayer` — corner shell для `layer: 'top'` (StemsPlayground).
- При каждом изменении стека toast и при открытии любого modal (`Popup`, `LocalModal`, archive access) вызывается `promoteToastLayers()` (`close()` + `showModal()`) — toast снова оказывается **поверх** уже открытых modals.
- Глобальные стили `dialog` в `popup/style.scss` исключают `.toast-viewport-layer` / `.toast-top-layer`, чтобы не применять modal backdrop к toast shell.

Константы: `src/shared/lib/toast/zIndex.ts` + `_z-index.scss`.

---

## Z-index и layering

Native `<dialog>` с `showModal()` попадает в browser top layer — обычный `z-index` не поднимает toast над modal. Поэтому:

- **`ToastViewportLayer`** — прозрачный fullscreen `<dialog>` в `document.body` для default toasts; при каждом изменении стека вызывается `close()` + `showModal()` для re-promote поверх открытых modals.
- **`ToastTopLayer`** — corner dialog для `layer: 'top'` (StemsPlayground и native dialogs).
- Константы в `zIndex.ts` / `_z-index.scss`:

```typescript
export const Z_INDEX = {
  TOAST_VIEWPORT: 10000,
  TOAST_TOP_LAYER: 10010,
};
```

`z-index` на контейнерах нужен для не-dialog overlays; top-layer dialogs решают stacking с `<dialog>` modals.

---

## План миграции

| Phase | Содержание                                                          |
| ----- | ------------------------------------------------------------------- |
| 0     | `toastStore`, `ToastProvider`, `toast.show()`                       |
| 1     | `toastNavigationPersistence` + hydrator + `arm*()` helpers          |
| 2     | Legacy adapter (dual-write)                                         |
| 3–5   | Migrate toasts по одному; modal bridge → callbacks + `toast.show()` |
| 6     | Удалить legacy components, adapter, sessionStorage keys             |

---

## Anti-patterns

- ❌ `toast.show({ persistAcrossNavigation: true })` или любой persist-флаг в generic API
- ❌ Presets в Provider (`preset: 'account-deleted'`)
- ❌ Domain helpers внутри `toastApi.ts` (`toast.showAlbumPublished()`)
- ❌ Новый `queue*/consume*` без ADR
- ❌ Использовать toast для confirmation / blocking errors

---

## Связанные документы

- [docs/architecture.md](../architecture.md) — общая архитектура проекта
- Legacy toast audit — agent transcript / prior conversation (17 independent toast stacks до миграции)

Документ обновляйте при изменении toast API или добавлении нового persistent-сценария.
