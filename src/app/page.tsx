'use client';

import { useEffect } from 'react';
import { useVajraStore } from '@/store/vajraStore';
import AppShell from '@/components/shell/AppShell';

export default function HomePage() {
  const initialized = useVajraStore((s) => s.initialized);
  const initialize = useVajraStore((s) => s.initialize);

  // Initialize simulation with deterministic seed 42 on first load
  useEffect(() => {
    if (!initialized) {
      initialize(42);
    }
  }, [initialized, initialize]);

  return <AppShell />;
}
