'use client';

import React from 'react';
import ScenarioSelector from '@/components/ScenarioSelector';
import CascadePanel from '@/components/CascadePanel';
import RecoveryControls from '@/components/RecoveryControls';

export default function ScenariosView() {
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto p-6 font-mono text-[#e0edf5]">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6 border-b border-[#1b2a38] pb-5">
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#00e5c8]/15 px-2 py-0.5 text-xs font-bold text-[#00e5c8]">
            CONTINGENCY & BLACKSTART
          </span>
          <h1 className="text-xl font-bold tracking-tight text-[#e0edf5]">
            Grid Stress & Cascade Scenarios
          </h1>
        </div>
        <p className="mt-1 font-sans text-xs text-[#5a7a8f]">
          Simulate deterministic N-1 / N-2 transmission trips, observe dynamic cascade propagation,
          and execute staged blackstart restoration.
        </p>
      </div>

      {/* ─── 3 Primary Control Modules ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Scenario Selector (4 Cols) */}
        <div className="lg:col-span-4">
          <ScenarioSelector />
        </div>

        {/* Dynamic Cascade Propagation Panel (4 Cols) */}
        <div className="lg:col-span-4">
          <CascadePanel />
        </div>

        {/* Blackstart Recovery Sequencing (4 Cols) */}
        <div className="lg:col-span-4">
          <RecoveryControls />
        </div>
      </div>
    </div>
  );
}
