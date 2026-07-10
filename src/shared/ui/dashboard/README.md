# Dashboard UI Kit

**Минимальный набор интерактивных примитивов (v1).**  
Полная спецификация: [`docs/architecture/dashboard-design-system.md`](../../../docs/architecture/dashboard-design-system.md)

**Импорт:** `@shared/ui/dashboard`

---

## Kit — один компонент, три варианта

| Вариант             | Когда                                              |
| ------------------- | -------------------------------------------------- |
| `variant="primary"` | Save, Publish, Next, confirm в диалогах            |
| `variant="outline"` | Cancel, Previous, Choose files, действия в строках |
| `variant="icon"`    | Иконка без текста (edit, delete, play)             |

Плюс CSS-класс `.dashboard-modal-footer` для футеров модалок.

**Удаление:** `destructive` + подтверждение с `variant="primary"`.  
`destructive` — только для delete / remove / disconnect / потери данных. Logout, Cancel, Download — обычный `outline`.

**Ссылки:** обычный `<a>` или `Link` — не Dashboard-компоненты.

---

## Быстрый старт

```tsx
import { DashboardButton } from '@shared/ui/dashboard';
```

**Футер модалки:**

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

**Cancel на Popup:**

```tsx
<PopupCloseButton className="dashboard-button dashboard-button--outline">Cancel</PopupCloseButton>
```

**Действие в строке:**

```tsx
<DashboardButton variant="outline" onClick={onEdit}>
  Change email
</DashboardButton>
```

**Компактное действие в списке:**

```tsx
<DashboardButton variant="icon" destructive aria-label="Delete" onClick={onDelete}>
  <TrashIcon />
</DashboardButton>
```

**Внешняя ссылка:**

```tsx
<a href="https://example.com" target="_blank" rel="noopener noreferrer">
  Go to settings →
</a>
```

Стили ссылок — в domain SCSS экрана, не в kit.

---

## Composition layer (не интерактивный kit)

```
DashboardCard, DashboardRow, DashboardSection, DashboardEmptyState, …
```

Формы: `dashboard-form-input`, `dashboard-form-textarea`, `dashboard-form-select`.

---

## Чеклист PR

- [ ] Только `DashboardButton` (`primary` \| `outline` \| `icon`)
- [ ] `.dashboard-modal-footer` вместо React footer
- [ ] Ссылки: `<a>` / `Link`, без Dashboard link-классов
- [ ] `destructive` только для delete / remove / disconnect (не Logout, Cancel, Download)
- [ ] Нет `DashboardAction`, `DashboardTextLink`, `.dashboard-action`, `.dashboard-text-link`
