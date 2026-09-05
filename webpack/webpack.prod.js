// webpack/webpack.prod.js

module.exports = {
  mode: 'production',
  devtool: false,
  optimization: {
    minimize: true,
    minimizer: [
      // CssMinimizerPlugin лучше тоже подключить здесь, а не в common
      new (require('css-minimizer-webpack-plugin'))(),
    ],
    // Code splitting: разделяем код на чанки для лучшей производительности
    splitChunks: {
      chunks: 'all',
      minSize: 20000, // Минимальный размер чанка (20KB)
      maxSize: 244000, // Максимальный размер чанка (244KB) для лучшего кеширования
      cacheGroups: {
        // React и React-DOM - отдельный чанк (часто обновляются вместе)
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
          name: 'react-vendor',
          priority: 30,
          reuseExistingChunk: true,
        },
        // React Router - отдельный чанк
        reactRouter: {
          test: /[\\/]node_modules[\\/]react-router[\\/]/,
          name: 'react-router-vendor',
          priority: 25,
          reuseExistingChunk: true,
        },
        // Redux Toolkit - отдельный чанк
        redux: {
          test: /[\\/]node_modules[\\/](@reduxjs|redux)[\\/]/,
          name: 'redux-vendor',
          priority: 25,
          reuseExistingChunk: true,
        },
        // React Helmet - отдельный чанк
        reactHelmet: {
          test: /[\\/]node_modules[\\/]react-helmet[\\/]/,
          name: 'react-helmet-vendor',
          priority: 20,
          reuseExistingChunk: true,
        },
        // i18next - отдельный чанк
        i18next: {
          test: /[\\/]node_modules[\\/]i18next[\\/]/,
          name: 'i18next-vendor',
          priority: 20,
          reuseExistingChunk: true,
        },
        // colorthief — только при открытии full-screen player (useImageColor callback)
        colorthief: {
          test: /[\\/]node_modules[\\/]colorthief[\\/]/,
          name: 'colorthief',
          chunks: 'async',
          priority: 50,
          enforce: true,
          reuseExistingChunk: true,
        },
        // three.js — только async chunks (Universe3D / service scenes)
        three: {
          test: /[\\/]node_modules[\\/]three[\\/]/,
          name: 'three',
          chunks: 'async',
          priority: 50,
          enforce: true,
          reuseExistingChunk: true,
        },
        // music-metadata — только при probe аудио при upload в UserDashboard
        audioMetadata: {
          test: /[\\/]node_modules[\\/](music-metadata|file-type|strtok3|@tokenizer)[\\/]/,
          name: 'audio-metadata',
          chunks: 'async',
          priority: 50,
          enforce: true,
          reuseExistingChunk: true,
        },
        // Supabase JS SDK — auth/storage client ops (dashboard), not Hero URL helpers
        supabase: {
          test: /[\\/]node_modules[\\/]@supabase[\\/]/,
          name: 'supabase',
          chunks: 'async',
          priority: 50,
          enforce: true,
          reuseExistingChunk: true,
        },
        // Остальные vendor библиотеки
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
          reuseExistingChunk: true,
          minChunks: 1,
        },
        // Отдельный чанк для общих компонентов и утилит проекта
        common: {
          name: 'common',
          minChunks: 2,
          priority: 5,
          reuseExistingChunk: true,
          // Исключаем node_modules из common
          test: /[\\/]src[\\/]/,
        },
      },
    },
  },
};
