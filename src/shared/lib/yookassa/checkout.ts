/**
 * Утилиты для работы с YooKassa Checkout.js
 * Документация: https://yookassa.ru/developers/payment-acceptance/integration-scenarios/checkout-js
 */

const CHECKOUT_JS_URL = 'https://static.yoomoney.ru/checkout-js/v1/checkout.js';
let scriptLoadingPromise: Promise<void> | null = null;

/**
 * Динамически загружает библиотеку Checkout.js
 * @returns Promise, который разрешается когда библиотека загружена
 */
export function loadCheckoutJs(): Promise<void> {
  // Проверяем, что мы в браузере
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Checkout.js can only be loaded in browser environment'));
  }

  // Если уже загружена, сразу возвращаем успех
  if (isCheckoutJsLoaded()) {
    return Promise.resolve();
  }

  // Если уже идет загрузка, возвращаем существующий Promise
  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  // Проверяем, есть ли уже скрипт в DOM
  const existingScript = document.querySelector(`script[src="${CHECKOUT_JS_URL}"]`);
  if (existingScript) {
    scriptLoadingPromise = new Promise((resolve) => {
      // Ждем, пока скрипт загрузится
      const checkInterval = setInterval(() => {
        if (isCheckoutJsLoaded()) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);

      // Таймаут на случай, если скрипт не загрузится
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 5000);
    });
    return scriptLoadingPromise;
  }

  // Создаем новый скрипт и загружаем
  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_JS_URL;
    script.async = true;

    script.onload = () => {
      // Даем библиотеке время на инициализацию
      setTimeout(() => {
        if (isCheckoutJsLoaded()) {
          resolve();
        } else {
          reject(new Error('Checkout.js script loaded but YooMoneyCheckout is not available'));
        }
      }, 100);
    };

    script.onerror = () => {
      scriptLoadingPromise = null;
      reject(new Error('Failed to load Checkout.js script'));
    };

    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
}

// Типы для Checkout.js согласно документации
declare global {
  interface Window {
    YooMoneyCheckout?: (
      shopId: string,
      config?: { language?: 'en' | 'ru' }
    ) => {
      tokenize(options: TokenizeOptions): Promise<TokenizeResult>;
    };
  }
}

interface TokenizeOptions {
  number: string;
  cvc: string;
  month: string; // 2 символа, только цифры
  year: string; // 2 символа, только цифры
}

interface TokenizeResult {
  status: 'success' | 'error';
  data?: {
    response: {
      paymentToken: string;
    };
  };
  error?: {
    type: string;
    message?: string;
    status_code: number;
    code?: string;
    params?: Array<{
      code: string;
      message: string;
    }>;
  };
}

/**
 * Проверяет, загружена ли библиотека Checkout.js
 */
export function isCheckoutJsLoaded(): boolean {
  return typeof window !== 'undefined' && typeof window.YooMoneyCheckout === 'function';
}

/**
 * Инициализирует Checkout.js с shopId
 * @param shopId - Идентификатор магазина YooKassa
 * @param language - Язык сообщений об ошибках ('en' или 'ru', по умолчанию 'ru')
 * @returns Экземпляр Checkout.js или null, если библиотека не загружена
 */
export function initCheckout(shopId: string, language: 'en' | 'ru' = 'ru') {
  if (!isCheckoutJsLoaded()) {
    console.error('❌ YooKassa Checkout.js library is not loaded');
    return null;
  }

  try {
    return window.YooMoneyCheckout!(shopId, { language });
  } catch (error) {
    console.error('❌ Error initializing YooKassa Checkout.js:', error);
    return null;
  }
}

/**
 * Получает токен платежа через Checkout.js
 * @param shopId - Идентификатор магазина YooKassa
 * @param cardData - Данные банковской карты
 * @param language - Язык сообщений об ошибках ('en' или 'ru', по умолчанию 'ru')
 * @returns Promise с токеном платежа или ошибкой
 */
export async function getPaymentToken(
  shopId: string,
  cardData: {
    number: string;
    cvc: string;
    expMonth: string;
    expYear: string;
  },
  language: 'en' | 'ru' = 'ru'
): Promise<{ token?: string; error?: string }> {
  // Загружаем библиотеку, если она еще не загружена
  try {
    await loadCheckoutJs();
  } catch (error) {
    console.error('❌ Failed to load Checkout.js:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to load Checkout.js library',
    };
  }

  const checkout = initCheckout(shopId, language);
  if (!checkout) {
    return { error: 'Checkout.js library is not loaded' };
  }

  try {
    // Форматируем данные согласно документации
    const number = cardData.number.replace(/\s/g, ''); // Убираем пробелы, только цифры
    const cvc = cardData.cvc;
    const month = cardData.expMonth.padStart(2, '0'); // 2 символа, только цифры
    const year = cardData.expYear.slice(-2); // Последние 2 цифры года

    const result = await checkout.tokenize({
      number,
      cvc,
      month,
      year,
    });

    // Обработка результата согласно документации
    if (result.status === 'success' && result.data?.response?.paymentToken) {
      return { token: result.data.response.paymentToken };
    }

    if (result.status === 'error' && result.error) {
      // Формируем сообщение об ошибке
      let errorMessage = '';

      if (result.error.type === 'validation_error' && result.error.params) {
        // Ошибки валидации - показываем все ошибки
        const errorMessages = result.error.params.map((param) => param.message);
        errorMessage = errorMessages.join(', ');
      } else if (result.error.message) {
        errorMessage = result.error.message;
      } else if (result.error.code) {
        errorMessage = `Error: ${result.error.code}`;
      } else {
        errorMessage = `Tokenization failed: ${result.error.type}`;
      }

      console.error('❌ Checkout.js tokenize error:', result.error);
      return { error: errorMessage };
    }

    return { error: 'Tokenization failed: unexpected response format' };
  } catch (error) {
    console.error('❌ Error tokenizing card with Checkout.js:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error during tokenization',
    };
  }
}
