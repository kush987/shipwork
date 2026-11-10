import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import type { UnsavedChangesGuardOptions } from './useUnsavedChangesGuard.types';

/**
 * Asks before leaving a page with unsaved changes: in-app navigation (needs the data router) and tab close.
 * `allowNavigation` lets a deliberate navigation through (e.g. a save that redirects).
 */
export function useUnsavedChangesGuard(dirty: boolean, { allowNavigation = false }: UnsavedChangesGuardOptions = {}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && !allowNavigation && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (confirm('You have unsaved changes. Leave and discard them?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
}
