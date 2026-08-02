import { YANDEX_METRIKA_ID, YANDEX_METRIKA_INIT_OPTIONS } from './config';

const YANDEX_METRIKA_SCRIPT_URL = `https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}`;

function ensureYmLoader(): void {
  if (window.ym) {
    return;
  }

  const queue: IArguments[] = [];
  const ymStub = function ymStubFn() {
    queue.push(arguments);
  } as NonNullable<Window['ym']>;

  ymStub.a = queue;
  ymStub.l = Date.now();
  window.ym = ymStub;
}

function appendMetrikaScript(): void {
  for (let index = 0; index < document.scripts.length; index += 1) {
    if (document.scripts[index]?.src === YANDEX_METRIKA_SCRIPT_URL) {
      return;
    }
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = YANDEX_METRIKA_SCRIPT_URL;

  const firstScript = document.getElementsByTagName('script')[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }
}

export function loadYandexMetrika(counterId = YANDEX_METRIKA_ID): void {
  ensureYmLoader();
  appendMetrikaScript();

  window.ym!(counterId, 'init', YANDEX_METRIKA_INIT_OPTIONS);
}
