'use client';

import { useVajraStore } from '@/store/vajraStore';

interface KpiCardProps {
  label: string;
  value: string;
  unit?: string;
  /** Color token for the value */
  color?: string;
  /** Optional sub-label (e.g. capacity info) */
  sub?: string;
  /** Status indicator: normal, warning, critical */
  status?: 'normal' | 'warning' | 'critical';
}

function KpiCard({ label, value, unit, color = '#e0edf5', sub, status = 'normal' }: KpiCardProps) {
  const statusColor =
    status === 'critical' ? '#ff3b5c' : status === 'warning' ? '#f5a623' : '#1a3348';

  return (
    <div
      className="flex flex-col gap-1 rounded border bg-[#0a1220]/80 px-3 py-2"
      style={{ borderColor: statusColor }}
    >
      <span className="text-[8px] uppercase tracking-[0.2em] text-[#5a7a8f]">{label}</span>
      <div className="flex items-baseline gap-1">
        <span
          className="font-mono text-lg font-bold tabular-nums leading-none"
          style={{ color }}
        >
          {value}
        </span>
        {unit && <span className="text-[9px] text-[#5a7a8f]">{unit}</span>}
      </div>
      {sub && <span className="text-[8px] text-[#3a5568]">{sub}</span>}
    </div>
  );
}

export default function KpiBar() {
  const metrics = useVajraStore((s) => s.metrics);
  const powerBalance = useVajraStore((s) => s.powerBalance);

  // Determine statuses
  const freqStatus: 'normal' | 'warning' | 'critical' =
    metrics.frequencyDeviationHz >= 0.5
      ? 'critical'
      : metrics.frequencyDeviationHz >= 0.2
        ? 'warning'
        : 'normal';

  const voltStatus: 'normal' | 'warning' | 'critical' =
    metrics.voltageHealthIndex < 0.9
      ? 'critical'
      : metrics.voltageHealthIndex < 0.95
        ? 'warning'
        : 'normal';

  const loadStatus: 'normal' | 'warning' | 'critical' =
    metrics.loadServedPercent < 80
      ? 'critical'
      : metrics.loadServedPercent < 95
        ? 'warning'
        : 'normal';

  return (
    <div className="grid grid-cols-4 gap-2 xl:grid-cols-8">
      <KpiCard
        label="Generation"
        value={metrics.totalGenerationMW.toFixed(1)}
        unit="MW"
        color="#00e5c8"
        sub={`${powerBalance.renewableFraction > 0 ? (powerBalance.renewableFraction * 100).toFixed(0) : '0'}% renewable`}
      />
      <KpiCard
        label="Demand"
        value={metrics.totalDemandMW.toFixed(1)}
        unit="MW"
        color="#3b9eff"
        sub={`${metrics.unservedLoadMW.toFixed(1)} MW unserved`}
      />
      <KpiCard
        label="Load Served"
        value={metrics.loadServedPercent.toFixed(1)}
        unit="%"
        color={loadStatus === 'critical' ? '#ff3b5c' : loadStatus === 'warning' ? '#f5a623' : '#00d68f'}
        status={loadStatus}
      />
      <KpiCard
        label="Frequency"
        value={metrics.systemFrequencyHz.toFixed(2)}
        unit="Hz"
        color={freqStatus === 'critical' ? '#ff3b5c' : freqStatus === 'warning' ? '#f5a623' : '#e0edf5'}
        sub={`±${metrics.frequencyDeviationHz.toFixed(3)} Hz`}
        status={freqStatus}
      />
      <KpiCard
        label="Voltage Index"
        value={metrics.voltageHealthIndex.toFixed(3)}
        unit="PU"
        color={voltStatus === 'critical' ? '#ff3b5c' : voltStatus === 'warning' ? '#f5a623' : '#e0edf5'}
        status={voltStatus}
      />
      <KpiCard
        label="Battery SOC"
        value={metrics.avgBatterySOCPercent.toFixed(1)}
        unit="%"
        color="#f5a623"
      />
      <KpiCard
        label="Failed Assets"
        value={String(metrics.failedAssetCount)}
        color={metrics.failedAssetCount > 0 ? '#ff3b5c' : '#00d68f'}
        status={metrics.failedAssetCount > 0 ? 'critical' : 'normal'}
      />
      <KpiCard
        label="Affected Users"
        value={metrics.affectedConsumers.toLocaleString()}
        color={metrics.affectedConsumers > 0 ? '#ff3b5c' : '#00d68f'}
        status={metrics.affectedConsumers > 0 ? 'critical' : 'normal'}
      />
    </div>
  );
}
