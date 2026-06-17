import { useMemo } from 'react';

import {
  readPreviousPath,
  resolveNavigationOrigin,
  type NavigationOrigin,
} from './resolveNavigationOrigin';

export function useNavigationOrigin(): NavigationOrigin {
  return useMemo(() => resolveNavigationOrigin(readPreviousPath()), []);
}
