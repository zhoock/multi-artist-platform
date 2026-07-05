# Dashboard Typography

Архитектурное руководство по типографике User Dashboard.

**Связанные документы:** [Dashboard UI Kit — README](./README.md)

**Импорт kit:** `@shared/ui/dashboard`

---

## 1. Назначение

User Dashboard — это **интерфейс управления**, а не маркетинговая страница. У него собственная типографическая система, независимая от глобальной типографики сайта (лендинг, публичные страницы, Oswald, modular scale и т.д.).

Dashboard typography решает задачи admin UI:

| Цель                                        | Что это значит на практике                                                |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| **Единая визуальная иерархия**              | Пользователь сразу понимает: вкладка → секция → контент → подсказка       |
| **Единый язык интерфейса**                  | Settings, Albums, Mixer и модалки читаются как один продукт               |
| **Отсутствие случайных размеров и весов**   | Нет «11px здесь, 13px там» — только роли из шкалы                         |
| **Независимость от глобальной типографики** | Marketing-стили не протекают внутрь `.user-dashboard` и dashboard-модалок |

Типографика Dashboard — **часть дизайн-системы kit**, наравне с `DashboardRow`, `DashboardCard` и form-классами. Domain-компоненты не изобретают локальные text-стили, а выбирают **роль текста** из этой шкалы.

---

## 2. Typography Scale

Шкала Dashboard намеренно компактная: **два body-размера (14px и 12px)** и **два heading-уровня (18px и 15px)**. Этого достаточно для admin UI без визуального шума.

| Роль           | Размер | Вес | Использование                          |
| -------------- | ------ | --- | -------------------------------------- |
| **H1**         | 18px   | 400 | Заголовок активной вкладки             |
| **H2**         | 15px   | 400 | Заголовок секции внутри вкладки        |
| **Body**       | 14px   | 400 | Основной текст, значения, inputs, nav  |
| **Form Label** | 14px   | 500 | Подпись поля ввода в форме             |
| **Row Label**  | 14px   | 400 | Название свойства в `DashboardRow`     |
| **Helper**     | 12px   | 400 | Подсказки, метаданные, вторичный текст |

### H1 — заголовок вкладки

- **Где:** `.user-dashboard__title` в шапке `UserDashboard`.
- **HTML:** `<h2>` — семантический корень вкладки (визуальная роль H1, 18px).
- **Правило:** рендерится **один раз** на вкладку. Domain-компоненты не дублируют название вкладки через `DashboardSection title` или локальные `<h1>`.
- **Семантика:** «где я сейчас» — Albums, Settings, Mixer и т.д.

### H2 — заголовок секции

- **Где:** `DashboardSection__title`, `.user-dashboard__lyrics-title`, `.user-dashboard__section-title` и аналоги.
- **HTML:** `<h3>` — секция внутри вкладки (визуальная роль H2, 15px). Локальные подсекции — `<h4>`.
- **Семантика:** «какой блок контента передо мной» — Profile, Payment, Lyrics, Stems.
- **Не путать с H1:** H2 всегда **меньше** H1 (15px vs 18px) и живёт **внутри** вкладки.

### Body — основной текст

- **Где:** значения в `DashboardRow`, текст в inputs/textareas, nav items, primary content в таблицах и карточках.
- **Шрифт:** UI system font (`--dashboard-font-family`), не Oswald.
- **Семантика:** то, что пользователь **читает и редактирует** как основной контент.

### Form Label — метка поля формы

- **Где:** label над `<input>`, `<textarea>`, `<select>` в модалках и формах (Edit Album, Add Stem, Delete Account и т.д.).
- **Mixin:** `dashboard-form-label`.
- **Семантика:** «как называется поле, которое я заполняю».
- **Визуально:** primary color, medium weight (500) — label **ведёт** к контролу.

### Row Label — название свойства

- **Где:** левая колонка `DashboardRow` (Settings, Social Links, Purchases, Collection).
- **Mixin / класс:** `dashboard-row-label` / `.dashboard-row__label`.
- **Семантика:** «как называется свойство в карточке настроек».
- **Визуально:** muted color (~62% white), regular weight (400) — label **не конкурирует** со значением справа.

