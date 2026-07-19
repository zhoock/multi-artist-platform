import { useState, useEffect, useCallback } from 'react';
import { scrollToHash } from '@pages/Home/lib/scrollToHash';
import { useEffectiveLocation } from '@shared/lib/hooks/useEffectiveLocation';

type UseHomeDataResult = {
  isAboutModalOpen: boolean;
  openAboutModal: () => void;
  closeAboutModal: () => void;
};

export function useHomeData(): UseHomeDataResult {
  const location = useEffectiveLocation();
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);

  const openAboutModal = useCallback(() => setIsAboutModalOpen(true), []);
  const closeAboutModal = useCallback(() => setIsAboutModalOpen(false), []);

  useEffect(() => {
    scrollToHash(location.hash);
  }, [location.hash]);

  return { isAboutModalOpen, openAboutModal, closeAboutModal };
}
