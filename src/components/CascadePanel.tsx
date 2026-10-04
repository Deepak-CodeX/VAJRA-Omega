'use client';

import React, { useState } from 'react';
import { useVajraStore } from '@/store/vajraStore';
import Panel from '@/components/ui/Panel';
import type { FailureType, CascadeStep, CascadeStatus } from '@/types';

const STATUS_CONFIG: Record<CascadeStatus, { label: string; color: string; bg: string; border: string }> = {
  READY: {
    label: 'READY',
    color: '#3b9eff',
    bg: 'rgba(59, 158, 255, 0.1)',
    border: 'rgba(59, 158, 255, 0.3)',
  },
  PROPAGATING: {
    label: 'PROPAGATING',
    color: '#ff3b5c',
    bg: 'rgba(255, 59, 92, 0.15)',
    border: 'rgba(255, 59, 92, 0.4)',
  },
  STABILIZED: {
    label: 'STABILIZED',
    color: '#00d68f',
    bg: 'rgba(0, 214, 143, 0.12)',
    border: 'rgba(0, 214, 143, 0.35)',
  },
  RESOLVED: {
    label: 'RESOLVED',
    color: '#00e5c8',
    bg: 'rgba(0, 229, 200, 0.12)',
    border: 'rgba(0, 229, 200, 0.35)',
  },
  COLLAPSED: {
    label: 'COLLAPSED',
    color: '#ff1744',
    bg: 'rgba(255, 23, 68, 0.2)',
    border: 'rgba(255, 23, 68, 0.5)',
  },
};

const ACTION_BADGES: Record<string, { label: string; color: string; bg: string }> = {
  INITIAL_FAILURE: { label: 'INITIAL FAULT', color: '#ff3b5c', bg: 'rgba(255, 59, 92, 0.15)' },
  LINE_OVERLOAD: { label: 'OVERLOAD', color: '#f5a623', bg: 'rgba(245, 166, 35, 0.15)' },
  LINE_TRIP: { label: 'LINE TRIP', color: '#ff1744', bg: 'rgba(255, 23, 68, 0.18)' },
  ISOLATE_LOAD: { label: 'LOAD ISOLATED', color: '#bd93f9', bg: 'rgba(189, 147, 249, 0.15)' },
  REDISTRIBUTE_FLOW: { label: 'REDISTRIBUTION', color: '#3b9eff', bg: 'rgba(59, 158, 255, 0.15)' },
  CASCADE_STABILIZED: { label: 'STABILIZED', color: '#00d68f', bg: 'rgba(0, 214, 143, 0.15)' },
};

const TRIGGER_PRESETS: { type: FailureType; label: string; desc: string }[] = [
  { type: 'SUBSTATION_FAILURE', label: 'Substation Fault', desc: 'Fails transmission substation S01' },
  { type: 'LINE_FAILURE', label: 'Line Trip', desc: 'Trips most loaded transmission corridor' },
  { type: 'GENERATOR_OUTAGE', label: 'Generator Loss', desc: 'Simulates sudden generation loss' },
  { type: 'SOLAR_COLLAPSE', label: 'Renewable Drop', desc: 'Drops solar output to ~5%' },
  { type: 'DEMAND_SPIKE', label: 'Demand Surge', desc: 'Heatwave 150% demand overload' },
];

