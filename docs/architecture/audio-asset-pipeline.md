# Audio Asset Pipeline

Документ фиксирует архитектурные инварианты обработки аудио после загрузки master-файла. Конфигурация pipeline: [`src/shared/lib/audio/audioAssetPipelineConfig.ts`](../../src/shared/lib/audio/audioAssetPipelineConfig.ts). Worker: [`services/audio-asset-worker/`](../../services/audio-asset-worker/). Схема БД: migration `064_add_track_audio_asset_pipeline.sql`.

---

## Две категории pipeline outputs (универсальная модель)

Pipeline outputs делятся на **playback-required** и **optional** — это не специальное исключение для waveform, а общий контракт для любых текущих и будущих stages.

| Категория    | Флаг в config                      | Влияет на `tracks.processing_status`                        | Примеры                                    |
| ------------ | ---------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| **Required** | `playbackRequired: true` (default) | Да — track `ready` только когда все required assets `ready` | `stream/opus/128k`                         |
| **Optional** | `playbackRequired: false`          | Нет — состояние только в `track_assets`                     | `waveform/json/default`, будущий `preview` |

**Правило для новых stages:** пометить каждый output в `PIPELINE_STAGES` флагом `playbackRequired`. Worker, finalize, regenerate и enqueue-failure автоматически применяют нужное поведение через:

- `getPlaybackRequiredOutputs()` / `isPlaybackRequiredAsset()`
- `isOptionalOnlyPipelineRun(stageIds)` / `isOptionalOnlyGenerator(generator)`
- `getStageIdsForGenerator(generator)` — regenerate по generator без hardcode под waveform

Optional-only job (любой generator, у которого все outputs optional):

- не сбрасывает `tracks.processing_status`, если track уже `ready`
- при enqueue failure помечает failed только rows целевого generator
- regenerate API **не** переводит assets в `pending` до получения worker lock

---

## Инвариант: playback vs optional derived assets

**Playback — основной продукт. Waveform, preview, loudness и другие визуализационные артефакты — optional derived assets.**

### `tracks.processing_status`

Отражает **только готовность playback-required derived assets** (сейчас: `stream/opus/128k`).

| Значение                 | Смысл                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `pending` / `processing` | Обязательный playback asset ещё не готов — воспроизведение через pipeline недоступно       |
| `ready`                  | Обязательный playback asset готов — **трек доступен для воспроизведения**                  |
| `failed`                 | Обязательный playback asset не удалось создать — воспроизведение через pipeline недоступно |

`tracks.processing_error` описывает последнюю ошибку **playback-required** pipeline (или enqueue required job).

### `track_assets`

Состояние **каждого** derived output хранится **отдельно** в `track_assets`:

- `type`, `format`, `variant` — идентификатор output (см. pipeline config)
- `status` — `pending` | `processing` | `ready` | `failed`
- `path` — путь в storage после успешной генерации
- `error` — ошибка конкретного asset

Optional assets **не влияют** на `tracks.processing_status` и **не блокируют** воспроизведение при `failed` или `pending`.

### Правила для разработчиков

1. **Не трактовать** `processing_status === 'ready'` как «все derived assets готовы».
2. **Не включать** optional assets в finalize/gate логику track-level status.
3. **Для playback** — gate через `tracks.processing_status` + resolver `purpose: 'playback'` + ready stream row в `track_assets`.
4. **Для optional артефактов** — читать `track_assets` (`status`, `path`); resolver по `purpose`.
5. **Regenerate optional asset** не должен сбрасывать `tracks.processing_status` и не должен переводить required assets в `pending`, если playback уже `ready`.

---

## Enqueue vs lock: no pre-reset pending

**Regenerate API и bulk scripts только enqueue job — без `UPDATE … status = 'pending'` до worker.**

Переход asset → `processing` происходит в worker **после** `pg_try_advisory_lock`, в `markAssetProcessing` на старте stage.

Если lock занят другим job:

- DB-состояние **не меняется** (нет вечного `pending` после skipped)
- `processTrackJobWithRetry` повторяет попытку с backoff (до 6 раз, базовая задержка 3s)
- При исчерпании retry — always-on structured log `audio_asset_job_lock_retries_exhausted` через `logOperationalEvent()` (не зависит от `AUDIO_PIPELINE_TRACE`); поля: `trackId`, `trackDbId`, `stages`, `generators`, `attempts`, `reason`, `timestamp`. Использовать для production alerts.

Initial upload по-прежнему seed'ит rows как `pending` через `upload-tracks` — это начальное состояние до первого job, не regenerate path.

---

## Связанные компоненты

| Компонент                 | Роль                                                    |
| ------------------------- | ------------------------------------------------------- |
| `upload-tracks`           | Seed `track_assets` rows, enqueue worker                |
| `audio-asset-worker`      | Lock → stages → finalize; retry on skipped lock         |
| `assetResolver`           | Выбор path по `purpose` (playback / waveform / preview) |
| `regenerate-track-assets` | Enqueue only (full или `generator`)                     |
| `regenerate-stale-assets` | Bulk enqueue stale rows by generator                    |

---

## Production flow: upload → ready

Каждый новый трек проходит один путь — без миграционных веток и backfill.

```
Upload track (upload-tracks)
  ↓ seed track_assets (stream + waveform, status=pending)
  ↓ enqueue worker job
Worker (audio-asset-worker)
  ↓ generate-audio-streams → stream/opus/128k ready
  ↓ generate-waveform → waveform/json/default ready (optional)
  ↓ finalize: tracks.processing_status = ready (только по playback-required assets)
Ready
  ↓ API: AlbumDetails (src, waveformUrl, waveformStatus из track_assets)
  ↓ Client: StemEngine воспроизводит stream/stems; Waveform рисует peaks JSON
```

| Этап         | Что происходит                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Upload**   | `upload-tracks` сохраняет master, seed'ит все enabled pipeline outputs в `track_assets` как `pending`, ставит job в очередь |
| **Worker**   | Stages генерируют derived assets параллельно; optional failure не блокирует playback                                        |
| **Finalize** | Track `ready`, когда playback-required asset (`stream`) готов                                                               |
| **API**      | `album-details-mapper` резолвит `waveformUrl` / `waveformStatus` через `assetResolver` (`purpose: 'waveform'`)              |
| **Client**   | `Waveform` загружает только JSON peaks; аудио — только через `StemEngine`                                                   |

Waveform pending/failed: `waveformUrl: null` → skeleton в UI; воспроизведение не затрагивается.

---

## См. также

- [docs/architecture.md](../architecture.md) — обзор слоёв и album models
- [services/audio-asset-worker/README.md](../../services/audio-asset-worker/README.md) — локальный запуск worker
