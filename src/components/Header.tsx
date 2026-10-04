'use client';

import { useVajraStore } from '@/store/vajraStore';
import type { SimulationSpeed } from '@/types';

const SPEEDS: SimulationSpeed[] = [0.5, 1, 2, 5, 10];

export default function Header() {
  const clock = useVajraStore((s) => s.clock);
  const initialized = useVajraStore((s) => s.initialized);
  const activeScenario = useVajraStore((s) => s.activeScenario);
  const metrics = useVajraStore((s) => s.metrics);
  const initialize = useVajraStore((s) => s.initialize);
  const start = useVajraStore((s) => s.start);
  const pause = useVajraStore((s) => s.pause);
  const reset = useVajraStore((s) => s.reset);
  const setSpeed = useVajraStore((s) => s.setSpeed);
  const tick = useVajraStore((s) => s.tick);

  // Compute time display from tick
  const hours = Math.floor(clock.tick / 3600) + 6; // start at 06:00
  const minutes = Math.floor((clock.tick % 3600) / 60);
  const seconds = clock.tick % 60;
  const timeStr = `${String(hours % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Overall system health indicator
  const healthColor =
    metrics.failedAssetCount > 0
      ? '#ff3b5c'
      : metrics.frequencyDeviationHz > 0.3
        ? '#f5a623'
        : '#00e5c8';

  return (
    <header className="flex items-center justify-between border-b border-[#1a3348] bg-[#0a1220]/90 px-4 py-2 backdrop-blur-sm">
      {/* ─── Left: Logo + Status ─────────────────────────── */}
      <div className="flex items-center gap-4">
        {/* Pulsing health dot */}
        <div className="flex items-center gap-2.5">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{
              backgroundColor: healthColor,
              boxShadow: `0 0 8px ${healthColor}`,
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
          <div className="flex flex-col">
            <span className="text-[11px] font-bold tracking-[0.3em] text-[#00e5c8]">
              VAJRA-&#937;
            </span>
            <span className="text-[8px] tracking-[0.15em] text-[#5a7a8f]">
              POWER GRID DIGITAL TWIN
            </span>
          </div>
        </div>

        {/* Scenario badge */}
        {activeScenario && activeScenario !== 'NORMAL_OPERATION' && (
          <div className="flex items-center gap-1.5 rounded border border-[#f5a623]/30 bg-[#f5a623]/10 px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f5a623]" />
            <span className="text-[9px] tracking-wider text-[#f5a623]">
              {activeScenario.replace(/_/g, ' ')}
            </span>
          </div>
        )}
      </div>

      {/* ─── Center: Simulation Clock ────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 rounded border border-[#1a3348] bg-[#050a12] px-3 py-1">
          <span className="text-[9px] text-[#5a7a8f]">SIM</span>
          <span className="font-mono text-sm font-semibold text-[#00e5c8] tabular-nums">
            {timeStr}
          </span>
          <span className="text-[9px] text-[#3a5568]">
            T+{clock.tick.toLocaleString()}
          </span>
        </div>

        {/* Speed selector */}
        <div className="flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
                clock.speed === s
                  ? 'bg-[#00e5c8]/20 text-[#00e5c8]'
                  : 'text-[#5a7a8f] hover:bg-[#1a3348] hover:text-[#e0edf5]'
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* ─── Right: Controls ─────────────────────────────── */}
      <div className="flex items-center gap-2">
        {!initialized && (
          <button
            onClick={() => initialize(42)}
            className="rounded border border-[#00e5c8]/40 bg-[#00e5c8]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#00e5c8] hover:bg-[#00e5c8]/20"
          >
            Initialize
          </button>
        )}
        {initialized && !clock.isRunning && (
          <button
            onClick={start}
            className="rounded border border-[#00d68f]/40 bg-[#00d68f]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#00d68f] hover:bg-[#00d68f]/20"
          >
            &#9654; Run
          </button>
        )}
        {initialized && clock.isRunning && (
          <button
            onClick={pause}
            className="rounded border border-[#f5a623]/40 bg-[#f5a623]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#f5a623] hover:bg-[#f5a623]/20"
          >
            &#10074;&#10074; Pause
          </button>
        )}
        {initialized && !clock.isRunning && (
          <button
            onClick={tick}
            className="rounded border border-[#3b9eff]/40 bg-[#3b9eff]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#3b9eff] hover:bg-[#3b9eff]/20"
          >
            Step
          </button>
        )}
        {initialized && (
          <button
            onClick={reset}
            className="rounded border border-[#ff3b5c]/40 bg-[#ff3b5c]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#ff3b5c] hover:bg-[#ff3b5c]/20"
          >
            Reset
          </button>
        )}
      </div>
    </header>
  );
}
