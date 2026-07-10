## Архитектура проекта

Проект следует подходу Feature-Sliced Design (FSD). Ниже определены слои, их предназначение и допустимые зависимости. Используйте документ как справочник при реорганизации кода.

### Слои и алиасы

- `app` — точка входа приложения, провайдеры (Lang, Store), маршрутизация, глобальные стили.
- `processes` — долгоживущие пользовательские сценарии (при необходимости).
- `pages` — страницы, композиция слоёв ниже.
- `widgets` — крупные UI-композиции, собирающие сущности/фичи.
- `features` — функциональные возможности пользователя, бизнес-действия.
- `entities` — доменные сущности и их отображение.
- `shared` — переиспользуемые примитивы: UI-кит, хелперы, конфиг, API.
- `config` — глобальные настройки, `env`, токены DI.
- `lib` — общие утилиты и функции, не зависящие от React.

Для импорта используются алиасы:

- `@app/providers/StoreProvider` — провайдер Redux с конфигурацией стора.
- `@app/providers/lang` — контекст языка (`LangProvider`, `useLang`).
- `@shared/model/appStore` — `createReduxStore`, тип `AppStore`.
- `@shared/model/appStore/types` — типы `RootState`, `AppDispatch`.
- `@shared/model/lang` — глобальный стор языка (`currentLang`, `setCurrentLang`).
- `@shared/api/http` — fetch-клиент (`getJSON`).
- `@shared/api/albums` — хуки и утилиты для работы с альбомами (`useAlbumsData`, `getImageUrl`, `formatDate`).
- `@shared/lib/analytics` — аналитика (`gaEvent`).
- `@shared/lib/lang` — утилиты языка (`getLang`, `setLang`).
- `@shared/lib/styles/formStyles` — общие стили для форм.

### Примеры модулей по слоям

**Features (бизнес-действия):**

- `@features/player` — аудиоплеер с управлением воспроизведением.
- `@features/navigation` — навигационное меню.
- `@features/popupToggle` — управление попапами.
- `@features/paymentSettings` — настройки платежей (UI + бизнес-логика).
- `@features/editSyncLyrics` — синхронизация текста с музыкой.
- `@features/editTrackText` — редактирование текста трека.
- `@features/createAlbum` — создание нового альбома.

**Widgets (UI-композиции):**

- `@widgets/header` — шапка сайта.
- `@widgets/footer` — подвал сайта.
- `@widgets/form` — форма обратной связи.
- `@widgets/hero` — главный баннер.
- `@widgets/notFound` — страница 404.
- `@widgets/dashboardAlbums` — список альбомов в личном кабинете.
- `@widgets/dashboardEditors` — обёртки редакторов для личного кабинета.

**Entities (доменные сущности):**

- `@entities/album` — альбомы (компоненты, селекторы, слайсы).
- `@entities/article` — статьи.
- `@entities/track` — треки (компоненты, утилиты для работы с текстом).
- `@entities/service` — сервисы (кнопки покупки/стриминга).

**Shared (переиспользуемые примитивы):**

- `@shared/ui/*` — UI-компоненты (loader, popup, error-message, hamburger и др.).
- `@shared/lib/hooks` — хуки (`useAppDispatch`, `useAppSelector`).

### Правила зависимостей

- Слой может импортировать только слои, расположенные ниже по списку.
- `shared` не зависит от других слоёв проекта.
- `entities` могут использовать только `shared`.
- `features` могут зависеть от `entities` и `shared`.
- `widgets` могут зависеть от `features`, `entities`, `shared`.
- `pages` могут зависеть от `widgets`, `features`, `entities`, `shared`.
- `app` может зависеть от всех слоёв.
- Горизонтальные связи (между срезами одного уровня) запрещены.

Глобальный стор и middleware хранятся в `shared/model/appStore`, подключаются через провайдеры `app/providers`. Благодаря этому хуки (`useAppDispatch`, `useAppSelector`) не тянут `app` в зависимостях — только `shared/model/appStore/types`.

### Внутренняя структура слоёв

Каждый срез организуйте с подпапками:

- `ui` — компоненты и стили.
- `model` — состояние, хранилища, бизнес-логика.
- `lib` — утилиты и функции, специфичные для среза.
- `config` — константы и настройки.
- `api` — запросы к серверу.

Не все подпапки обязательны, создавайте их по мере необходимости.

### Нейминг и импорты

- Используйте алиасы с `@/` (корень `src`) и алиасы слоёв (`@entities/*`, `@features/*`, и т.д.).
- Файлы-компоненты называютcя в PascalCase (`HomePage.tsx`, `AlbumsSection.tsx`).
- Глобальные функции/константы — в `shared/lib`, `shared/config`.

### Проверки

- Подключите ESLint-правила для контроля зависимостей (например, `eslint-plugin-boundaries`).
- После реорганизации запускайте тесты и линтер, чтобы отследить ошибки импорта.

### Dashboard Design System

Базовая дизайн-система личного кабинета (UI Kit v1): примитивы, шесть уровней интерактивных элементов, правила модалок и границы kit/domain.

→ [docs/architecture/dashboard-design-system.md](./architecture/dashboard-design-system.md)

Импорт: `@shared/ui/dashboard` · Исходники: `src/shared/ui/dashboard/`

### Процесс миграции

1. Инвентаризируйте текущий код (списки компонентов, утилит, хуков).
2. Создайте недостающие директории для каждого слоя.
3. Поэтапно переносите страницы и связанные модули, обновляя импорты.
4. Вынесите общую логику из `components`, `utils`, `hooks` в соответствующие слои.
5. Дополните документацию примерами и ссылками по мере развития.

Документ обновляйте по мере уточнения архитектурных договорённостей.
