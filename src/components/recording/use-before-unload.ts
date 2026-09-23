'use client';

import { useEffect, useRef } from 'react';
import { GUARD_UNLOAD_PHASES } from '@/lib/recording/state-machine';
import type { RecorderPhase } from '@/lib/recording/types';

/**
 * Native "Leave site?" dialog while closing the tab would lose audio.
 * In-app navigation does NOT need guarding: the engine lives in the registry
 * and keeps recording; the Navbar indicator links back.
 */
export function useBeforeUnloadGuard(phase: RecorderPhase): void {
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!GUARD_UNLOAD_PHASES.includes(phaseRef.current)) return;
      // Chrome ≥119, Firefox and Safari honor preventDefault; older Chrome
      // only a truthy returnValue.
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
}
