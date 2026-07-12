import type { PaymentProvider } from '@shared/api/payment/types';

export const PAYMENT_PROVIDERS: Array<{
  id: PaymentProvider;
  name: string;
  logoSrcLight: string;
  logoSrcDark: string;
}> = [
  {
    id: 'yookassa',
    name: 'ЮKassa',
    logoSrcLight: '/images/yookassa-logo-light.png',
    logoSrcDark: '/images/yookassa-logo-dark.png',
  },
];
