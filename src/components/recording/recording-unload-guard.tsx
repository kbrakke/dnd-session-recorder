'use client';

import { useEffect } from 'react';
import { registryNeedsUnloadGuard } from '@/lib/recording/engine-registry';

/**
 * App-wide "Leave site?" guard, mounted in the persistent layout (Navbar).
 * The recorder keeps running across in-app navigation, so the guard must too:
 * a per-page hook would unmount with the recorder page and let a reload or
 * tab close on /sessions silently cut the recording. The handler asks the
 * registry at event time, so it needs no subscription.
 */
export function RecordingUnloadGuard() {
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!registryNeedsUnloadGuard()) return;
      event.preventDefault();
      event.returnValue = true; // older Chrome honors only a truthy returnValue
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  return null;
}
