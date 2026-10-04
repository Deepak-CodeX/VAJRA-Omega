'use client';

import { useVajraStore } from '@/store/vajraStore';
import Panel from '@/components/ui/Panel';

export default function PowerMixPanel() {
  const powerBalance = useVajraStore((s) => s.powerBalance);
  const metrics = useVajraStore((s) => s.metrics);

  const totalGen = metrics.totalGenerationMW || 1; // avoid /0
  const solarPct = (powerBalance.solarGenerationMW / totalGen) * 100;
  const windPct = (powerBalance.windGenerationMW / totalGen) * 100;
  const thermalPct = (powerBalance.thermalGenerationMW / totalGen) * 100;

  const bars = [
    { label: 'Solar', value: powerBalance.solarGenerationMW, pct: solarPct, color: '#f5a623' },
    { label: 'Wind', value: powerBalance.windGenerationMW, pct: windPct, color: '#3b9eff' },
    { label: 'Thermal', value: powerBalance.thermalGenerationMW, pct: thermalPct, color: '#ff3b5c' },
  ];

  return (
    <Panel title="Generation Mix" accent="cyan">
      <div className="flex flex-col gap-3">
        {/* Stacked bar */}
        <div className="flex h-3 w-full overflow-hidden rounded-sm bg-[#050a12]">
          {bars.map((b) => (
            <div
              key={b.label}
              style={{
                width: `${Math.max(b.pct, 0)}%`,
                backgroundColor: b.color,
                transition: 'width 300ms ease',
              }}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-col gap-1.5">
          {bars.map((b) => (
            <div key={b.label} className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: b.color }}
                />
                <span className="text-[#5a7a8f]">{b.label}</span>
              </div>
              <div className="flex items-center gap-2 tabular-nums">
                <span className="text-[#e0edf5]">{b.value.toFixed(1)} MW</span>
                <span className="text-[#3a5568]">({b.pct.toFixed(0)}%)</span>
              </div>
            </div>
          ))}
        </div>

        {/* Battery flow */}
        <div className="mt-1 flex items-center justify-between border-t border-[#1a3348]/40 pt-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-[#00d68f]" />
            <span className="text-[#5a7a8f]">
              Battery {powerBalance.totalBatteryFlowMW >= 0 ? '(discharging)' : '(charging)'}
            </span>
          </div>
          <span className="tabular-nums text-[#e0edf5]">
            {Math.abs(powerBalance.totalBatteryFlowMW).toFixed(1)} MW
          </span>
        </div>

        {/* Losses */}
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-[#5a7a8f]">Transmission Losses</span>
          <span className="tabular-nums text-[#3a5568]">
            {powerBalance.totalLossesMW.toFixed(1)} MW
          </span>
        </div>
      </div>
    </Panel>
  );
}