> **Form Label и Row Label — оба 14px, но разные роли.**  
> Один и тот же размер не означает одну роль: form label ведёт к input, row label именует строку в таблице свойств.

### Helper — вторичный текст

- **Где:** hints под полями, empty state descriptions, publish hints, file size limits, meta lines, table column headers (uppercase), status hints.
- **Mixin:** `dashboard-helper-text`.
- **Семантика:** пояснение, метаданные, контекст — **не** основной контент.
- **Цвет:** `--dashboard-text-secondary` (или переопределение для error/success).

---

## 3. Semantic Heading Hierarchy

**Типографическая роль (H1 / H2 / …) и HTML-тег (`h1`–`h6`) — разные системы.**

|                    | Typography role                        | HTML element                           |
| ------------------ | -------------------------------------- | -------------------------------------- |
| **Что описывает**  | Визуальный уровень (размер, вес, цвет) | Структура документа для screen readers |
| **Задаётся через** | CSS mixins / tokens                    | Выбор тега в JSX                       |
| **Совпадение**     | Желательно, но **не обязательно**      | Может не совпадать с названием роли    |

Пример: визуальная роль **H1** (18px) на вкладке Settings реализована как `<h2 class="user-dashboard__title">`. Внешний вид задаёт `dashboard-h1-title`, а не номер тега.

### Базовая структура вкладки

```
h2  Settings                         ← tab title (typography H1)

    h3  General                      ← DashboardSection (typography H2)
    h3  Profile
    h3  Header Images
    h3  Account
    h3  Security
```

```
h2  Albums

    h3  Lyrics                       ← domain section (typography H2)
```

```
h2  Mixer

    h3  Tracks                       ← visually hidden, если нет видимого заголовка
        h4  Stems                    ← nested subsection (typography H2)
```

```
h2  My Purchases

    h3  Artist — Album               ← purchase group title
```

### Правила HTML-иерархии

1. **Не пропускать уровни** без причины (`h2` → `h4` недопустимо, если между ними нет `h3`).
2. **Глубже `h4`** — только при реальной вложенности (Stems внутри Tracks, блоки внутри статьи).
3. **Не каждый текст — heading.** Card empty state (`DashboardEmptyState variant="card"`) использует `<p>`, не `<h3>`.
4. **Модалки:** заголовок dialog — `<h2>` + `dashboard-modal-title` (18px). Подсекции внутри modal — `<h3>`, `<h4>` (например, impact block в Delete Account).
5. **Смена тега не меняет вид.** Стили привязаны к классам и mixins, не к `h1`–`h6`.

### Соответствие role → HTML (Dashboard)

| Typography role         | Typical HTML | Component / class                                            |
| ----------------------- | ------------ | ------------------------------------------------------------ |
| H1 (tab)                | `h2`         | `.user-dashboard__title`                                     |
| H2 (section)            | `h3`         | `.dashboard-section__title`, `.user-dashboard__lyrics-title` |
| H2 (subsection)         | `h4`         | `.mixer-admin__subsection-title`                             |
| Modal title (H1 visual) | `h2`         | `dashboard-modal-title`                                      |
| Tab empty state title   | `h3`         | `.dashboard-empty-state__title` (variant `tab`)              |
| Card empty state title  | `p`          | `.dashboard-empty-state__title` (variant `card`)             |

---

## 4. Dashboard Typography Isolation

Глобальные стили сайта (`_base.scss` и marketing typography) задают для `h1–h4`:

- декоративный accent font (Oswald);
- `text-transform: capitalize`;
- `letter-spacing: 1.618px`;
- responsive `adjust-font-size-to`;
- `text-wrap: balance`;
- marketing colors и веса.

**Dashboard от этого изолирован** через mixin `dashboard-isolate-heading` и scope-правила:

| Область                | Механизм                                                            |
| ---------------------- | ------------------------------------------------------------------- |
| `.user-dashboard`      | `h1–h6` → `dashboard-isolate-heading`                               |
| Dashboard modals       | `dashboard-modal-dialog-buttons` → isolation для всех `h1–h6`       |
| Modal / section titles | `dashboard-modal-title`, `dashboard-h1-title`, `dashboard-h2-title` |

