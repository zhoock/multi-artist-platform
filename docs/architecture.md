## Архитектура проекта

Проект следует подходу Feature-Sliced Design (FSD). Ниже — актуальные слои, алиасы и расположение модулей. Используйте документ как справочник при реорганизации кода.

### Слои и алиасы

Используемые слои в `src/`:

- `app` — точка входа, провайдеры (Lang, Store), маршрутизация, layout-компоненты.
- `pages` — страницы и крупные сценарии (в т.ч. `UserDashboard` с подкомпонентами).
- `widgets` — крупные UI-композиции.
- `features` — пользовательские действия и интерактивная бизнес-логика.
- `entities` — доменные сущности, их store и UI-представление.
- `shared` — переиспользуемые UI-кит, хелперы, API-клиенты, конфиг.
- `config` — глобальные настройки и env.

Опциональные слои из классического FSD (`processes`, отдельный top-level `lib`) **не используются** — утилиты лежат в `shared/lib`, конфигурация в `config/`.

Для импорта используются алиасы:

- `@app/*` — приложение и провайдеры.
- `@pages/*` — страницы.
- `@widgets/*` — виджеты.
- `@features/*` — фичи.
- `@entities/*` — сущности.
- `@shared/*` — shared-слой.
- `@config` / `@config/*` — конфигурация.
- `@routes/*` — route loaders.
- `@components/*` — **legacy**: остался только `components/view/Universe3D` (см. ниже).
- `@models` — общие TypeScript-модели (`src/models.ts`).

Примеры часто используемых модулей:

- `@app/providers/StoreProvider` — Redux store.
- `@app/providers/lang` — контекст языка (`LangProvider`, `useLang`).
- `@shared/model/appStore` — `createReduxStore`, тип `AppStore`.
- `@shared/api/http` — fetch-клиент (`getJSON`).
- `@shared/api/albums` — альбомы (`useAlbumsData`, `getImageUrl`, `formatDate`).
- `@shared/ui/dashboard` — дизайн-система личного кабинета (формы, кнопки, модалки).
- `@shared/lib/dashboardModalBackground` — overlay-дашборд и auth поверх публичных страниц.

### Модули по слоям (актуально)

**Features (`src/features/`):**

| Алиас                           | Назначение                                                            |
| ------------------------------- | --------------------------------------------------------------------- |
| `@features/player`              | Аудиоплеer, Redux slice, karaoke timing                               |
| `@features/navigation`          | Навигационное меню                                                    |
| `@features/popupToggle`         | Глобальный popup (меню)                                               |
| `@features/paymentSettings`     | Настройки платежей в кабинете                                         |
| `@features/share`               | Шэринг альбома                                                        |
| `@features/auth`                | Страница авторизации (`ui/AuthPage`, формы)                           |
| `@features/artistArchive`       | Коллекция артистов, Premium refresh                                   |
| `@features/premiumSubscription` | Premium-подписка, checkout intent                                     |
| `@features/listenerWelcome`     | Welcome-модалка для слушателя                                         |
| `@features/universeSearch`      | Поиск артистов на Home (Universe)                                     |
| `@features/universe`            | Подготовка данных Universe и play-album (`lib/`, `model/`; без `ui/`) |

**Widgets (`src/widgets/`):**

| Алиас                  | Назначение                        |
| ---------------------- | --------------------------------- |
| `@widgets/header`      | Шапка, профильное меню            |
| `@widgets/footer`      | Подвал                            |
| `@widgets/hero`        | Hero-баннер на странице артиста   |
| `@widgets/notFound`    | Страница 404                      |
| `@widgets/albumTracks` | Список треков на странице альбома |

**Entities (`src/entities/`):**

| Алиас                | Назначение                                       |
| -------------------- | ------------------------------------------------ |
| `@entities/album`    | Альбомы: public catalog, details, dashboard CRUD |
| `@entities/article`  | Статьи                                           |
| `@entities/lyrics`   | Track lyrics API, slice, selectors               |
| `@entities/track`    | Типы и утилиты треков                            |
| `@entities/service`  | Кнопки стриминга / покупки                       |
| `@entities/stem`     | Stems для mixer                                  |
| `@entities/savedMix` | Сохранённые миксы                                |
| `@entities/help`     | Справочный центр (каталог + статьи)              |
| `@entities/user`     | Пользователь / профиль                           |

