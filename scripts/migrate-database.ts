#!/usr/bin/env tsx
/**
 * Скрипт для выполнения SQL-миграций в PostgreSQL.
 *
 * Использование:
 *   npm run migrate
 *   или
 *   npx tsx scripts/migrate-database.ts
 *
 * Требует переменную окружения DATABASE_URL:
 *   DATABASE_URL=postgresql://username:password@host:port/database
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

// Загружаем переменные окружения из .env
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const match = trimmedLine.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  });
}

const MIGRATIONS_DIR = join(__dirname, '..', 'database', 'migrations');

interface Migration {
  filename: string;
  content: string;
}

/**
 * Получить список файлов миграций
 */
function getMigrations(): string[] {
  const { readdirSync } = require('fs');
  const files = readdirSync(MIGRATIONS_DIR);
  return files.filter((file: string) => file.endsWith('.sql')).sort(); // Сортируем по имени файла
}

/**
 * Загрузить миграцию из файла
 */
function loadMigration(filename: string): Migration {
  const filePath = join(MIGRATIONS_DIR, filename);
  const content = readFileSync(filePath, 'utf-8');
  return { filename, content };
}

/**
 * Проверить, была ли миграция уже выполнена
 */
async function isMigrationExecuted(pool: Pool, filename: string): Promise<boolean> {
  try {
    // Создаем таблицу для отслеживания миграций, если её нет
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const result = await pool.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [
      filename,
    ]);

    return result.rows.length > 0;
  } catch (error) {
    console.error('❌ Error checking migration status:', error);
    return false;
  }
}

/**
 * Отметить миграцию как выполненную
 */
async function markMigrationExecuted(pool: Pool, filename: string): Promise<void> {
  await pool.query(
    'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
    [filename]
  );
}

/**
 * Выполнить миграцию
 */
async function runMigration(pool: Pool, migration: Migration): Promise<void> {
  try {
    console.log(`📝 Running migration: ${migration.filename}`);

    // Выполняем SQL команды
    // Удаляем комментарии перед разбивкой
    let sql = migration.content;

    // Удаляем однострочные комментарии (-- ...)
    sql = sql.replace(/--.*$/gm, '');

    // Умная разбивка по ';' с учетом dollar-quoted strings ($$ ... $$)
    const commands: string[] = [];
    let currentCommand = '';
    let inDollarQuote = false;
    let dollarTag = '';

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];
      const nextChar = sql[i + 1];

      // Проверяем начало dollar-quoted string ($$ или $tag$)
      if (char === '$' && !inDollarQuote) {
        // Ищем закрывающий $
        let tagEnd = sql.indexOf('$', i + 1);
        if (tagEnd !== -1) {
          dollarTag = sql.substring(i, tagEnd + 1);
          inDollarQuote = true;
          currentCommand += dollarTag;
          i = tagEnd;
          continue;
        }
      }

      // Проверяем конец dollar-quoted string
      if (inDollarQuote && sql.substring(i).startsWith(dollarTag)) {
        currentCommand += dollarTag;
        i += dollarTag.length - 1;
        inDollarQuote = false;
        dollarTag = '';
        continue;
      }

      currentCommand += char;

      // Если не в dollar-quote и встретили ';', это конец команды
      if (!inDollarQuote && char === ';') {
        const trimmed = currentCommand.trim();
        if (trimmed.length > 0) {
          commands.push(trimmed);
        }
        currentCommand = '';
      }
    }

    // Добавляем последнюю команду, если она есть
    const lastTrimmed = currentCommand.trim();
    if (lastTrimmed.length > 0) {
      commands.push(lastTrimmed);
    }

    // Выполняем команды
    for (const command of commands) {
      if (command.trim()) {
        try {
          await pool.query(command);
        } catch (error: any) {
          // Игнорируем ошибки "already exists" для CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, CREATE TRIGGER
          const errorMessage = error?.message || String(error);
          if (
            errorMessage.includes('already exists') ||
            errorMessage.includes('duplicate key') ||
            errorMessage.includes('relation already exists') ||
            (error.code === '42710' && errorMessage.includes('trigger')) // PostgreSQL error code for duplicate object
          ) {
            console.log(`  ⚠️  Пропускаем (уже существует): ${command.substring(0, 80)}...`);
            continue;
          }
          throw error;
        }
      }
    }

    // Отмечаем миграцию как выполненную
    await markMigrationExecuted(pool, migration.filename);

    console.log(`✅ Migration ${migration.filename} completed successfully`);
  } catch (error) {
    console.error(`❌ Error running migration ${migration.filename}:`, error);
    throw error;
  }
}

/**
 * Главная функция
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is not set');
    console.error('   Please set it: export DATABASE_URL=postgresql://user:pass@host:port/db');
    process.exit(1);
  }

  console.log('🚀 Starting database migrations...');
  console.log(`   Database: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`); // Скрываем пароль

  const connectionUrl = databaseUrl.toLowerCase();
  const useSsl =
    (connectionUrl.includes('supabase.com') || process.env.PGSSLMODE === 'require') &&
    !connectionUrl.includes('localhost') &&
    !connectionUrl.includes('127.0.0.1');

  const pool = new Pool({
    connectionString: databaseUrl,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  try {
    // Тестируем подключение
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful');

    // Получаем список миграций
    const migrationFiles = getMigrations();
    console.log(`📋 Found ${migrationFiles.length} migration(s)`);

    if (migrationFiles.length === 0) {
      console.log('⚠️  No migrations found');
      return;
    }

    // Выполняем каждую миграцию
    let executed = 0;
    let skipped = 0;

    for (const filename of migrationFiles) {
      const alreadyExecuted = await isMigrationExecuted(pool, filename);

      if (alreadyExecuted) {
        console.log(`⏭️  Skipping ${filename} (already executed)`);
        skipped++;
        continue;
      }

      const migration = loadMigration(filename);
      await runMigration(pool, migration);
      executed++;
    }

    console.log('\n✨ Migration completed!');
    console.log(`   Executed: ${executed}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${migrationFiles.length}`);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Запускаем миграции
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
