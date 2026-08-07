# Локальная разработка

## Быстрый старт

> **Рекомендуется:**
>
> - `npm run dev:docker` — Netlify Dev + воркер **в Docker** (ffmpeg как на проде, не нужен `brew install ffmpeg`)
> - `npm run dev:all` — Netlify Dev + воркер **на хосте** (нужны `ffmpeg`/`ffprobe` в PATH)
>
> Только фронт без API: `npm start` (8080). Только Netlify без воркера: `npm run dev`.

1. **Установите зависимости:**

   ```bash
   npm install
   ```

   Для `dev:all` (воркер на хосте, без Docker):

   ```bash
   npm install --prefix services/audio-asset-worker
   brew install ffmpeg   # macOS — только для dev:all / dev:worker
   ```

   Для `dev:docker` нужен [Docker Desktop](https://www.docker.com/products/docker-desktop/) (или Docker Engine + Compose).

2. **Настройте переменные окружения:**

   **Вариант 1 (рекомендуется): Загрузить из Netlify**

   ```bash
   source scripts/load-netlify-env.sh
   ```

   **Вариант 2: Создать локальный `.env` файл**

   ```bash
   cp .env.example .env
   # Отредактируйте .env и заполните переменные вручную
   ```

   Для обработки аудио после загрузки треков добавьте в `.env`:

   ```bash
   ASSET_WORKER_URL=http://localhost:8090
   ASSET_WORKER_WEBHOOK_SECRET=dev-secret-change-me
   ```

3. **Запустите локальный сервер:**

   ```bash
   npm run dev:docker
   ```

   Откройте в браузере: `http://localhost:8888`

## Команды

| Команда                     | Назначение                                                               |
| --------------------------- | ------------------------------------------------------------------------ |
| `npm run dev:docker`        | **Рекомендуется:** Netlify Dev + Audio Asset Worker в Docker (prod-like) |
| `npm run dev:all`           | Netlify Dev + воркер на хосте (нужен локальный ffmpeg)                   |
| `npm run dev`               | Только Netlify Dev (с предупреждением, если воркер недоступен)           |
| `npm run dev:docker:worker` | Только воркер в Docker                                                   |
| `npm run dev:worker`        | Только воркер на хосте                                                   |
| `npm run dev:docker:down`   | Остановить Docker-контейнер воркера                                      |
| `npm run dev:netlify`       | Только Netlify Dev, без проверки воркера                                 |
| `npm run dev:scheduler`     | Только sidecar автопродления (обычно не нужен отдельно)                  |
| `npm start`                 | Только webpack dev server (без Netlify Functions)                        |
| `npm run build`             | Production-сборка                                                        |

## Структура

- **Webpack Dev Server** — порт **8080**
- **Netlify Dev** — прокси на **8888**
- **Audio Asset Worker** — порт **8090** (FFmpeg, Opus в `derived/`)
- **Netlify Functions** — `http://localhost:8888/.netlify/functions/*`
- **Local renewal scheduler sidecar (PR-10.4)** — вместе с `npm run dev`, `dev:all`, `dev:docker`; см. § «Автопродление локально»

При `npm run dev` (без `:all`) в терминале появится предупреждение, если `ASSET_WORKER_URL` задан, но воркер не отвечает на `/health`:

```
⚠️  Audio Asset Worker is not running.
   Start it with:
     npm run dev:worker
   or run everything together:
     npm run dev:all
     npm run dev:docker
```

## Переменные окружения

Обязательные переменные:

- `DATABASE_URL` - строка подключения к PostgreSQL (Supabase)
- `JWT_SECRET` - **обязательный** секретный ключ для JWT токенов. Длинная случайная строка (≥ 32 символов), например `openssl rand -base64 48`. Если переменная не задана, Netlify-функции бросят `Error: JWT_SECRET is required` — fallback-значения нет.
- `JWT_EXPIRES_IN` - время жизни JWT токена (например, "7d", по умолчанию `7d`)
- `ENCRYPTION_KEY` - **обязательный** мастер-ключ AES-256-GCM. Используется для шифрования секретов продавцов YooKassa в БД (`user_payment_settings.secret_key_encrypted`). Длинная случайная строка, рекомендация — `openssl rand -base64 48`. Если переменная не задана, любая функция, работающая с зашифрованными данными, бросит `Error: ENCRYPTION_KEY is required` — fallback-значения нет. ⚠️ После смены ключа уже зашифрованные значения нечитаемы.

Опциональные:

- `NETLIFY_SITE_URL` - URL продакшн сайта (для проксирования API вместо локальных функций)
- `DEV_PAYMENT_MODE=true` — локальный checkout альбомов и подписок без YooKassa (см. `docs/dev-payment-mode.md`)
- `ASSET_WORKER_URL` + `ASSET_WORKER_WEBHOOK_SECRET` — обработка аудио после загрузки трека. Без них загрузка проходит, но статус «Обработка не запущена».

## Автопродление локально (PR-10.4)

Netlify Scheduled Functions **не** запускаются под `netlify dev`. Для локального теста автопродления sidecar (`scripts/dev-subscription-scheduler-tick.ts`) автоматически стартует вместе с `npm run dev`, `dev:all` и `dev:docker`.

**Как это работает**

1. Sidecar раз в `LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS` (по умолчанию **60 с**) отправляет `POST` на `/.netlify/functions/scheduled-subscription-renewals` с телом `{ "next_run": "<ISO-8601>" }` — тот же формат, что у Netlify cron.
2. Выполняется **production handler** → `runRenewalCycle()` → существующий renewal engine. Отдельной dev-логики продления нет.
3. В dev/test период поддержки — **1 час** (`DEV_SUPPORT_PERIOD_HOURS` в `subscription-billing.ts` при `NETLIFY_DEV=true`). После истечения `next_charge_at` продление срабатывает в течение ~1 минуты без ручных команд.

**Обязательно для auto-renew локально**

```bash
SUBSCRIPTION_AUTO_RENEW_ENABLED=true
```

Рекомендуется также `DEV_PAYMENT_MODE=true` (уже задано в `netlify.toml` для `[context.dev]`).

**Опционально**

| Переменная                            | По умолчанию              | Назначение                                       |
| ------------------------------------- | ------------------------- | ------------------------------------------------ |
| `LOCAL_RENEWAL_SCHEDULER`             | включён при условиях выше | `false` — отключить sidecar                      |
| `LOCAL_RENEWAL_SCHEDULER_INTERVAL_MS` | `60000`                   | Интервал опроса (мс)                             |
| `LOCAL_NETLIFY_PORT`                  | `8888`                    | Порт Netlify Dev (`netlify.toml` → `[dev].port`) |

**Отключить sidecar**

```bash
LOCAL_RENEWAL_SCHEDULER=false
```

**Production**

На production расписание задаёт только Netlify Scheduled Functions (`*/15 * * * *` в `netlify.toml`). Sidecar не деплоится и не используется.

**Dunning / grace (ADR-007)**

Sidecar ускоряет только **period-end renewal**. Retry-интервалы dunning (+24h / +72h / +168h) не сжимаются — для них используйте E2E-тесты или ручное смещение `next_charge_at` в БД.

**Регрессионные скрипты**

Проверка полной цепочки autorenew (backend + UI): [`docs/autorenew-verification.md`](./autorenew-verification.md) — `npm run verify:autorenew`, `seed:autorenew-ui`, `capture:autorenew-ui`.

## Обработка аудио

После загрузки WAV Netlify ставит задачу во внешний воркер (FFmpeg).

**Prod-like локально (Docker, ffmpeg внутри образа):**

```bash
npm run dev:docker
```

**Быстрее для отладки кода воркера (ffmpeg на хосте):**

```bash
brew install ffmpeg   # один раз
npm run dev:all
```

Проверка: `curl http://localhost:8090/health` → `{"ok":true,"ffmpeg":true,"ffprobe":true}`.

На уже загруженном треке с ошибкой нажмите **«Повторить»** — перезаливать файл не нужно.

## Проблемы и решения

### Админка не открывается локально

**Проблема:** После запуска `netlify dev` админка (`/dashboard/*`) не открывается или показывает ошибки.

**Решение:**

1. Убедитесь, что переменные окружения загружены:

   ```bash
   echo $DATABASE_URL
   echo $JWT_SECRET
   ```

2. Проверьте, что Netlify CLI установлен и авторизован:

   ```bash
   netlify --version
   netlify status
   ```

3. Если проект не связан с Netlify:

   ```bash
   netlify link
   ```

4. Перезапустите dev сервер:
   ```bash
   npm run dev:all
   ```

### Нет папки `derived/` после загрузки трека

**Проблема:** WAV загружается, но Opus не появляется.

**Решение:**

1. Используйте `npm run dev:docker` (ffmpeg в Docker) или `npm run dev:all` с `brew install ffmpeg`.
2. Проверьте `ASSET_WORKER_URL` и `ASSET_WORKER_WEBHOOK_SECRET` в `.env`.
3. Убедитесь, что `ffmpeg` установлен: `ffmpeg -version`.
4. Нажмите **«Повторить»** на треке со статусом «Обработка не запущена».

### API запросы возвращают ошибки

**Проблема:** API запросы к `/api/*` возвращают 404 или ошибки.

**Решение:**

1. Убедитесь, что `netlify dev` запущен (не просто `npm start`)
2. Проверьте, что переменные окружения загружены (особенно `DATABASE_URL`)
3. Проверьте логи в терминале, где запущен `npm run dev:all`

### Ошибка "DATABASE_URL is not set!"

**Проблема:** Netlify функции выдают ошибку о отсутствии `DATABASE_URL`.

**Решение:**

1. Загрузите переменные окружения:

   ```bash
   source scripts/load-netlify-env.sh
   ```

2. Или создайте `.env` файл с переменными

3. Убедитесь, что `.env` файл находится в корне проекта

4. Перезапустите `npm run dev:all`

## Разработка без Netlify Dev

Если вы хотите запустить только фронтенд без Netlify функций:

```bash
NETLIFY_SITE_URL=https://smolyanoechuchelko.ru npm start
```

Это запустит webpack dev server, который будет проксировать API запросы на продакшн сайт.

## Проверка работы

1. Откройте `http://localhost:8888`
2. Перейдите на `/auth` и залогиньтесь
3. Перейдите на `/dashboard/albums` - должна открыться админка
4. Проверьте, что альбомы загружаются
