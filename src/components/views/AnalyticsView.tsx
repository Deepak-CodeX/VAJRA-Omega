'use client';

import React from 'react';
import { useVajraStore } from '@/store/vajraStore';
import ChartsPanel from '@/components/ChartsPanel';
import PowerMixPanel from '@/components/PowerMixPanel';

export default function AnalyticsView() {
  const metrics = useVajraStore((s) => s.metrics);
  const activeCascade = useVajraStore((s) => s.activeCascade);
  const clock = useVajraStore((s) => s.clock);

  const freq = metrics.systemFrequencyHz;
  const unservedMW = activeCascade?.totalUnservedLoadMW ?? 0;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto p-6 font-mono text-[#e0edf5]">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6 border-b border-[#1b2a38] pb-5">
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#00e5c8]/15 px-2 py-0.5 text-xs font-bold text-[#00e5c8]">
            ENGINEERING ANALYTICS
          </span>
          <h1 className="text-xl font-bold tracking-tight text-[#e0edf5]">
            Power System Dynamics & Telemetry
          </h1>
        </div>
        <p className="mt-1 font-sans text-xs text-[#5a7a8f]">
          Real-time physical indicators: frequency deviations, generation dispatch, thermal loading,
          and unserved energy.
        </p>
      </div>

      {/* ─── 4 Engineering Indicator Cards ───────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[#1b2a38] bg-[#09131f] p-4">
          <span className="text-[10px] text-[#5a7a8f]">GRID FREQUENCY</span>
          <div className="mt-1 text-2xl font-bold text-[#e0edf5]">
            {freq.toFixed(3)} <span className="text-xs text-[#5a7a8f]">Hz</span>
          </div>
          <div className="mt-1 text-[11px] text-[#00e5c8]">
            Deviation: {(freq - 50.0).toFixed(3)} Hz
          </div>
        </div>

        <div className="rounded-xl border border-[#1b2a38] bg-[#09131f] p-4">
          <span className="text-[10px] text-[#5a7a8f]">TOTAL SYSTEM LOAD</span>
          <div className="mt-1 text-2xl font-bold text-[#e0edf5]">
            {metrics.totalDemandMW.toFixed(0)} <span className="text-xs text-[#5a7a8f]">MW</span>
          </div>
          <div className="mt-1 text-[11px] text-[#a0c4d8]">Active dispatch demand</div>
        </div>

        <div className="rounded-xl border border-[#1b2a38] bg-[#09131f] p-4">
          <span className="text-[10px] text-[#5a7a8f]">ONLINE GENERATION</span>
          <div className="mt-1 text-2xl font-bold text-[#e0edf5]">
            {metrics.totalGenerationMW.toFixed(0)} <span className="text-xs text-[#5a7a8f]">MW</span>
          </div>
          <div className="mt-1 text-[11px] text-[#a0c4d8]">Total capacity dispatched</div>
        </div>

        <div className="rounded-xl border border-[#1b2a38] bg-[#09131f] p-4">
          <span className="text-[10px] text-[#5a7a8f]">UNSERVED LOAD</span>
          <div className="mt-1 text-2xl font-bold text-[#ff6b6b]">
            {unservedMW.toFixed(1)} <span className="text-xs text-[#5a7a8f]">MW</span>
          </div>
          <div className="mt-1 text-[11px] text-[#ff6b6b]">
            {unservedMW > 0 ? 'Blackout condition active' : 'Zero unserved energy'}
          </div>
        </div>
      </div>

      {/* ─── Generation Mix & Historical Telemetry Charts ───────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <PowerMixPanel />
        </div>
        <div className="lg:col-span-2">
          <ChartsPanel />
        </div>
      </div>
    </div>
  );
}
