// src/index.tsx
import '@features/universe/lib/artistPlayTrace';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import { StoreProvider } from '@app/providers/StoreProvider';
import { LangProvider } from '@app/providers/lang';
import { HelmetProvider } from 'react-helmet-async';
import { runGenresHealthCheck } from './dev/runGenresHealthCheck';
import './main.scss';

runGenresHealthCheck();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <StoreProvider>
        <LangProvider>
          <App />
        </LangProvider>
      </StoreProvider>
    </HelmetProvider>
  </React.StrictMode>
);
