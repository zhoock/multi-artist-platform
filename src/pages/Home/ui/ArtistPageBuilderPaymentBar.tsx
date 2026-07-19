import { CreditCard as CreditCardIcon } from 'lucide-react';
import { useLang } from '@app/providers/lang';
import { useAppSelector } from '@shared/lib/hooks/useAppSelector';
import { useArtistPageBuilder } from '@shared/lib/hooks/useArtistPageBuilder';
import { useEffectiveSearchParams } from '@shared/lib/hooks/useEffectiveLocation';
import { shouldShowArtistPageBuilderPaymentBlock } from '@shared/lib/artistPageBuilder';
import { selectUiDictionaryFirst } from '@shared/model/uiDictionary';
import {
  ArtistPageBuilderBlock,
  artistPageBuilderBarIconProps,
  useArtistPageBuilderNav,
} from '@shared/ui/artistPageBuilder';
import './ArtistPageBuilderPaymentBar.scss';

export function ArtistPageBuilderPaymentBar() {
  const { lang } = useLang();
  const [searchParams] = useEffectiveSearchParams();
  const artistSlug = searchParams.get('artist')?.trim() ?? '';
  const { builderVisibility, monetizationEnabled, paymentSurfaceReady } =
    useArtistPageBuilder(artistSlug);
  const ui = useAppSelector((state) => selectUiDictionaryFirst(state, lang));
  const copy = ui?.artistPageBuilder?.payment;
  const { openDashboard } = useArtistPageBuilderNav();

  if (
    !shouldShowArtistPageBuilderPaymentBlock(builderVisibility, {
      resolved: paymentSurfaceReady,
      monetizationEnabled,
    })
  ) {
    return null;
  }

  return (
    <section className="artist-page-builder-payment-bar" aria-label={copy?.text ?? 'Payment setup'}>
      <div className="artist-page-builder-payment-bar__inner wrapper">
        <ArtistPageBuilderBlock
          layout="bar"
          icon={<CreditCardIcon {...artistPageBuilderBarIconProps()} />}
          title={copy?.text ?? 'Connect payments'}
          actionLabel={copy?.cta ?? 'Set up payments'}
          onAction={() => openDashboard('payment-settings')}
        />
      </div>
    </section>
  );
}

export default ArtistPageBuilderPaymentBar;