`dashboard-isolate-heading` сбрасывает marketing-наследие:

- UI font + `font-weight: 400`;
- `letter-spacing: normal`;
- `text-transform: none`;
- `text-wrap: wrap`;
- `font-size: inherit` (явный размер задаётся классом роли: H1, H2, modal title).

**Правило:** внутри Dashboard не полагаться на глобальные heading-стили. Явный uppercase (например, `TRACK` в column header) — **локальное** решение, не глобальный marketing heading.

---

## 5. Text Roles

Каждый текст в Dashboard должен иметь **одну роль** из шкалы. Роль определяется **визуальной функцией**, а не местом в DOM (`<span>` vs `<p>` vs `<label>`).

| Роль           | Вопрос, на который отвечает      | Типичный контекст                    |
| -------------- | -------------------------------- | ------------------------------------ |
| **H1**         | На какой вкладке я?              | Шапка Dashboard                      |
| **H2**         | Как называется этот блок?        | Секция внутри вкладки                |
| **Body**       | Какое значение / основной текст? | Value в row, input text, track title |
| **Form Label** | Как называется поле ввода?       | Label над control в форме            |
| **Row Label**  | Как называется свойство?         | Левая колонка settings row           |
| **Helper**     | Что нужно знать дополнительно?   | Hint, meta, empty state copy         |

### Form Label vs Row Label

Это **самое частое место путаницы**. Оба — 14px, но контекст и вес разные:

|               | Form Label                          | Row Label                             |
| ------------- | ----------------------------------- | ------------------------------------- |
| **Layout**    | Вертикальная форма: label → control | Горизонтальная строка: label \| value |
| **Weight**    | 500                                 | 400                                   |
| **Color**     | Primary                             | Muted (~62% white)                    |
| **Компонент** | `<label htmlFor="…">` над input     | `DashboardRow` label column           |
| **Пример**    | «Album Title» над text field        | «Band Name» слева от «Aurora»         |

**Не заменять друг друга:** row label не ставится над input в форме; form label не используется в `DashboardRow` только потому, что «тоже label».

### Helper vs Body

| Helper                             | Body                               |
| ---------------------------------- | ---------------------------------- |
| Дополнительный контекст            | Основной контент                   |
| Можно пропустить и понять экран    | Без него теряется смысл            |
| 12px, secondary color              | 14px, primary color                |
| Empty state description, file hint | Row value, input value, track name |

---

## 6. Принципы

1. **Не создавать новые размеры без необходимости.**  
   Шкала закрыта: 18 / 15 / 14 / 12 px. Промежуточные 11px, 13px, `calc(14px × 0.85)` — не Dashboard typography.

2. **Использовать существующую шкалу и mixins.**  
   Предпочитать `dashboard-h1-title`, `dashboard-h2-title`, `dashboard-form-label`, `dashboard-row-label`, `dashboard-helper-text` вместо локальных `font-size`.

3. **Различать визуальную роль, а не место использования.**  
   «Это `<p>` в модалке» ≠ helper. Сначала определить роль (body vs helper), потом выбрать mixin.

4. **Helper — не для основного контента.**  
   Описания альбомов, значения полей, заголовки треков — body (14px). Helper — только пояснения и meta.

5. **H2 не использовать вместо H1.**  
   Название вкладки — только в шапке Dashboard. Секции внутри вкладки — H2.

6. **Не применять декоративную типографику сайта в Dashboard.**  
   Без Oswald, capitalize, marketing letter-spacing, responsive heading scale.

7. **Два label-типа — осознанно.**  
   Form label и row label не сливаются в один стиль: у них разная иерархическая функция при одинаковом размере.

8. **Typography role ≠ HTML tag.**  
   Выбирать mixin по визуальной роли, тег — по семантической вложенности документа.

9. **Headings — weight 400.**  
   Dashboard UI не использует semibold/bold в заголовках вкладок и секций. Акцент — через размер и placement, не через weight.

