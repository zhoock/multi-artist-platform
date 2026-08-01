## План миграции по слоям

Исторический чек-лист переноса из монолитного `src/components`. **Актуальная архитектура** — в [docs/architecture.md](./architecture.md).

### Текущая структура (после cleanup)

```
src/
├── app/                    # Router, layouts, providers
├── pages/                  # Home, Album, UserDashboard, StemsPlayground, …
├── widgets/                # header, footer, hero, notFound, albumTracks
├── features/               # player, auth, artistArchive, universe, universeSearch, …
├── entities/               # album, article, lyrics, track, stem, …
├── shared/                 # ui, lib, api, model
├── config/
├── components/view/        # legacy: Universe3D only
└── routes/loaders/
```

**Удалено (не восстанавливать как FSD-срезы):**

| Было                                                    | Замена                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `Forms`, `@features/createAlbum`                        | `EditAlbumModal` в `pages/UserDashboard`                           |
| `@widgets/modalRoute`                                   | dual `<Routes>` + `dashboardModalBackground` в `App.tsx`           |
| `@widgets/dashboardAlbums`, `@widgets/dashboardEditors` | никогда не создавались; логика в `pages/UserDashboard/components/` |
| `@features/editSyncLyrics`, `@features/editTrackText`   | модалки в `pages/UserDashboard/components/modals/lyrics/`          |
| `shared/lib/styles/formStyles`                          | `@shared/ui/dashboard` (`dashboard-form-*`)                        |
| `shared/ui/breadcrumb`                                  | удалён (не использовался)                                          |

---

### `src/components` (история)

| Бывшая директория   | Статус / итоговое расположение                                                                |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `AboutUs`           | ✅ `@pages/Home/ui/AboutSection`                                                              |
| `AlbumDetails`      | ✅ `@entities/album/ui/AlbumDetails`                                                          |
| `AlbumTracks`       | ✅ `@widgets/albumTracks` + `@entities/track`                                                 |
| `Articles`          | ✅ `@entities/article`                                                                        |
| `Footer`            | ✅ `@widgets/footer`                                                                          |
| `Forms`             | ✅ **удалено** → `EditAlbumModal`                                                             |
| `Hamburger`         | ✅ `@shared/ui/hamburger`                                                                     |
| `Header`            | ✅ `@widgets/header`                                                                          |
| `Hero`              | ✅ `@widgets/hero`                                                                            |
| `Navigation`        | ✅ `@features/navigation`                                                                     |
| `ServiceButtons`    | ✅ `@entities/service`                                                                        |
| `Share`             | ✅ `@features/share`                                                                          |
| `UseImageColor`     | ✅ `@shared/lib/hooks/useImageColor`                                                          |
| `Waveform`          | ✅ `@shared/ui/waveform`                                                                      |
| `Universe3D` (view) | ⏳ **остался** → `src/components/view/Universe3D.ts` (миграция в `@features/universe` — TODO) |

`components/index.ts` не создавался.

### `src/hooks` и `src/utils` (история)

| Было                    | Статус                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `hooks/data.ts`         | ✅ `@shared/api/albums`                                                                                    |
| `hooks/useLang.ts`      | ✅ `@shared/model/lang`, `@app/providers/lang`                                                             |
| `utils/ga.ts`           | ✅ `@shared/lib/analytics`                                                                                 |
| `utils/http.ts`         | ✅ `@shared/api/http`                                                                                      |
| `utils/language.ts`     | ✅ `@shared/lib/lang`                                                                                      |
| `utils/syncedLyrics.ts` | ✅ `@entities/lyrics/api/trackLyricsApi`, `@shared/lib/lyrics/`, `@features/player/lib/syncedLyricsTiming` |
| `utils/trackText.ts`    | ✅ `@entities/track/lib`                                                                                   |

### Провайдеры и store

| Элемент                   | Статус                                |
| ------------------------- | ------------------------------------- |
| `StoreProvider`           | ✅ `@app/providers/StoreProvider`     |
| `LangProvider`, `useLang` | ✅ `@app/providers/lang`              |
| `useAppDispatch`          | ✅ `@shared/lib/hooks/useAppDispatch` |
| `langStore`               | ✅ `@shared/model/lang`               |

### `src/pages/UserDashboard` (история → текущее)

| Былший элемент                                       | Статус / где сейчас                                 |
| ---------------------------------------------------- | --------------------------------------------------- |
| `PaymentSettings`                                    | ✅ `@features/paymentSettings`                      |
| `DashboardAlbumsRoot`, `DashboardAlbumsOverview`     | ✅ `pages/UserDashboard/components/albums/`         |
| `DashboardAlbumEditor`, `DashboardAlbum`             | ✅ `EditAlbumModal` + steps                         |
| `DashboardSyncEditor`, `DashboardSync`               | ✅ `SyncLyricsModal`, `PreviewLyricsModal`          |
| `DashboardTextEditor`, `DashboardText`               | ✅ `AddLyricsModal`, `EditLyricsModal`              |
| `DashboardAlbumBuilder`, `DashboardAlbumBuilderPage` | ✅ **удалено** → `EditAlbumModal` (create + edit)   |
| `dashboardModalWrappers`                             | ✅ стили рядом с модалками / `@shared/ui/dashboard` |
| `formStyles`                                         | ✅ **удалено** → `@shared/ui/dashboard`             |

**Структура `pages/UserDashboard/` сейчас:**

- `UserDashboard.tsx`, `UserDashboard.style.scss`, `styles/`
- `components/albums/` — список, empty states, track UI
- `components/mixer/` — stems mixer
- `components/modals/album/` — `EditAlbumModal`
- `components/modals/lyrics/` — lyrics / sync modals
- `components/modals/article/` — редактор статей
- `components/settings/`, `components/archive/`, …

### Дополнительные действия (оставшиеся)

- [ ] Перенести `Universe3D` из `components/view/` в `@features/universe/ui/`.
- [ ] Унифицировать импорты: barrel vs deep path в `@entities/album`, `@features/player`.
- [ ] Архивировать или удалить устаревшие backup-документы в корне репозитория.
