# Dashboard UI Kit

Единая точка входа для presentation-слоя User Dashboard.

**Импорт:** `@shared/ui/dashboard`

---

## 1. Назначение

Dashboard UI Kit — единая дизайн-система Dashboard. Он задаёт визуальный язык и повторяющиеся UI-паттерны для всех вкладок и экранов дашборда.

**Главная задача:**

- единый внешний вид;
- единое поведение;
- отсутствие дублирования presentation layer.

Dashboard UI Kit **не содержит бизнес-логики**. Он не знает об альбомах, статьях, стемах, оплате и других доменных сущностях. Domain-компоненты используют kit как набор примитивов и инфраструктуры, но сами в kit не входят.

---

## 2. Архитектурные слои

### Dashboard UI primitives

Примитивы отвечают **только за presentation**: разметку, стили, базовые состояния (selected, disabled, loading, destructive).

| Компонент                 | Назначение                                           |
| ------------------------- | ---------------------------------------------------- |
| `DashboardSection`        | Секция с заголовком и контентом                      |
| `DashboardCard`           | Карточка-контейнер (списки, панели, expandable rows) |
| `DashboardRow`            | Строка label + value / action                        |
| `DashboardRowValue`       | Значение внутри строки                               |
| `DashboardRowValueWrap`   | Обёртка для сложного value-контента                  |
| `DashboardRowInlineError` | Inline-ошибка в строке                               |
| `DashboardAction`         | Текстовая кнопка действия в строке                   |
| `DashboardIconButton`     | Иконочная кнопка (drag handle, play, delete и т.п.)  |
| `DashboardCta`            | Primary CTA (кнопка или ссылка через `as`)           |
| `DashboardEmptyState`     | Пустое состояние (`variant`: `tab` \| `card`)        |

**Стили форм** (CSS-классы, без React-компонентов):

- `dashboard-form-input`
- `dashboard-form-textarea`
- `dashboard-form-select` (+ `__trigger`, `__value`, `__arrow`, `__menu`, `__option`)

Подключаются автоматически через `@shared/ui/dashboard` (`style.scss`, `dashboard-form.scss`).

### Dashboard infrastructure

Инфраструктурные модули отвечают за **повторяющееся поведение**, общее для нескольких domain-компонентов:

- accessibility;
- keyboard;
- portal;
- positioning.

Они **не содержат доменной логики** — только UI-механику.

| Модуль                                        | Расположение                                             | Назначение                                                                         |
| --------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `DashboardExpandableRowTrigger`               | `@shared/ui/dashboard`                                   | Кликабельная обёртка expandable row: `role="button"`, `aria-expanded`, Enter/Space |
| `useDashboardAccessMenu`                      | `src/pages/UserDashboard/lib/useDashboardAccessMenu.tsx` | Хук access-меню: open/close, portal, позиционирование, click-outside, Escape       |
| `resolveDashboardAccessMenuPortalFromElement` | ↑                                                        | Выбор portal root (dialog / `.user-dashboard` / `document.body`)                   |
| `computeDashboardAccessMenuPosition`          | ↑                                                        | Расчёт координат меню относительно trigger                                         |
| `getDashboardAccessMenuStyle`                 | ↑                                                        | Inline-стили для fixed-меню                                                        |

> **Примечание:** `useDashboardAccessMenu` пока живёт рядом с User Dashboard, потому что portal-логика завязана на структуру dialog-оболочки. Это infrastructure-слой, а не domain. При повторном использовании вне Dashboard его можно перенести в `@shared/ui/dashboard`.

### Domain components

Domain-компоненты **используют** Dashboard UI Kit, но **не входят** в него. Они содержат бизнес-логику, API-вызовы, domain-state и специфичную разметку экранов.

Примеры:

| Компонент              | Вкладка / область             |
| ---------------------- | ----------------------------- |
| `AlbumsTabContent`     | Albums                        |
| `PostsTabContent`      | Posts                         |
| `MixerAdmin`           | Mixer                         |
| `AlbumAccessControl`   | Albums — visibility menu      |
| `ArticleAccessControl` | Posts — visibility menu       |
| `StemAccessControl`    | Mixer — stems visibility menu |
| `SettingsPageContent`  | Settings                      |
| `MyArchiveContent`     | Your Collection               |
| `PaymentSettings`      | Payment Settings              |
| `MyPurchasesContent`   | My Purchases                  |
| `SocialLinksContent`   | Social Links                  |

Заголовок активной вкладки рендерится **один раз** в шапке `UserDashboard` (`user-dashboard__title`). Domain-компоненты не дублируют название вкладки через `DashboardSection title`.

---

## 3. Принципы

1. **Dashboard UI Kit отвечает только за presentation.**  
   Никаких fetch, Redux, domain-validations, routing.

2. **Не менять информационную архитектуру экранов через kit.**  
   Kit не решает, какие вкладки, секции и сценарии есть в Dashboard — только как они выглядят и ведут себя на UI-уровне.

3. **Не переносить domain-логику в `shared`.**  
   Если компонент знает про `AlbumData`, `StemMeta`, payment provider — он domain, не kit.

4. **Не создавать новые компоненты без реального повторения.**  
   Одноразовая разметка остаётся в domain-компоненте.

