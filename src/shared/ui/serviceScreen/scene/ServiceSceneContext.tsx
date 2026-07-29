import { createContext, useContext, type ReactNode } from 'react';
import type { ServiceSceneId } from './types';

type ServiceSceneContextValue = {
  scene: ServiceSceneId | undefined;
};

const ServiceSceneContext = createContext<ServiceSceneContextValue>({
  scene: undefined,
});

export function ServiceSceneProvider({
  scene,
  children,
}: {
  scene?: ServiceSceneId;
  children: ReactNode;
}) {
  return <ServiceSceneContext.Provider value={{ scene }}>{children}</ServiceSceneContext.Provider>;
}

export function useServiceScene(): ServiceSceneId | undefined {
  return useContext(ServiceSceneContext).scene;
}
