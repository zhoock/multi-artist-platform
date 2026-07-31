## План миграции по слоям

Документ фиксирует текущие модули и предлагаемое место в структуре FSD. Используйте как чек-лист: после переноса отмечайте элементы и корректируйте назначения при необходимости.

### `src/components`

| Текущая директория | Назначение сейчас               | Статус / итоговое расположение                                |
| ------------------ | ------------------------------- | ------------------------------------------------------------- |
| `AboutUs`          | Статический блок «О нас», стили | ✅ перенесено → `@pages/Home/ui/AboutSection`                 |
| `AlbumDetails`     | Компоненты карточки альбома     | ✅ перенесено → `@entities/album/ui/AlbumDetails`             |
| `AlbumTracks`      | Список треков                   | ✅ перенесено → `@widgets/albumTracks` + `@entities/track/ui` |
| `Articles`         | Превью статей, враппер          | ✅ перенесено → `@entities/article`                           |
| `Footer`           | Глобальный подвал сайта         | ✅ перенесено → `@widgets/footer`                             |
| `Forms`            | Общая форма (legacy)            | ✅ удалено — заменено dashboard `EditAlbumModal`              |
| `Hamburger`        | Кнопка меню                     | ✅ перенесено → `@shared/ui/hamburger`                        |
| `Header`           | Шапка сайта                     | ✅ перенесено → `@widgets/header`                             |
| `Hero`             | Герой-блок                      | ✅ перенесено → `@widgets/hero`                               |
| `Navigation`       | Меню навигации                  | ✅ перенесено → `@features/navigation`                        |
| `ServiceButtons`   | Кнопки сервисов                 | ✅ перенесено → `@entities/service`                           |
| `Share`            | Шэринг                          | ✅ перенесено → `@features/share`                             |
| `UseImageColor`    | Хук/компонент получения цвета   | ✅ перенесено → `@shared/lib/hooks/useImageColor`             |
| `Waveform`         | Отображение волны аудио         | ✅ перенесено → `@shared/ui/waveform`                         |

После переноса `components/index.ts` следует удалить или превратить в реэкспорты новых слоёв.

### `src/hooks`

| Файл            | Назначение               | Рекомендованный слой                                                               |
| --------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| `data.ts`       | Загрузка данных шаблонов | ✅ перенесено в `shared/api/albums` (`useAlbumsData`, `getImageUrl`, `formatDate`) |
| `useLang.ts`    | Контекст языка           | ✅ перенесено в `shared/model/lang` (`useLang`, `index.ts`)                        |
| `__tests__/...` | Тесты хуков              | переименовать под соответствующие файлы после переноса                             |

### `src/utils`

| Файл              | Назначение                            | Рекомендованный слой                                     |
| ----------------- | ------------------------------------- | -------------------------------------------------------- |
| `ga.ts`           | Интеграция Google Analytics           | ✅ перенесено в `shared/lib/analytics` (`gaEvent`)       |
| `http.ts`         | HTTP-утилиты                          | ✅ перенесено в `shared/api/http` (`http`, `getJSON`)    |
| `language.ts`     | Помощники локализации                 | ✅ перенесено в `shared/lib/lang` (`getLang`, `setLang`) |
| `syncedLyrics.ts` | Работа с синхронизированными лириками | ✅ перенесено в `features/syncedLyrics/lib`              |
| `trackText.ts`    | Работа с текстами треков              | ✅ перенесено в `entities/track/lib`                     |

### Провайдеры и стор

| Элемент          | Назначение               | Статус / итоговое расположение                                 |
| ---------------- | ------------------------ | -------------------------------------------------------------- |
| `StoreProvider`  | Провайдер Redux стора    | ✅ `@app/providers/StoreProvider`                              |
| `LangProvider`   | Контекст языка + setters | ✅ `@app/providers/lang`                                       |
| `useAppDispatch` | Типизированный dispatch  | ✅ `@shared/lib/hooks/useAppDispatch` (тип из `StoreProvider`) |
| `useLang`        | Хук текущего языка       | ✅ `@app/providers/lang`                                       |
| `langStore.ts`   | Глобальный стор языка    | ✅ перенесено → `@shared/model/lang/store`                     |

### `src/pages/UserDashboard` (Личный кабинет)

| Элемент                     | Назначение                       | Статус / итоговое расположение                                        |
| --------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| `PaymentSettings`           | Настройки платежей (UI + логика) | ✅ перенесено → `@features/paymentSettings`                           |
| `DashboardAlbumsRoot`       | Список альбомов в кабинете       | ✅ перенесено → `@widgets/dashboardAlbums`                            |
| `DashboardAlbumsOverview`   | Компонент списка альбомов        | ✅ перенесено → `@widgets/dashboardAlbums/ui/DashboardAlbumsOverview` |
| `DashboardAlbumEditor`      | Редактор альбома (обёртка)       | ✅ перенесено → `@widgets/dashboardEditors/ui/DashboardAlbumEditor`   |
| `DashboardAlbum`            | Компонент редактирования альбома | ✅ перенесено → `@widgets/dashboardEditors/ui/DashboardAlbum`         |
| `DashboardSyncEditor`       | Редактор синхронизации (обёртка) | ✅ перенесено → `@widgets/dashboardEditors/ui/DashboardSyncEditor`    |
| `DashboardSync`             | Компонент синхронизации          | ✅ перенесено → `@features/editSyncLyrics` (фича)                     |
| `DashboardTextEditor`       | Редактор текста (обёртка)        | ✅ перенесено → `@widgets/dashboardEditors/ui/DashboardTextEditor`    |
| `DashboardText`             | Компонент редактирования текста  | ✅ перенесено → `@features/editTrackText` (фича)                      |
| `DashboardAlbumBuilder`     | Создание альбома (обёртка)       | ✅ удалено — заменено dashboard `EditAlbumModal`                      |
| `DashboardAlbumBuilderPage` | Компонент создания альбома       | ✅ удалено — заменено dashboard `EditAlbumModal`                      |
| `dashboardModalWrappers`    | Общие стили для редакторов       | ✅ перенесено → `@widgets/dashboardEditors/styles/`                   |
| `formStyles`                | Стили форм (общие)               | ✅ перенесено → `@shared/lib/styles/formStyles`                       |

**Структура после рефакторинга:**

- `pages/UserDashboard/` — содержит только основную страницу (`UserDashboard.tsx`, стили, `index.ts`)
- `features/paymentSettings/` — настройки платежей с бизнес-логикой (`ui/`, `model/`, `lib/`)
- `features/editSyncLyrics/` — синхронизация текста с музыкой → `pages/UserDashboard/components/modals/lyrics/SyncLyricsModal`
- `features/editTrackText/` — редактирование текста трека → lyrics-модалки в `pages/UserDashboard`
- `widgets/dashboardAlbums/` — список альбомов → `pages/UserDashboard/components/albums/`
- `widgets/dashboardEditors/` — обёртки редакторов → dashboard-модалки в `pages/UserDashboard/components/`

### Дополнительные действия

- Сверить `widgets` и `features` на предмет дублирования с компонентами.
- Настроить реэкспорты в каждой сущности (`index.ts`) после перемещения.
- Разделить стили: глобальные оставить в `shared/styles`, компонентные хранить рядом с компонентами.
- Обновлять документ при завершении каждого переноса.
