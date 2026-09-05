import { lazy, Suspense } from 'react';
import {
  ServiceContent,
  type ServiceContentAction,
  type ServiceContentProps,
  type ServiceContentSecondaryAction,
} from './ServiceContent';
import { ServiceOverlay } from './ServiceOverlay';
import { ServiceSceneProvider } from './scene/ServiceSceneContext';
import type { ServiceSceneId } from './scene/types';
import './ServicePageLayout.scss';

const ServiceScene = lazy(() =>
  import('./ServiceScene').then((m) => ({ default: m.ServiceScene }))
);

export type ServicePageLayoutAction = ServiceContentAction;
export type ServicePageLayoutSecondaryAction = ServiceContentSecondaryAction;
export type ServicePageLayoutProps = ServiceContentProps & {
  scene?: ServiceSceneId;
};

export function ServicePageLayout({ titleId, scene, ...contentProps }: ServicePageLayoutProps) {
  return (
    <ServiceSceneProvider scene={scene}>
      <section className="service-page-layout" aria-labelledby={titleId}>
        <Suspense fallback={null}>
          <ServiceScene />
        </Suspense>
        <ServiceOverlay />
        <ServiceContent titleId={titleId} {...contentProps} />
      </section>
    </ServiceSceneProvider>
  );
}
