'use client';

import { useEffect, useRef } from 'react';
import { GUARD_UNLOAD_PHASES } from '@/lib/recording/state-machine';
import type { RecorderPhase } from '@/lib/recording/types';

/**
 * Page-local "Leave site?" dialog for a phase the registry can't see yet
 * (e.g. /sessions/record while its start requests are in flight). Engine
 * phases are covered app-wide by <RecordingUnloadGuard/> in the Navbar,
 * which survives in-app navigation.
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
