/**
 * Скрипт для проверки содержимого bucket
 */

// Загружаем переменные окружения из .env.local если файл существует
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = resolve(__dirname, '../.env.local');
if (existsSync(envPath)) {
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach((line) => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const match = trimmedLine.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Убираем кавычки если есть
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

import { createSupabaseClient } from '../src/config/supabase';
import { STORAGE_BUCKET_NAME } from '../src/config/supabaseStorageUrl';

async function checkBucket() {
  console.log('🔍 Проверка bucket...\n');

  // Диагностика переменных окружения
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  console.log('📋 Переменные окружения:');
  console.log(
    `   VITE_SUPABASE_URL: ${supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : '❌ не установлена'}`
  );
  console.log(
    `   VITE_SUPABASE_ANON_KEY: ${supabaseKey ? supabaseKey.substring(0, 20) + '...' : '❌ не установлена'}`
  );
  console.log('');

  const supabase = createSupabaseClient();
  if (!supabase) {
    console.error('❌ Supabase client is not available. Please set environment variables.');
    console.error('\n💡 Попробуйте:');
    console.error(
      '   1. Создайте файл .env.local с переменными VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY'
    );
    console.error('   2. Или загрузите переменные через: source scripts/load-netlify-env.sh');
    return;
  }

  // Проверяем текущий bucket напрямую (listBuckets требует админских прав)
  const currentBucket = STORAGE_BUCKET_NAME;
  console.log(`📁 Проверка bucket "${currentBucket}":`);

  // Пытаемся получить список файлов из корня bucket - если bucket существует и доступен, это сработает
  const { data: rootFiles, error: bucketError } = await supabase.storage
    .from(currentBucket)
    .list('', { limit: 1 });

  if (bucketError) {
    console.error(`❌ Ошибка доступа к bucket "${currentBucket}":`, bucketError.message);
    console.error('\n💡 Возможные причины:');
    console.error('   1. Bucket не существует');
    console.error('   2. Bucket не публичный');
    console.error('   3. RLS политики не настроены');
    console.error('   4. Неверные переменные окружения');
    return;
  }

  console.log(`✅ Bucket "${currentBucket}" существует и доступен!\n`);

  // Считаем файлы рекурсивно и показываем структуру
  async function scanBucket(
    bucket: string,
    folderPath: string = '',
    depth: number = 0
  ): Promise<{ files: number; folders: string[] }> {
    const { data, error } = await supabase.storage.from(bucket).list(folderPath, {
      limit: 1000,
    });

    if (error) {
      if (depth === 0) {
        // На первом уровне игнорируем ошибки (может быть пустая папка)
      }
      return { files: 0, folders: [] };
    }

    if (!data || data.length === 0) return { files: 0, folders: [] };

    let files = 0;
    const folders: string[] = [];

    for (const item of data) {
      const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name;

      if (item.id === null && item.metadata === null) {
        // Это папка
        folders.push(fullPath);
        const subResult = await scanBucket(bucket, fullPath, depth + 1);
        files += subResult.files;
        folders.push(...subResult.folders);
      } else if (item.id !== null) {
        // Это файл
        files++;
        if (depth < 2) {
          // Показываем только файлы на первых двух уровнях
          console.log(`   📄 ${fullPath}`);
        }
      }
    }

    return { files, folders };
  }

  console.log('\n📂 Содержимое bucket:');
  const result = await scanBucket(currentBucket);
  console.log(`\n📊 Всего файлов: ${result.files}`);
  console.log(`📁 Всего папок: ${result.folders.length}`);

  if (result.folders.length > 0 && result.folders.length <= 10) {
    console.log('\n📂 Папки:');
    result.folders.forEach((folder) => {
      console.log(`   📁 ${folder}/`);
    });
  }
}

checkBucket().catch((error) => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
