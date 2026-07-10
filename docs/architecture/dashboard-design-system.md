# Dashboard Design System

**Статус:** базовая (v1) дизайн-система User Dashboard — минимальный набор примитивов по образцу Cursor Dashboard.

**Импорт UI Kit:** `@shared/ui/dashboard`

**Исходники:** `src/shared/ui/dashboard/`

---

## Минимальный состав Kit

Интерактивный примитив — **один компонент**, три визуальных варианта:

| Вариант             | Назначение                                             |
| ------------------- | ------------------------------------------------------ |
| `variant="primary"` | Save, Publish, Next, Connect, подтверждение в диалогах |
| `variant="outline"` | Cancel, Previous, Choose files, вторичные действия     |
| `variant="icon"`    | Иконка без текста: edit, delete, play, drag            |

```tsx
<DashboardButton variant="primary" loading={isSaving} onClick={onSave}>Save</DashboardButton>
<DashboardButton variant="outline" onClick={onCancel}>Cancel</DashboardButton>
<DashboardButton variant="icon" destructive aria-label="Delete" onClick={onDelete}>…</DashboardButton>
```

**Не React-компоненты kit**, но часть системы:

| Элемент                   | Назначение                                                    |
| ------------------------- | ------------------------------------------------------------- |
| `.dashboard-modal-footer` | CSS-класс футера модалки (flex-end, gap, border-top, padding) |
| `dashboard-form-*`        | CSS-классы полей форм                                         |
| `DashboardSaveSpinner`    | Spinner user-action (`@shared/ui/dashboard-save`)             |
| `PopupCloseButton`        | Закрытие `dialog` (`@shared/ui/popup`)                        |

### Layout (в кодовой базе, не интерактивный kit)

`DashboardCard`, `DashboardRow`, `DashboardEmptyState` и др. — composition layer для экранов. Новые интерактивные варианты кнопок **не добавляются** вне `primary | outline | icon`.

### Навигационные ссылки

Обычные ссылки — стандартный HTML `<a>` или `Link` из react-router. **Не** Dashboard-компоненты и **не** Dashboard CSS-классы. Стили — в domain SCSS конкретного экрана.

---

## Правила использования

### Primary

```tsx
<DashboardButton variant="primary" loading={isSaving} onClick={onSave}>
  Save
</DashboardButton>
```

Submit вне `<form>`: `type="submit" form="form-id"`.

### Outline

```tsx
<DashboardButton variant="outline" onClick={onCancel}>Cancel</DashboardButton>
<DashboardButton variant="outline" onClick={onPrevious}>Previous</DashboardButton>
```

Текстовые действия в `DashboardRow` (Change email, Disconnect, Log out) — тоже `variant="outline"`.

Cancel в модалке на `Popup`:

```tsx
<PopupCloseButton className="dashboard-button dashboard-button--outline">Cancel</PopupCloseButton>
```

### Icon

Компактные действия в списках и карточках (delete, edit):

```tsx
<DashboardButton variant="icon" destructive aria-label="Delete" onClick={onDelete}>
  <TrashIcon />
</DashboardButton>
```

### Футер модалки

Единственный канонический layout — CSS-класс `.dashboard-modal-footer`:

- `display: flex`
- `justify-content: flex-end`
- `gap` по токенам (`var(--ms-0)`)
- `border-top: 1px solid var(--dashboard-divider)`
- padding по умолчанию: `var(--ms-01)`

```tsx
<footer className="dashboard-modal-footer">
  <DashboardButton variant="outline" onClick={onCancel}>
    Cancel
  </DashboardButton>
  <DashboardButton variant="primary" loading={isSaving} onClick={onSave}>
    Save
  </DashboardButton>
</footer>
```

### Удаление данных

1. **`DashboardButton variant="icon" destructive`** с иконкой delete/trash;
2. **Подтверждение** через `ConfirmationModal` с **`DashboardButton variant="primary"`** как confirm.

### Запрещённые замены в новом коде

| Нельзя                                       | Вместо этого                        |
| -------------------------------------------- | ----------------------------------- |
| `@include dashboard-btn-primary`             | `DashboardButton variant="primary"` |
| `@include dashboard-btn-secondary` / `ghost` | `DashboardButton variant="outline"` |
| `DashboardAction`, `DashboardTextLink`       | `outline` / `icon` / `<a>`          |
| `.dashboard-action`, `.dashboard-text-link`  | Domain SCSS или стандартный `<a>`   |
| React-компонент футера                       | `.dashboard-modal-footer`           |

---

## Состояния загрузки

| Паттерн                                     | Когда                              |
| ------------------------------------------- | ---------------------------------- |
| **Skeleton**                                | Известна структура списка/карточек |
| `DashboardLoadingState`                     | Ожидание данных в модалке          |
| `DashboardButton variant="primary" loading` | User-action (Save, Publish)        |

---

## Принципы

1. Presentation only — kit без бизнес-логики.
2. Три визуальных варианта кнопки — не расширять без 3+ повторений и review.
3. Ссылки — `<a>` / `Link`, не kit.
4. Footer — CSS, не React.

---

## Чеклист PR

- [ ] Интерактив: только `DashboardButton` (`primary` \| `outline` \| `icon`)
- [ ] Футер: `.dashboard-modal-footer`
- [ ] Удаление: `variant="icon" destructive` + confirm `variant="primary"`
- [ ] Ссылки: `<a>` / `Link`, без Dashboard link-классов
- [ ] Нет `DashboardAction`, `DashboardTextLink`, `.dashboard-action`, `.dashboard-text-link`
- [ ] Domain-логика не в `shared/ui/dashboard`

---

## Ссылки

- README: `src/shared/ui/dashboard/README.md`
- Токены: `src/scss/themes/_dark.scss`
- Миксины (legacy): `src/scss/abstracts/_mixins.scss`
