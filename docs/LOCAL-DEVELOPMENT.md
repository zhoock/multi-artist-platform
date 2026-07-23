# Локальная разработка

## Быстрый старт

1. **Установите зависимости:**

   ```bash
   npm install
   ```

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

3. **Запустите локальный сервер:**

   ```bash
   netlify dev
   ```

   Откройте в браузере: `http://localhost:8888`

## Структура

- **Webpack Dev Server** работает на порту **8080**
- **Netlify Dev** проксирует запросы на порту **8888**
- **Netlify Functions** обрабатывают API запросы на `http://localhost:8888/.netlify/functions/*`

## Переменные окружения

Обязательные переменные:

- `DATABASE_URL` - строка подключения к PostgreSQL (Supabase)
- `JWT_SECRET` - **обязательный** секретный ключ для JWT токенов. Длинная случайная строка (≥ 32 символов), например `openssl rand -base64 48`. Если переменная не задана, Netlify-функции бросят `Error: JWT_SECRET is required` — fallback-значения нет.
- `JWT_EXPIRES_IN` - время жизни JWT токена (например, "7d", по умолчанию `7d`)
- `ENCRYPTION_KEY` - **обязательный** мастер-ключ AES-256-GCM. Используется для шифрования секретов продавцов YooKassa в БД (`user_payment_settings.secret_key_encrypted`). Длинная случайная строка, рекомендация — `openssl rand -base64 48`. Если переменная не задана, любая функция, работающая с зашифрованными данными, бросит `Error: ENCRYPTION_KEY is required` — fallback-значения нет. ⚠️ После смены ключа уже зашифрованные значения нечитаемы.

Опциональные:

- `NETLIFY_SITE_URL` - URL продакшн сайта (для проксирования API вместо локальных функций)
- `DEV_PAYMENT_MODE=true` — локальный checkout альбомов и подписок без YooKassa (см. `docs/dev-payment-mode.md`)

## Команды

- `npm start` - запустить только webpack dev server (без Netlify функций)
- `netlify dev` - запустить полный dev сервер с Netlify функциями
- `npm run build` - собрать production версию

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
   netlify dev
   ```

### API запросы возвращают ошибки

**Проблема:** API запросы к `/api/*` возвращают 404 или ошибки.

**Решение:**

1. Убедитесь, что `netlify dev` запущен (не просто `npm start`)
2. Проверьте, что переменные окружения загружены (особенно `DATABASE_URL`)
3. Проверьте логи в терминале, где запущен `netlify dev`

### Ошибка "DATABASE_URL is not set!"

**Проблема:** Netlify функции выдают ошибку о отсутствии `DATABASE_URL`.

**Решение:**

1. Загрузите переменные окружения:

   ```bash
   source scripts/load-netlify-env.sh
   ```

2. Или создайте `.env` файл с переменными

3. Убедитесь, что `.env` файл находится в корне проекта

4. Перезапустите `netlify dev`

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