export default function CascadePanel() {
  const activeCascade = useVajraStore((s) => s.activeCascade);
  const activeCascadeStepIndex = useVajraStore((s) => s.activeCascadeStepIndex ?? 0);
  const isCascadeRunning = useVajraStore((s) => s.isCascadeRunning ?? false);
  const metrics = useVajraStore((s) => s.metrics);
  const initialized = useVajraStore((s) => s.initialized);

  const advanceCascadeStep = useVajraStore((s) => s.advanceCascadeStep);
  const runCascadeAuto = useVajraStore((s) => s.runCascadeAuto);
  const pauseCascade = useVajraStore((s) => s.pauseCascade);
  const resetCascade = useVajraStore((s) => s.resetCascade);
  const selectCascadeStep = useVajraStore((s) => s.selectCascadeStep);
  const initiateCascade = useVajraStore((s) => s.initiateCascade);

  const [selectedTrigger, setSelectedTrigger] = useState<FailureType>('SUBSTATION_FAILURE');
  const [inspectedStepIndex, setInspectedStepIndex] = useState<number | null>(null);

  const status: CascadeStatus = activeCascade?.status ?? 'READY';
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.READY;

  const steps = activeCascade?.steps ?? [];
  const depth = activeCascade?.depth ?? (steps.length > 0 ? steps.length - 1 : 0);
  const maxOverload = activeCascade?.maxOverloadPercent ?? metrics.maxLineLoadingPercent;
  const unservedMW = activeCascade?.totalUnservedLoadMW ?? metrics.unservedLoadMW;
  const affectedConsumers = activeCascade?.affectedConsumers ?? metrics.affectedConsumers;
  const criticalLoads = activeCascade?.criticalLoadsAffected ?? 0;
  const stability = activeCascade?.stabilityIndex ?? 1.0;

  const canAdvance = initialized && status !== 'STABILIZED' && status !== 'COLLAPSED';

  const handleStepClick = (index: number) => {
    setInspectedStepIndex(index === inspectedStepIndex ? null : index);
    selectCascadeStep(index);
  };

  const handleStartStressTest = () => {
    initiateCascade(selectedTrigger);
  };

  return (
    <Panel title="Cascade Propagation Engine" accent="amber">
      <div className="flex flex-col gap-3">
        {/* Status Header & Controls */}
        <div className="flex flex-col gap-2 rounded border border-[#1b2a38] bg-[#0c1319] p-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-wider text-[#5a7a8f]">Cascade State:</span>
              <span
                className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
                style={{
                  color: statusCfg.color,
                  backgroundColor: statusCfg.bg,
                  border: `1px solid ${statusCfg.border}`,
                }}
              >
                {status === 'PROPAGATING' && (
                  <span className="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-[#ff3b5c]" />
                )}
                {statusCfg.label}
              </span>
            </div>

            <div className="font-mono text-[9px] text-[#5a7a8f]">
              Depth: <span className="font-bold text-[#f5a623]">{depth}</span>
            </div>
          </div>

          {/* Interactive Step-by-Step Operator Toolbar */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            <button
              onClick={advanceCascadeStep}
              disabled={!canAdvance}
              title="Advance one discrete failure propagation step"
              className="flex items-center justify-center gap-1 rounded border border-[#f5a623]/60 bg-[#f5a623]/10 px-2 py-1.5 font-mono text-[10px] font-semibold text-[#f5a623] transition hover:bg-[#f5a623]/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <span>▶|</span> Step
            </button>

            {isCascadeRunning ? (
              <button
                onClick={pauseCascade}
                className="flex items-center justify-center gap-1 rounded border border-[#ff3b5c]/60 bg-[#ff3b5c]/15 px-2 py-1.5 font-mono text-[10px] font-semibold text-[#ff3b5c] transition hover:bg-[#ff3b5c]/25 active:scale-95"
              >
                <span>❚❚</span> Pause
              </button>
            ) : (
              <button
                onClick={runCascadeAuto}
                disabled={!initialized}
                className="flex items-center justify-center gap-1 rounded border border-[#00d68f]/60 bg-[#00d68f]/10 px-2 py-1.5 font-mono text-[10px] font-semibold text-[#00d68f] transition hover:bg-[#00d68f]/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <span>▶▶</span> Auto
              </button>
            )}

            <button
              onClick={resetCascade}
              disabled={!initialized || (!activeCascade && metrics.failedAssetCount === 0)}
              title="Reset cascade and restore pre-fault topology"
              className="flex items-center justify-center gap-1 rounded border border-[#5a7a8f]/40 bg-[#14202b] px-2 py-1.5 font-mono text-[10px] font-medium text-[#88a4b8] transition hover:border-[#5a7a8f] hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <span>↺</span> Reset
            </button>

            <button
              onClick={handleStartStressTest}
              disabled={!initialized}
              title="Initiate cascade failure with chosen trigger"
              className="flex items-center justify-center gap-1 rounded border border-[#ff3b5c]/60 bg-[#ff3b5c]/10 px-2 py-1.5 font-mono text-[10px] font-semibold text-[#ff3b5c] transition hover:bg-[#ff3b5c]/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <span>⚡</span> Trigger
            </button>
          </div>

          {/* Trigger Failure Selector */}
          <div className="flex items-center gap-2 pt-1 border-t border-[#1b2a38]/60">
            <span className="text-[9px] uppercase tracking-wider text-[#5a7a8f] whitespace-nowrap">Fault Trigger:</span>
            <select
              value={selectedTrigger}
              onChange={(e) => setSelectedTrigger(e.target.value as FailureType)}
              className="w-full rounded border border-[#1b2a38] bg-[#080d12] px-2 py-1 font-mono text-[9px] text-[#e0e8f0] focus:border-[#f5a623] focus:outline-none"
            >
              {TRIGGER_PRESETS.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label} — {t.desc}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Real-time Cascade Metrics Matrix */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded border border-[#1b2a38] bg-[#0c1319] p-2">
            <div className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Max Line Load</div>
            <div
              className={`font-mono text-[12px] font-bold ${
                maxOverload >= 120 ? 'text-[#ff1744]' : maxOverload >= 100 ? 'text-[#f5a623]' : 'text-[#00e5c8]'
              }`}
            >
              {maxOverload.toFixed(1)}%
            </div>
            <div className="text-[8px] text-[#3a5568]">Trip: &gt;120%</div>
          </div>

          <div className="rounded border border-[#1b2a38] bg-[#0c1319] p-2">
            <div className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Unserved Load</div>
            <div className="font-mono text-[12px] font-bold text-[#ff3b5c]">
              {unservedMW.toFixed(1)} <span className="text-[9px] font-normal text-[#5a7a8f]">MW</span>
            </div>
            <div className="text-[8px] text-[#3a5568]">{affectedConsumers.toLocaleString()} users</div>
          </div>

          <div className="rounded border border-[#1b2a38] bg-[#0c1319] p-2">
            <div className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Grid Stability</div>
            <div
              className={`font-mono text-[12px] font-bold ${
                stability >= 0.85 ? 'text-[#00d68f]' : stability >= 0.5 ? 'text-[#f5a623]' : 'text-[#ff1744]'
              }`}
            >
              {(stability * 100).toFixed(0)}%
            </div>
            <div className="text-[8px] text-[#3a5568]">{criticalLoads} crit loads lost</div>
          </div>
        </div>

        {/* Dynamic Cascade Propagation Timeline */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-[#5a7a8f]">
              Cascade Timeline ({steps.length} Events)
            </span>
            <span className="text-[8px] text-[#3a5568]">Click step to inspect</span>
          </div>

          {steps.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded border border-dashed border-[#1b2a38] bg-[#0c1319]/50 py-6 text-center">
              <span className="text-xl">⚡</span>
              <div className="mt-1 font-mono text-[10px] text-[#5a7a8f]">No active cascade propagation</div>
              <div className="text-[9px] text-[#3a5568] max-w-[240px] mt-0.5">
                Trigger a fault or click &ldquo;Step&rdquo; to simulate dynamic redistribution and thermal trip propagation.
              </div>
            </div>
          ) : (
            <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1">
              {steps.map((step, idx) => {
                const actionBadge = ACTION_BADGES[step.action ?? ''] || {
                  label: step.action ?? 'EVENT',
                  color: '#5a7a8f',
                  bg: 'rgba(90, 122, 143, 0.1)',
                };
                const isSelected = inspectedStepIndex === idx || activeCascadeStepIndex === idx;
                const timeLabel = `T+${(idx * 1.2).toFixed(1)}s`;

                return (
                  <div
                    key={`${step.triggerAssetId}-${idx}`}
                    onClick={() => handleStepClick(idx)}
                    className={`cursor-pointer rounded border p-2 transition ${
                      isSelected
                        ? 'border-[#f5a623] bg-[#1a1f26]'
                        : 'border-[#1b2a38] bg-[#0c1319] hover:border-[#2a4055]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[9px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-[#f5a623]">{timeLabel}</span>
                        <span
                          className="rounded px-1 py-0.2 font-mono text-[8px] font-bold uppercase tracking-wider"
                          style={{ color: actionBadge.color, backgroundColor: actionBadge.bg }}
                        >
                          {actionBadge.label}
                        </span>
                      </div>
                      <span className="font-mono text-[8px] text-[#5a7a8f]">Step #{idx}</span>
                    </div>

                    <div className="mt-1 font-mono text-[10px] font-medium text-[#e0e8f0]">
                      {step.triggerAssetName ?? step.triggerAssetId}{' '}
                      <span className="text-[#5a7a8f]">→</span>{' '}
                      <span className="text-[#88a4b8]">{step.affectedAssetName ?? step.affectedAssetId}</span>
                    </div>

                    <div className="mt-0.5 text-[9px] text-[#88a4b8] leading-tight">
                      {step.triggerReason}
                    </div>

                    <div className="mt-1 flex items-center justify-between border-t border-[#1b2a38]/60 pt-1 font-mono text-[8px] text-[#5a7a8f]">
                      <div>
                        Load:{' '}
                        <span className="text-[#88a4b8]">
                          {step.loadingBefore ? `${step.loadingBefore.toFixed(1)}%` : '—'}
                        </span>{' '}
                        →{' '}
                        <span
                          className={
                            (step.loadingAfter ?? 0) >= 100
                              ? 'font-bold text-[#ff1744]'
                              : 'font-bold text-[#00e5c8]'
                          }
                        >
                          {step.loadingAfter ? `${step.loadingAfter.toFixed(1)}%` : '0%'}
                        </span>
                      </div>

                      {(step.unservedLoadMW ?? 0) > 0 && (
                        <div className="text-[#ff3b5c]">
                          +{(step.unservedLoadMW ?? 0).toFixed(1)} MW unserved
                        </div>
                      )}
                    </div>

                    {/* Expanded Detail Drawer */}
                    {isSelected && (
                      <div className="mt-2 rounded border border-[#2a4055] bg-[#080d12] p-2 text-[9px] space-y-1">
                        <div className="font-semibold text-[#f5a623] uppercase tracking-wider text-[8px]">
                          Event Inspection Detail
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-[#88a4b8] font-mono">
                          <div>Trigger ID: <span className="text-white">{step.triggerAssetId}</span></div>
                          <div>Affected ID: <span className="text-white">{step.affectedAssetId}</span></div>
                          <div>Flow Shift: <span className="text-white">{step.loadRedistributedMW.toFixed(1)} MW</span></div>
                          <div>Depth: <span className="text-white">{step.depth ?? idx}</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
