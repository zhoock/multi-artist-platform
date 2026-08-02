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
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  });
  console.log('✅ Переменные окружения загружены из .env.local');
} else {
  console.log('⚠️  Файл .env.local не найден');
}

import { promises as fs } from 'fs';
import * as path from 'path';
import { uploadFileAdmin } from '../src/shared/api/storage';

const MIXER_FILES = ['drums.png', 'bass.png', 'guitars.png', 'vocals.png'];

async function uploadMixerStems() {
  const targetUserId = process.env.MIGRATION_TARGET_USER_ID?.trim();
  if (!targetUserId) {
    console.error('❌ Задайте MIGRATION_TARGET_USER_ID.');
    process.exit(1);
  }
  const migrationLocalUserDir =
    process.env.MIGRATION_LOCAL_IMAGES_USER_DIR?.trim() || 'legacy-user';
  const MIXER_DIR = path.resolve(
    __dirname,
    '../src/images/users',
    migrationLocalUserDir,
    'stems/Mixer'
  );

  console.log('🚀 Загрузка файлов Mixer в Supabase Storage...\n');
  console.log(`📁 Директория: ${MIXER_DIR}\n`);

  let uploadedFiles = 0;
  let failedFiles = 0;

  for (const fileName of MIXER_FILES) {
    const filePath = path.join(MIXER_DIR, fileName);

    try {
      // Проверяем существование файла
      await fs.access(filePath);
      console.log(`📤 Загрузка: ${fileName}...`);

      const fileBuffer = await fs.readFile(filePath);
      const fileBlob = new Blob([fileBuffer], { type: 'image/png' });

      // Загружаем в папку Mixer в категории stems
      const url = await uploadFileAdmin({
        userId: targetUserId,
        category: 'stems',
        file: fileBlob,
        fileName: `Mixer/${fileName}`,
        contentType: 'image/png',
        upsert: true,
      });

      if (url) {
        uploadedFiles++;
        console.log(`   ✅ Загружено: Mixer/${fileName}`);
        console.log(`   📍 URL: ${url}\n`);
      } else {
        failedFiles++;
        console.log(`   ❌ Ошибка загрузки: Mixer/${fileName}\n`);
      }
    } catch (error) {
      failedFiles++;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.error(`   ❌ Файл не найден: ${fileName}\n`);
      } else {
        console.error(`   ❌ Ошибка при обработке ${fileName}:`, error, '\n');
      }
    }
  }

  console.log('='.repeat(50));
  console.log('📊 Итоги загрузки:');
  console.log(`   ✅ Успешно загружено: ${uploadedFiles}`);
  console.log(`   ❌ Ошибок: ${failedFiles}`);
  console.log('='.repeat(50) + '\n');

  if (failedFiles === 0) {
    console.log('🎉 Все файлы Mixer успешно загружены!');
  } else {
    console.log('⚠️  Загрузка завершена с ошибками. Проверьте логи выше.');
    console.log('\n💡 Убедитесь, что в .env.local установлены:');
    console.log('   - SUPABASE_URL');
    console.log('   - SUPABASE_SERVICE_ROLE_KEY');
  }
}

uploadMixerStems().catch((error) => {
  console.error('❌ Критическая ошибка:', error);
  process.exit(1);
});
