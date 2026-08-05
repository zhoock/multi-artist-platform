// Типы для CSS/SCSS модулей
declare module '*.module.css' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.module.scss' {
  const classes: { [key: string]: string };
  export default classes;
}

declare module '*.module.sass' {
  const classes: { [key: string]: string };
  export default classes;
}

// Типы для переменных окружения (Vite-стиль через webpack DefinePlugin)
declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
    readonly VITE_USE_SUPABASE_STORAGE?: string;
    /** Базовый URL для JSON/ассетов в production (например raw.githubusercontent.com/.../src/assets) */
    readonly VITE_RAW_ASSETS_BASE_URL?: string;
    /** Local dev: skip YooKassa redirect (requires server DEV_PAYMENT_MODE=true) */
    readonly VITE_DEV_PAYMENT_MODE?: string;
    /** Mirror of SUBSCRIPTION_AUTO_RENEW_ENABLED — gates auto-renew UI actions */
    readonly VITE_SUBSCRIPTION_AUTO_RENEW_ENABLED?: string;
    /** True when webpack build is not production */
    readonly DEV?: boolean;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