5. **Composition over customization.**  
   Предпочитать комбинацию существующих примитивов (`DashboardCard` + `DashboardRow` + `DashboardAction`) вместо нового wrapper-компонента.

6. **Infrastructure — только для cross-cutting UI-поведения.**  
   Portal, keyboard, a11y, positioning — да. «Как сохранить альбом» — нет.

---

## 4. Правило добавления нового компонента

Перед созданием нового Dashboard-компонента ответьте на вопросы:

| #   | Вопрос                                                                     |
| --- | -------------------------------------------------------------------------- |
| 1   | Используется ли паттерн **минимум в трёх местах**?                         |
| 2   | Это **presentation** или **domain**?                                       |
| 3   | Можно ли решить задачу **существующими** примитивами kit?                  |
| 4   | Не **усложнит** ли новый компонент API (лишние props, варианты, coupling)? |

**Если хотя бы один ответ неоднозначен — новый компонент не создавать.**

Типичный путь:

1. Реализовать паттерн inline в domain-компоненте.
2. Дождаться третьего повторения.
3. Выделить presentation-часть в `@shared/ui/dashboard`.
4. Domain-компоненты мигрировать на новый примитив без изменения UX.

---

## 5. Что входит в Dashboard UI Kit

### Экспорт `@shared/ui/dashboard`

```
DashboardSection
DashboardCard
DashboardRow
DashboardRowValue
DashboardRowValueWrap
DashboardRowInlineError
DashboardAction
DashboardIconButton
DashboardCta
DashboardExpandableRowTrigger
DashboardEmptyState
```

### Стили

| Файл                  | Содержимое                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `style.scss`          | Примитивы: section, card, row, action, icon-button, cta, empty-state, expandable-row-trigger |
| `dashboard-form.scss` | Form-классы для Settings и других форм дашборда                                              |

### Тесты

Каждый примитив и `DashboardExpandableRowTrigger` покрыт unit-тестами в `__tests__/`.

### Где используется kit (после миграции)

- **Albums** — `AlbumsTabContent`, `AlbumsEmptyState`, `SortableTrackItem`
- **Posts** — `PostsTabContent`, `ArticlesEmptyState`, `ArticlesListSkeleton`
- **Mixer** — `MixerAdmin`, `MixerEmptyState`, `SortableStemRow`
- **Your Collection** — `MyArchiveContent`, `CollectionEmptyState`
- **Settings** — `SettingsPageContent`
- **Payment Settings** — `PaymentSettings`
- **My Purchases** — `MyPurchasesContent`, `MyPurchasesEmptyState`
- **Social Links** — `SocialLinksContent`
- **Skeletons** — `DashboardTabContentSkeleton`

---

## 6. Что сознательно НЕ входит в Dashboard UI Kit

Следующие вещи — **domain-компоненты и domain-логика**. Они могут использовать kit, но не являются его частью:

| Область                | Примеры                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Album editor           | `EditAlbumModal`, publish flow, track upload                                                                                               |
| Article editor         | `ArticleEditor`, draft/publish lifecycle                                                                                                   |
| Mixer logic            | `loadStems`, `uploadStemAudio`, stem reorder, `AddStemModal`                                                                               |
| Cover upload           | Cover crop, album artwork pipeline                                                                                                         |
| Avatar upload          | Profile avatar in Settings                                                                                                                 |
| Track row              | `SortableTrackItem` — domain row с dnd-kit, visibility, delete                                                                             |
| Stem row               | `SortableStemRow` — domain row с playback, replace, rename                                                                                 |
| Collection logic       | Slots, subscriptions, archive playback                                                                                                     |
| Payment provider logic | YooKassa connect, credentials, provider forms                                                                                              |
| Access control content | `AlbumAccessControl`, `ArticleAccessControl`, `StemAccessControl` — domain-меню; kit даёт только infrastructure (`useDashboardAccessMenu`) |
| Navigation shell       | `UserDashboard` sidebar, tabs, routing, modals                                                                                             |
| Row state flash        | `dashboardRowStateFlash` — domain-adjacent UX feedback                                                                                     |

**Правило:** если удалить domain-контекст и компонент теряет смысл — это не kit.

---

## 7. Принцип развития

1. **Сначала расширить существующее.**  
   Новый visual или infrastructure-паттерн — проверить, можно ли добавить variant/prop в `DashboardCard`, `DashboardRow`, `DashboardEmptyState` и т.д.

2. **Новый компонент — только при доказанном повторении.**  
   Минимум три независимых use case с одинаковой presentation- или infrastructure-задачей.

3. **Документировать изменения в этом README.**  
   Новый примитив или infrastructure-модуль — добавить в раздел 5 и при необходимости уточнить раздел 6.

4. **Не ломать обратную совместимость без миграции.**  
   Изменение API kit затрагивает все вкладки Dashboard — мигрировать все call site в одном PR.

5. **Domain остаётся domain.**  
   Kit растёт вширь (больше примитивов), а не вглубь (больше бизнес-логики).

---

## Быстрый чеклист для PR

- [ ] Используются примитивы из `@shared/ui/dashboard`, а не локальные копии стилей
- [ ] Нет дублирования заголовка вкладки в `DashboardSection`
- [ ] Domain-логика не попала в `src/shared/ui/dashboard`
- [ ] Новый shared-компонент оправдан правилом «3+ повторения»
- [ ] При добавлении в kit — обновлён этот README
