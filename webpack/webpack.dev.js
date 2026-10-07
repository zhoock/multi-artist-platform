// webpack/webpack.dev.js

const path = require('path'); //для того чтобы превратить относительный путь в абсолютный, мы будем использовать пакет path
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin'); // плагин для обновления React компонентов без перезагрузки страницы

module.exports = {
  mode: 'development',
  devtool: 'eval-source-map',
  devServer: {
    // historyApiFallback должен исключать /api/*, иначе он перехватывает все запросы
    // Важно: прокси обрабатывается ПЕРЕД historyApiFallback, но нужно явно исключить /api
    historyApiFallback: {
      disableDotRule: true,
      // Исключаем статические файлы из fallback - они обрабатываются через static директории
      rewrites: [
        // Для всех остальных - fallback на index.html
        { from: /^(?!\/(audio|images|scripts|styles|assets)\/).*$/, to: '/index.html' },
      ],
    },
    static: [
      {
        directory: path.resolve(__dirname, '../dist'), // путь, куда "смотрит" режим разработчика
      },
      {
        directory: path.resolve(__dirname, '../src/audio'), // аудиофайлы из src для dev режима
        publicPath: '/audio', // путь, по которому будут доступны файлы
      },
      {
        directory: path.resolve(__dirname, '../src/images'), // изображения из src для dev режима
        publicPath: '/images', // путь, по которому будут доступны файлы
      },
    ],
    // compress: true, // это ускорит загрузку в режиме разработки
    host: '0.0.0.0', // Слушаем на всех интерфейсах, чтобы можно было подключиться с мобильного устройства
    port: 8080, // порт, чтобы открывать сайт по адресу localhost:8080, но можно поменять порт
    open: false, // Netlify Dev сам откроет браузер на порту 8888
    hot: true,
    // Native WebSocket HMR — avoids sockjs-client `unload` listener (Permissions-Policy violation in Chrome).
    webSocketServer: 'ws',
    client: {
      webSocketTransport: 'ws',
    },
    allowedHosts: 'all', // Разрешаем доступ с любых хостов (для мобильных устройств в локальной сети)
    // Проксируем запросы к Netlify функциям
    // Если NETLIFY_SITE_URL установлен - проксируем на прод
    // Если нет - проксируем на локальный Netlify Dev (порт 8888)
    proxy: [
      {
        // Проксируем все запросы к /api/*
        context: ['/api'],
        target: process.env.NETLIFY_SITE_URL || 'http://localhost:8888',
        changeOrigin: true,
        secure: process.env.NETLIFY_SITE_URL ? true : false,
        logLevel: 'debug',
        onProxyReq: (proxyReq, req) => {
          const target = process.env.NETLIFY_SITE_URL || 'http://localhost:8888';
          console.log('[HPM] Проксируем:', req.method, req.url, '->', target + req.url);
        },
        onProxyRes: (proxyRes, req) => {
          console.log('[HPM] Ответ прокси:', proxyRes.statusCode, req.url);
        },
        onError: (err) => {
          console.error('[HPM] Ошибка прокси:', err.message);
        },
      },
      {
        // Проксируем все запросы к /.netlify/*
        context: ['/.netlify'],
        target: process.env.NETLIFY_SITE_URL || 'http://localhost:8888',
        changeOrigin: true,
        secure: process.env.NETLIFY_SITE_URL ? true : false,
        logLevel: 'debug',
        onProxyReq: (proxyReq, req) => {
          const target = process.env.NETLIFY_SITE_URL || 'http://localhost:8888';
          console.log(
            '[HPM] Проксируем Netlify Function:',
            req.method,
            req.url,
            '->',
            target + req.url
          );
        },
        onProxyRes: (proxyRes, req) => {
          console.log('[HPM] Ответ прокси Netlify Function:', proxyRes.statusCode, req.url);
        },
        onError: (err) => {
          console.error('[HPM] Ошибка прокси Netlify Function:', err.message);
        },
      },
    ],
  },
  plugins: [
    new ReactRefreshWebpackPlugin({
      overlay: {
        sockIntegration: path.resolve(__dirname, 'reactRefreshWDSSocket.js'),
      },
    }),
  ],
};