---

## 7. Примеры

### Settings — типичная иерархия (roles + HTML)

```
Settings                          ← typography H1, HTML h2

Profile                           ← typography H2, HTML h3 (DashboardSection)

Band Name          Aurora         ← Row Label | Body
Language           English        ← Row Label | Body
Update your photo in JPG or PNG   ← Helper (под avatar row)

Email                             ← Form Label  (в модалке смены email)
[________________________]

We sent a confirmation link       ← Helper
```

### Edit Album modal — форма

```
Edit Album                        ← Modal title (H1-level, 18px)

Album Title                       ← Form Label
[________________________]

Release Date                      ← Form Label
[____-__-__]

Cover image must be square,       ← Helper
min 1400×1400 px
```

### Albums tab — секция и meta

```
Albums                            ← H1

My Albums                         ← H2

#  Title              Duration    ← Helper (column headers, uppercase)
1  Opening Theme       3:42      ← Body
2  Second Track        4:15      ← Body

Add cover and at least one track  ← Helper (publish hint)
to publish
```

### Как роли и HTML сочетаются

```
h2  (typography H1 — tab)
└── h3  (typography H2 — section)
    ├── h4  (typography H2 — subsection, optional)
    ├── Row Label + Body
    ├── Form Label + Body
    └── Helper
```

Helper почти всегда **подчинён** body или label — не стоит на одном уровне с H2.

---

## 8. Техническая справка (реализация)

Документ описывает **архитектуру**, не дублирует SCSS. Для реализации смотреть:

| Что             | Где                                                                       |
| --------------- | ------------------------------------------------------------------------- |
| CSS tokens      | `src/scss/abstracts/_typography.scss`                                     |
| Mixins          | `src/scss/abstracts/_mixins.scss`                                         |
| Kit styles      | `src/shared/ui/dashboard/style.scss`                                      |
| Dashboard shell | `src/pages/UserDashboard/UserDashboard.style.scss`, `styles/_layout.scss` |

Ключевые mixins:

- `dashboard-ui-font-family` — UI font, weight 400
- `dashboard-isolate-heading` — сброс marketing headings
- `dashboard-h1-title` — 18px tab title
- `dashboard-h2-title` — 15px section title
- `dashboard-form-label` — form field label
- `dashboard-row-label` — settings row label
- `dashboard-helper-text` — 12px secondary copy

---

## 9. Принцип развития

1. **Сначала использовать существующую типографическую шкалу.**  
   Новый экран, модалка или hint — проверить, покрывает ли одна из шести ролей сценарий.

2. **Новый текстовый стиль — только при объективной нехватке.**  
   Если ни H1, ни H2, ни Body, ни Form/Row Label, ни Helper не подходят — это сигнал к обсуждению, а не к локальному `font-size: 13px`.

3. **Любая новая роль документируется здесь.**  
   Добавление уровня в шкалу (новый размер, weight, mixin) требует обновления `TYPOGRAPHY.md` в том же PR.

4. **Не расширять шкалу «на всякий случай».**  
   Admin UI выигрывает от сдержанности. Лучше переиспользовать helper, чем вводить seventh text role.

5. **Изменения typography — cross-cutting.**  
   Правка токена или mixin затрагивает все вкладки Dashboard; миграция и визуальная проверка обязательны.

6. **Новый HTML heading level документируется здесь.**  
   Изменение тега без изменения typography — обновить раздел 3 в том же PR.

---

## Быстрый чеклист для PR

- [ ] HTML heading levels последовательны (нет h2 → h4 без h3)
- [ ] Typography role и HTML tag не перепутаны намеренно
- [ ] Текст использует роль из шкалы, а не произвольный `font-size`
- [ ] Helper (12px) не используется для primary content
- [ ] Form label и row label не перепутаны
- [ ] H1 вкладки не дублируется в domain-комponent
- [ ] H2 не заменяет H1
- [ ] Новые heading-стили проходят через `dashboard-isolate-heading`
- [ ] При добавлении новой typography-роли обновлён `TYPOGRAPHY.md`