**Личный кабинет (`pages/UserDashboard/`):**

Dashboard — отдельная page-сборка, не вынесенная в `@widgets/dashboard*`. Основные редакторы:

| Компонент                         | Путь                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Список альбомов, mixer, posts     | `components/albums/`, `components/mixer/`, `components/articles/`                                          |
| Создание / редактирование альбома | `components/modals/album/EditAlbumModal` (+ steps 2–5)                                                     |
| Тексты и синхронизация            | `components/modals/lyrics/` (`AddLyricsModal`, `EditLyricsModal`, `SyncLyricsModal`, `PreviewLyricsModal`) |
| Статьи                            | `components/modals/article/EditArticleModalV2`                                                             |
| Настройки платежей                | `@features/paymentSettings`                                                                                |

**Modal overlays (auth, dashboard):**

Реализованы в `app/App.tsx` через dual `<Routes>` и `backgroundLocation` (`@shared/lib/dashboardModalBackground`). Отдельного виджета `@widgets/modalRoute` нет.

**Legacy pre-FSD:**

| Путь                                                    | Статус                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/components/view/Universe3D.ts`                     | Активно: 3D-сцена Home/Hero; импорт через `@components/view/Universe3D` |
| `src/hooks/`, `src/utils/`                              | Удалены; логика в `shared/` и `features/`                               |
| `@features/createAlbum`, `@widgets/modalRoute`, `Forms` | Удалены; создание альбома — только `EditAlbumModal`                     |

### Album domain models

Public и Owner — разные модели. Не смешивать.

```
Public                         Owner
──────                         ─────
CatalogAlbum                   AlbumEditable
      ↓                              ↓
AlbumDetails                   Dashboard (CRUD / fat /api/albums)
      ↓
PlayerAlbumMeta
      ↓
PlayerTrack
```

| Модель                            | Назначение                                   | Store / API          |
| --------------------------------- | -------------------------------------------- | -------------------- |
| `CatalogAlbum`                    | thin список на Home / All Albums / Mixer     | `artistAlbumCatalog` |
| `AlbumDetails`                    | mid-weight страница альбома (без lyrics)     | `albumDetails`       |
| `PlayerAlbumMeta` / `PlayerTrack` | плеер                                        | `player`             |
| `AlbumEditable`                   | editable Dashboard (tracks, lyrics, details) | `albums.dashboard`   |

Устаревшее имя `IAlbums` снято. Публичный runtime не читает `AlbumEditable`.

### Стили форм

Общие стили форм личного кабинета — **`@shared/ui/dashboard`** (`dashboard-form-*` mixins и классы). Устаревший `shared/lib/styles/formStyles.scss` удалён.

### Правила зависимостей

- Слой может импортировать только слои ниже по списку.
- `shared` не зависит от других слоёв проекта.
- `entities` — только `shared` (исключения из legacy-кода постепенно убираются).
- `features` — `entities`, `shared`.
- `widgets` — `features`, `entities`, `shared`.
- `pages` — `widgets`, `features`, `entities`, `shared`.
- `app` — все слои.
- Горизонтальные импорты между срезами одного уровня запрещены.

Глобальный store: `shared/model/appStore` + провайдеры `app/providers`.

### Внутренняя структура срезов

- `ui` — компоненты и стили.
- `model` — состояние, slice, selectors.
- `lib` — утилиты среза.
- `api` — запросы к серверу.

Не все подпапки обязательны.

### Dashboard Design System

→ [docs/architecture/dashboard-design-system.md](./architecture/dashboard-design-system.md)

Импорт: `@shared/ui/dashboard` · Исходники: `src/shared/ui/dashboard/`

### Toast System

→ [docs/architecture/toast-system.md](./architecture/toast-system.md)

Generic API: `toast.show()` (in-memory only) · Cross-navigation: `arm*()` helpers · Исходники (план): `src/shared/lib/toast/`

### Связанные документы

- История миграции с legacy `components/`: [docs/fsd-migration-plan.md](./fsd-migration-plan.md)
- Синхронизация текстов: [docs/architecture/lyrics-synchronization.md](./architecture/lyrics-synchronization.md)
- Audio Asset Pipeline (playback vs optional assets): [docs/architecture/audio-asset-pipeline.md](./architecture/audio-asset-pipeline.md)

Документ обновляйте при изменении структуры `src/`.
