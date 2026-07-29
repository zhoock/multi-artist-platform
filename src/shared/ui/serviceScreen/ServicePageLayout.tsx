import {
  ServiceContent,
  type ServiceContentAction,
  type ServiceContentProps,
  type ServiceContentSecondaryAction,
} from './ServiceContent';
import { ServiceOverlay } from './ServiceOverlay';
import { ServiceScene } from './ServiceScene';
import type { ServiceSceneId } from './scene';
import { ServiceSceneProvider } from './scene';
import './ServicePageLayout.scss';

export type ServicePageLayoutAction = ServiceContentAction;
export type ServicePageLayoutSecondaryAction = ServiceContentSecondaryAction;
export type ServicePageLayoutProps = ServiceContentProps & {
  scene?: ServiceSceneId;
};

export function ServicePageLayout({ titleId, scene, ...contentProps }: ServicePageLayoutProps) {
  return (
    <ServiceSceneProvider scene={scene}>
      <section className="service-page-layout" aria-labelledby={titleId}>
        <ServiceScene />
        <ServiceOverlay />
        <ServiceContent titleId={titleId} {...contentProps} />
      </section>
    </ServiceSceneProvider>
  );
}
