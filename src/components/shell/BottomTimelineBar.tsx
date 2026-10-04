'use client';

import React, { useState } from 'react';
import { useVajraStore } from '@/store/vajraStore';
import { tickToTimestamp } from '@/lib/utils';
import type { SimulationSpeed } from '@/types';

export default function BottomTimelineBar() {
  const clock = useVajraStore((s) => s.clock);
  const metrics = useVajraStore((s) => s.metrics);
  const activeCascade = useVajraStore((s) => s.activeCascade);
  const tickSimulation = useVajraStore((s) => s.tick);
  const startSimulation = useVajraStore((s) => s.start);
  const pauseSimulation = useVajraStore((s) => s.pause);
  const resetSimulation = useVajraStore((s) => s.reset);
  const setSpeed = useVajraStore((s) => s.setSpeed);

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Speed options
  const speeds: SimulationSpeed[] = [0.5, 1, 2, 5, 10];

  // Plain-language Frequency Status
  const freq = metrics.systemFrequencyHz;
  const freqDeviation = (freq - 50.0).toFixed(3);
  const isFreqStressed = Math.abs(freq - 50.0) > 0.2;

  // Plain-language Unserved Load
  const unservedMW = activeCascade?.totalUnservedLoadMW ?? 0;
  const isBlackoutActive = unservedMW > 0 || (activeCascade?.affectedAssetIds?.length ?? 0) > 0;
  const simTime = tickToTimestamp(clock.tick);

  if (isCollapsed) {
    return (
      <div className="flex h-7 items-center justify-between border-t border-[#1b2a38] bg-[#09131f] px-4 font-mono text-xs text-[#5a7a8f]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-bold text-[#e0edf5]">
            <span>⏱️</span> Tick: {clock.tick} ({simTime})
          </span>
          <span className="text-[10px] text-[#00e5c8]">
            {clock.isRunning ? '▶ RUNNING' : '⏸ PAUSED'}
          </span>
        </div>
        <button
          onClick={() => setIsCollapsed(false)}
          className="rounded px-2 py-0.5 text-[10px] text-[#00e5c8] hover:bg-[#101d2c]"
        >
          ▲ Expand Simulation Bar
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col border-t border-[#1b2a38] bg-[#070d17]/95 px-4 py-2 font-mono text-xs text-[#e0edf5] backdrop-blur">
      {/* ─── Top Row: Status Banner & Collapse ───────────────────────────── */}
      <div className="mb-2 flex items-center justify-between text-[11px]">
        {/* Left: Simulation vs Reality distinction */}
        <div className="flex items-center gap-3">
          <span className="rounded bg-[#8338ec]/20 px-2 py-0.5 font-bold text-[#d8b4fe]">
            🟣 SIMULATION ENGINE ACTIVE
          </span>
          <span className="text-[#5a7a8f]">
            Grid Frequency:{' '}
            <strong className={isFreqStressed ? 'text-[#ff6b6b]' : 'text-[#00e5c8]'}>
              {freq.toFixed(3)} Hz
            </strong>{' '}
            ({freq < 50 ? `${freqDeviation} Hz below 50.0` : 'Nominal'})
          </span>
        </div>

        {/* Center: Blackout warning if any */}
        {isBlackoutActive && (
          <div className="flex items-center gap-2 rounded border border-[#d9383a]/50 bg-[#d9383a]/15 px-3 py-0.5 text-[#ff6b6b]">
            <span className="animate-ping text-xs">⚠️</span>
            <span className="font-bold">CASCADE IN PROGRESS:</span>
            <span>{activeCascade?.affectedAssetIds?.length ?? 0} Assets Tripped</span>
            <span>•</span>
            <span>{unservedMW.toFixed(1)} MW Unserved Load</span>
          </div>
        )}

        {/* Right: Collapse toggle */}
        <button
          onClick={() => setIsCollapsed(true)}
          className="text-[10px] text-[#5a7a8f] hover:text-[#e0edf5]"
        >
          ▼ Minimize
        </button>
      </div>

      {/* ─── Bottom Row: Controls & Scrubber ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Playback Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              if (clock.isRunning) {
                pauseSimulation();
              } else {
                startSimulation();
              }
            }}
            className={`flex items-center gap-1.5 rounded border px-3 py-1 font-bold text-xs transition ${
              clock.isRunning
                ? 'border-[#f5a623] bg-[#f5a623]/15 text-[#f5a623] hover:bg-[#f5a623]/25'
                : 'border-[#00e5c8] bg-[#00e5c8]/15 text-[#00e5c8] hover:bg-[#00e5c8]/25'
            }`}
          >
            {clock.isRunning ? '⏸ PAUSE' : '▶ PLAY'}
          </button>

          <button
            onClick={() => tickSimulation()}
            title="Advance 1 Tick"
            className="flex items-center gap-1 rounded border border-[#1b2a38] bg-[#0c1824] px-2.5 py-1 text-[#e0edf5] transition hover:border-[#00e5c8]"
          >
            <span>⏭</span> STEP
          </button>

          <button
            onClick={() => resetSimulation()}
            title="Reset to Initial Nominal State"
            className="flex items-center gap-1 rounded border border-[#1b2a38] bg-[#0c1824] px-2.5 py-1 text-[#5a7a8f] transition hover:border-[#d9383a] hover:text-[#ff6b6b]"
          >
            <span>↺</span> RESET
          </button>

          {/* Speed Selector */}
          <div className="ml-2 flex items-center rounded border border-[#1b2a38] bg-[#050a12] p-0.5">
            {speeds.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded px-2 py-0.5 text-[10px] font-semibold transition ${
                  clock.speed === s
                    ? 'bg-[#00e5c8] text-[#050a12]'
                    : 'text-[#5a7a8f] hover:text-[#e0edf5]'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        {/* Timeline Progress Scrubber */}
        <div className="flex flex-1 items-center gap-3 px-4">
          <span className="text-[10px] text-[#5a7a8f]">TICK {clock.tick}</span>
          <div className="relative h-2 flex-1 rounded-full bg-[#0c1824]">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-[#00e5c8] to-[#3a86ff] transition-all"
              style={{ width: `${Math.min(100, (clock.tick % 500) / 5)}%` }}
            />
          </div>
          <span className="text-[11px] font-bold text-[#a0c4d8]">{simTime}</span>
        </div>

        {/* Quick KPI pills */}
        <div className="flex items-center gap-2 text-[10px]">
          <div className="rounded border border-[#1b2a38] bg-[#09131f] px-2 py-1">
            <span className="text-[#5a7a8f]">LOAD: </span>
            <span className="font-bold text-[#e0edf5]">
              {metrics.totalDemandMW.toFixed(0)} MW
            </span>
          </div>
          <div className="rounded border border-[#1b2a38] bg-[#09131f] px-2 py-1">
            <span className="text-[#5a7a8f]">GEN: </span>
            <span className="font-bold text-[#e0edf5]">
              {metrics.totalGenerationMW.toFixed(0)} MW
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
