'use client';

import { useVajraStore } from '@/store/vajraStore';
import Panel from '@/components/ui/Panel';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from 'recharts';

// ─── Gen vs Demand chart ─────────────────────────────────────────────

function GenDemandChart() {
  const generation = useVajraStore((s) => s.timeSeries.generation);
  const demand = useVajraStore((s) => s.timeSeries.demand);
  const unserved = useVajraStore((s) => s.timeSeries.unservedLoad);

  const data = generation.map((g, i) => ({
    time: g.timestamp,
    generation: g.value,
    demand: demand[i]?.value ?? 0,
    unserved: unserved[i]?.value ?? 0,
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-1 text-[11px] text-[#5a7a8f]">
        <span>Simulation engine not initialized</span>
      </div>
    );
  }

  // If only 1 sample exists (tick 0), render clean baseline bar/card or repeat point for area render
  const chartData = data.length === 1 ? [data[0], { ...data[0], time: `${data[0].time} (t0)` }] : data;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a3348" />
        <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#5a7a8f' }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: '#5a7a8f' }} width={40} />
        <Tooltip
          contentStyle={{ background: '#0d1a2a', border: '1px solid #1a3348', fontSize: 10 }}
          labelStyle={{ color: '#5a7a8f' }}
        />
        <Area
          type="monotone"
          dataKey="generation"
          stroke="#00e5c8"
          fill="#00e5c8"
          fillOpacity={0.1}
          strokeWidth={1.5}
          name="Generation (MW)"
          dot={chartData.length <= 2}
        />
        <Area
          type="monotone"
          dataKey="demand"
          stroke="#3b9eff"
          fill="#3b9eff"
          fillOpacity={0.05}
          strokeWidth={1.5}
          name="Demand (MW)"
          dot={chartData.length <= 2}
        />
        <Area
          type="monotone"
          dataKey="unserved"
          stroke="#ff3b5c"
          fill="#ff3b5c"
          fillOpacity={0.15}
          strokeWidth={1}
          name="Unserved (MW)"
          dot={chartData.length <= 2}
        />
        <Legend
          verticalAlign="top"
          height={20}
          iconSize={8}
          wrapperStyle={{ fontSize: 9, color: '#5a7a8f' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Frequency chart ─────────────────────────────────────────────────

function FrequencyChart() {
  const frequency = useVajraStore((s) => s.timeSeries.frequency);

  const data = frequency.map((f) => ({
    time: f.timestamp,
    frequency: f.value,
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center text-[11px] text-[#5a7a8f]">
        No frequency telemetry recorded
      </div>
    );
  }

  const chartData = data.length === 1 ? [data[0], { ...data[0], time: `${data[0].time} (t0)` }] : data;

  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a3348" />
        <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#5a7a8f' }} interval="preserveStartEnd" />
        <YAxis
          domain={[49, 51]}
          tick={{ fontSize: 9, fill: '#5a7a8f' }}
          width={35}
        />
        <Tooltip
          contentStyle={{ background: '#0d1a2a', border: '1px solid #1a3348', fontSize: 10 }}
        />
        <Line
          type="monotone"
          dataKey="frequency"
          stroke="#f5a623"
          strokeWidth={1.5}
          name="Frequency (Hz)"
          dot={chartData.length <= 2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Battery SOC + Line Loading chart ─────────────────────────────────

function BatteryLoadingChart() {
  const batterySOC = useVajraStore((s) => s.timeSeries.batterySOC);
  const lineLoading = useVajraStore((s) => s.timeSeries.lineLoading);

  const data = batterySOC.map((b, i) => ({
    time: b.timestamp,
    batterySoc: b.value,
    maxLineLoading: lineLoading[i]?.value ?? 0,
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-[140px] items-center justify-center text-[11px] text-[#5a7a8f]">
        No loading telemetry recorded
      </div>
    );
  }

  const chartData = data.length === 1 ? [data[0], { ...data[0], time: `${data[0].time} (t0)` }] : data;

  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1a3348" />
        <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#5a7a8f' }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9, fill: '#5a7a8f' }} width={35} domain={[0, 'auto']} />
        <Tooltip
          contentStyle={{ background: '#0d1a2a', border: '1px solid #1a3348', fontSize: 10 }}
        />
        <Line
          type="monotone"
          dataKey="batterySoc"
          stroke="#00d68f"
          strokeWidth={1.5}
          name="Battery SOC (%)"
          dot={chartData.length <= 2}
        />
        <Line
          type="monotone"
          dataKey="maxLineLoading"
          stroke="#ff3b5c"
          strokeWidth={1.5}
          name="Max Line Load (%)"
          dot={chartData.length <= 2}
          strokeDasharray="4 2"
        />
        <Legend
          verticalAlign="top"
          height={20}
          iconSize={8}
          wrapperStyle={{ fontSize: 9, color: '#5a7a8f' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Export combined charts panel ─────────────────────────────────────

function ProvenanceBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-purple-950/80 px-2 py-0.5 text-[9px] font-medium text-purple-300 border border-purple-800/50">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-purple-400" />
      PURPLE: SIMULATED (VAJRA KERNEL)
    </span>
  );
}

export default function ChartsPanel() {
  const pointsCount = useVajraStore((s) => s.timeSeries.generation.length);

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title="Generation vs Demand"
        accent="cyan"
        action={
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#5a7a8f]">{pointsCount} sample{pointsCount === 1 ? '' : 's'}</span>
            <ProvenanceBadge />
          </div>
        }
      >
        <GenDemandChart />
      </Panel>
      <div className="grid grid-cols-2 gap-3">
        <Panel
          title="System Frequency"
          accent="amber"
          action={<ProvenanceBadge />}
        >
          <FrequencyChart />
        </Panel>
        <Panel
          title="Battery & Line Loading"
          accent="green"
          action={<ProvenanceBadge />}
        >
          <BatteryLoadingChart />
        </Panel>
      </div>
    </div>
  );
}
