'use client';

import { useState } from 'react';
import { useVajraStore } from '@/store/vajraStore';
import { getAllScenarios } from '@/simulation/scenarios/scenarios';
import Panel from '@/components/ui/Panel';
import type { ScenarioId, FailureType } from '@/types';

const SCENARIO_SEVERITY: Record<ScenarioId, { label: string; color: string; bg: string }> = {
  NORMAL_OPERATION: { label: 'BASELINE', color: '#00d68f', bg: 'rgba(0, 214, 143, 0.1)' },
  SUBSTATION_FAILURE: { label: 'CRITICAL', color: '#ff3b5c', bg: 'rgba(255, 59, 92, 0.1)' },
  TRANSMISSION_FAILURE: { label: 'HIGH', color: '#ff3b5c', bg: 'rgba(255, 59, 92, 0.1)' },
  RENEWABLE_DROP: { label: 'MODERATE', color: '#f5a623', bg: 'rgba(245, 166, 35, 0.1)' },
  EXTREME_DEMAND: { label: 'HIGH', color: '#f5a623', bg: 'rgba(245, 166, 35, 0.1)' },
  EV_SURGE: { label: 'MODERATE', color: '#3b9eff', bg: 'rgba(59, 158, 255, 0.1)' },
  BATTERY_UNAVAILABLE: { label: 'HIGH', color: '#ff3b5c', bg: 'rgba(255, 59, 92, 0.1)' },
  MULTI_FAULT_CASCADE: { label: 'CATASTROPHIC', color: '#ff3b5c', bg: 'rgba(255, 59, 92, 0.2)' },
};

const FAULT_OPTIONS: { type: FailureType; label: string; desc: string; icon: string }[] = [
  { type: 'SUBSTATION_FAILURE', label: 'Trip Substation', desc: 'Isolates 1 transmission hub & downline feeders', icon: '⚡' },
  { type: 'LINE_FAILURE', label: 'Trip Line', desc: 'Forces flow redistribution via parallel links', icon: '〰' },
  { type: 'GENERATOR_OUTAGE', label: 'Generator Trip', desc: 'Drops primary thermal/renewable generation', icon: '⚙' },
  { type: 'SOLAR_COLLAPSE', label: 'Solar Collapse', desc: 'Zeroes out solar farms across region', icon: '☀' },
  { type: 'DEMAND_SPIKE', label: 'Demand Surge', desc: '+50% load spike across all sectors', icon: '📈' },
  { type: 'BATTERY_FAILURE', label: 'BESS Outage', desc: 'Removes battery buffer capacity', icon: '🔋' },
];

export default function ScenarioSelector() {
  const activeScenario = useVajraStore((s) => s.activeScenario);
  const activateScenario = useVajraStore((s) => s.activateScenario);
  const injectFault = useVajraStore((s) => s.injectFault);
  const failures = useVajraStore((s) => s.failures);
  const initialized = useVajraStore((s) => s.initialized);

  const [selectedId, setSelectedId] = useState<ScenarioId>('NORMAL_OPERATION');
  const scenarios = getAllScenarios();
  const selectedScenario = scenarios.find((s) => s.id === selectedId) || scenarios[0];
  const unresolvedFailures = failures.filter((f) => !f.resolved);

  const handleActivate = () => {
    activateScenario(selectedId);
  };

  const handleInjectFault = (type: FailureType) => {
    injectFault(type);
  };

  return (
    <Panel title="Scenario & Fault Lab" accent="amber">
      <div className="flex flex-col gap-3">
        {/* Scenario Selection Header */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-[9px] uppercase tracking-wider text-[#5a7a8f]">Simulation Scenario</span>
            {activeScenario && (
              <span
                className="rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider"
                style={{
                  color: SCENARIO_SEVERITY[activeScenario]?.color || '#00e5c8',
                  backgroundColor: SCENARIO_SEVERITY[activeScenario]?.bg || 'rgba(0, 229, 200, 0.1)',
                }}
              >
                Active: {activeScenario.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value as ScenarioId)}
              className="flex-1 rounded border border-[#1a3348] bg-[#050a12] px-2.5 py-1.5 text-[11px] text-[#e0edf5] outline-none transition focus:border-[#00e5c8]"
            >
              {scenarios.map((sc) => (
                <option key={sc.id} value={sc.id} className="bg-[#0d1a2a] text-[#e0edf5]">
                  {sc.name} ({SCENARIO_SEVERITY[sc.id]?.label || 'INFO'})
                </option>
              ))}
            </select>

            <button
              onClick={handleActivate}
              disabled={!initialized}
              className="rounded border border-[#f5a623]/60 bg-[#f5a623]/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#f5a623] transition-all hover:bg-[#f5a623]/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Load Scenario
            </button>
          </div>
        </div>

        {/* Selected Scenario Details Card */}
        {selectedScenario && (
          <div className="rounded border border-[#1a3348]/60 bg-[#050a12]/80 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#e0edf5]">{selectedScenario.name}</span>
              <span
                className="rounded px-1.5 py-0.5 text-[8px] font-bold"
                style={{
                  color: SCENARIO_SEVERITY[selectedScenario.id]?.color,
                  backgroundColor: SCENARIO_SEVERITY[selectedScenario.id]?.bg,
                }}
              >
                {SCENARIO_SEVERITY[selectedScenario.id]?.label}
              </span>
            </div>
            <p className="mt-1 text-[9px] leading-relaxed text-[#5a7a8f]">{selectedScenario.description}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {selectedScenario.failures.length === 0 ? (
                <span className="rounded bg-[#00d68f]/10 px-1.5 py-0.5 text-[8px] text-[#00d68f]">
                  No faults (Normal Grid)
                </span>
              ) : (
                selectedScenario.failures.map((f, i) => (
                  <span
                    key={i}
                    className="rounded border border-[#ff3b5c]/30 bg-[#ff3b5c]/10 px-1.5 py-0.5 text-[8px] font-mono text-[#ff3b5c]"
                  >
                    {f.replace(/_/g, ' ')}
                  </span>
                ))
              )}
            </div>
          </div>
        )}

        {/* Real-Time Fault Injection Toolbar */}
        <div className="border-t border-[#1a3348]/60 pt-2.5">
          <div className="mb-2 flex items-center justify-between text-[10px]">
            <span className="text-[9px] uppercase tracking-wider text-[#5a7a8f]">Inject Fault (Live State)</span>
            <span className="font-mono text-[9px] text-[#ff3b5c]">
              {unresolvedFailures.length} unresolved {unresolvedFailures.length === 1 ? 'fault' : 'faults'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {FAULT_OPTIONS.map((f) => (
              <button
                key={f.type}
                onClick={() => handleInjectFault(f.type)}
                disabled={!initialized}
                title={f.desc}
                className="group flex flex-col items-start rounded border border-[#1a3348] bg-[#0a1220]/70 p-1.5 text-left transition hover:border-[#ff3b5c]/60 hover:bg-[#ff3b5c]/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <div className="flex w-full items-center justify-between">
                  <span className="text-[10px]">{f.icon}</span>
                  <span className="text-[8px] uppercase tracking-wider text-[#3a5568] group-hover:text-[#ff3b5c]">
                    Fault
                  </span>
                </div>
                <span className="mt-1 font-mono text-[9px] font-medium text-[#e0edf5] group-hover:text-[#ff3b5c]">
                  {f.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
