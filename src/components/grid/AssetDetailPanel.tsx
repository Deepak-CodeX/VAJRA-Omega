'use client';

import React from 'react';
import type { GridTopology } from '@/types';
import {
  type SelectedAsset,
  deriveNodeVisualState,
  deriveLineVisualState,
  STATE_THEMES,
  ASSET_TYPE_COLORS,
} from './gridVisualizerUtils';
import { useVajraStore } from '@/store/vajraStore';

interface AssetDetailPanelProps {
  selected: SelectedAsset;
  onClose: () => void;
  topology: GridTopology;
  onSelectRelated: (asset: SelectedAsset) => void;
}

export default function AssetDetailPanel({
  selected,
  onClose,
  topology,
  onSelectRelated,
}: AssetDetailPanelProps) {
  const injectFault = useVajraStore((s) => s.injectFault);

  // Compute live visual state
  const visualState =
    selected.kind === 'line'
      ? deriveLineVisualState(selected.data)
      : deriveNodeVisualState(
          selected.data.status,
          selected.kind === 'load'
            ? { isConnected: selected.data.connected }
            : selected.kind === 'substation'
              ? { loadingPercent: selected.data.capacityMW > 0 ? (selected.data.currentLoadMW / selected.data.capacityMW) * 100 : 0 }
              : undefined,
        );

  const theme = STATE_THEMES[visualState];

  // Resolve related assets
  const getRelatedElements = () => {
    switch (selected.kind) {
      case 'generator': {
        const connectedSubs = topology.substations.filter((s) =>
          selected.data.connectedTo.includes(s.id),
        );
        return connectedSubs.map((s) => ({
          id: s.id,
          name: s.name,
          sub: `${s.type} substation`,
          target: { kind: 'substation' as const, data: s },
        }));
      }

      case 'substation': {
        const related = [];
        // Connected lines
        const lines = topology.transmissionLines.filter(
          (l) => l.fromId === selected.data.id || l.toId === selected.data.id,
        );
        for (const l of lines) {
          related.push({
            id: l.id,
            name: l.name,
            sub: `${l.capacityMW} MW line (${l.loadingPercent.toFixed(0)}% load)`,
            target: { kind: 'line' as const, data: l },
          });
        }
        // Connected generators
        const gens = topology.generators.filter((g) =>
          g.connectedTo.includes(selected.data.id),
        );
        for (const g of gens) {
          related.push({
            id: g.id,
            name: g.name,
            sub: `${g.type} (${g.currentOutputMW.toFixed(1)} MW)`,
            target: { kind: 'generator' as const, data: g },
          });
        }
        // Connected batteries
        const bats = topology.batteries.filter((b) => b.connectedTo === selected.data.id);
        for (const b of bats) {
          related.push({
            id: b.id,
            name: b.name,
            sub: `Battery (${b.capacityMWh} MWh, ${(b.socPercent * 100).toFixed(0)}% SOC)`,
            target: { kind: 'battery' as const, data: b },
          });
        }
        // Connected loads
        const loads = topology.loads.filter((l) => l.connectedTo === selected.data.id);
        for (const l of loads) {
          related.push({
            id: l.id,
            name: l.name,
            sub: `${l.type} (${l.demandMW.toFixed(1)} MW, ${l.priority})`,
            target: { kind: 'load' as const, data: l },
          });
        }
        return related;
      }

      case 'battery': {
        const sub = topology.substations.find((s) => s.id === selected.data.connectedTo);
        if (!sub) return [];
        return [
          {
            id: sub.id,
            name: sub.name,
            sub: `Connected ${sub.type} sub`,
            target: { kind: 'substation' as const, data: sub },
          },
        ];
      }

      case 'load': {
        const sub = topology.substations.find((s) => s.id === selected.data.connectedTo);
        if (!sub) return [];
        return [
          {
            id: sub.id,
            name: sub.name,
            sub: `Fed by ${sub.name}`,
            target: { kind: 'substation' as const, data: sub },
          },
        ];
      }

      case 'line': {
        const fromSub = topology.substations.find((s) => s.id === selected.data.fromId);
        const toSub = topology.substations.find((s) => s.id === selected.data.toId);
        const related = [];
        if (fromSub) {
          related.push({
            id: fromSub.id,
            name: `From: ${fromSub.name}`,
            sub: `${fromSub.type} substation`,
            target: { kind: 'substation' as const, data: fromSub },
          });
        }
        if (toSub) {
          related.push({
            id: toSub.id,
            name: `To: ${toSub.name}`,
            sub: `${toSub.type} substation`,
            target: { kind: 'substation' as const, data: toSub },
          });
        }
        return related;
      }
    }
  };

  const handleTripAsset = () => {
    switch (selected.kind) {
      case 'substation':
        injectFault('SUBSTATION_FAILURE', [selected.data.id]);
        break;
      case 'generator':
        injectFault('GENERATOR_OUTAGE', [selected.data.id]);
        break;
      case 'line':
        injectFault('LINE_FAILURE', [selected.data.id]);
        break;
      case 'battery':
        injectFault('BATTERY_FAILURE', [selected.data.id]);
        break;
    }
  };

  const related = getRelatedElements();

  return (
    <div className="flex h-full flex-col overflow-hidden rounded border border-[#1a3348] bg-[#0a1220]/95 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-[#1a3348] p-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: theme.primary, boxShadow: `0 0 8px ${theme.primary}` }}
            />
            <span className="font-mono text-[9px] uppercase tracking-wider text-[#5a7a8f]">
              {selected.kind.toUpperCase()}
            </span>
            <span
              className="rounded px-1.5 py-0.2 text-[8px] font-bold uppercase tracking-wider"
              style={{ color: theme.primary, backgroundColor: theme.badgeBg }}
            >
              {visualState}
            </span>
          </div>
          <h4 className="text-[12px] font-bold text-[#e0edf5]">{selected.data.name}</h4>
          <span className="font-mono text-[8px] text-[#3a5568]">ID: {selected.data.id}</span>
        </div>

        <button
          onClick={onClose}
          className="rounded p-1 text-[#5a7a8f] transition hover:bg-[#1a3348] hover:text-[#e0edf5]"
          title="Close inspector"
        >
          ✕
        </button>
      </div>

      {/* Body: Telemetry Metrics */}
      <div className="flex-1 overflow-y-auto p-3">
        <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Live Asset Telemetry</span>

        <div className="mt-1.5 grid grid-cols-2 gap-2 text-[10px]">
          {selected.kind === 'generator' && (
            <>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Primary Fuel</span>
                <p className="font-semibold capitalize" style={{ color: ASSET_TYPE_COLORS[selected.data.type] }}>
                  {selected.data.type}
                </p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Capacity</span>
                <p className="font-mono font-bold text-[#e0edf5]">{selected.data.capacityMW} MW</p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Current Output</span>
                <p className="font-mono font-bold text-[#00e5c8]">
                  {selected.data.currentOutputMW.toFixed(1)} MW
                </p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Capacity Factor</span>
                <p className="font-mono font-bold text-[#f5a623]">
                  {selected.data.capacityMW > 0
                    ? `${((selected.data.currentOutputMW / selected.data.capacityMW) * 100).toFixed(0)}%`
                    : '0%'}
                </p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Resource Factor</span>
                <p className="font-mono text-[#5a7a8f]">
                  {(selected.data.resourceFactor * 100).toFixed(0)}%
                </p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Ramp Limit</span>
                <p className="font-mono text-[#5a7a8f]">{selected.data.rampRateMW.toFixed(1)} MW/m</p>
              </div>
            </>
          )}

          {selected.kind === 'substation' && (
            <>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Type</span>
                <p className="font-semibold capitalize text-[#00e5c8]">{selected.data.type}</p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Transformer Rating</span>
                <p className="font-mono font-bold text-[#e0edf5]">{selected.data.capacityMW} MW</p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Throughput Load</span>
                <p className="font-mono font-bold text-[#3b9eff]">
                  {selected.data.currentLoadMW.toFixed(1)} MW
                </p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Transformer Loading</span>
                <p
                  className="font-mono font-bold"
                  style={{
                    color:
                      selected.data.capacityMW > 0 && selected.data.currentLoadMW > selected.data.capacityMW
                        ? '#ff3b5c'
                        : '#00d68f',
                  }}
                >
                  {selected.data.capacityMW > 0
                    ? `${((selected.data.currentLoadMW / selected.data.capacityMW) * 100).toFixed(1)}%`
                    : '0%'}
                </p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Bus Voltage</span>
                <p
                  className="font-mono font-bold"
                  style={{
                    color:
                      selected.data.voltagePU < 0.95 || selected.data.voltagePU > 1.05
                        ? '#f5a623'
                        : '#00d68f',
                  }}
                >
                  {selected.data.voltagePU.toFixed(3)} PU
                </p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Bus Frequency</span>
                <p className="font-mono font-bold text-[#e0edf5]">{selected.data.frequencyHz.toFixed(2)} Hz</p>
              </div>
            </>
          )}

          {selected.kind === 'battery' && (
            <>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Nameplate Energy</span>
                <p className="font-mono font-bold text-[#e0edf5]">{selected.data.capacityMWh} MWh</p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">State of Charge</span>
                <p className="font-mono font-bold text-[#a855f7]">
                  {(selected.data.socPercent * 100).toFixed(1)}% ({selected.data.stateOfChargeMWh.toFixed(1)} MWh)
                </p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Active Flow</span>
                <p
                  className="font-mono font-bold"
                  style={{ color: selected.data.currentFlowMW >= 0 ? '#00d68f' : '#f5a623' }}
                >
                  {selected.data.currentFlowMW >= 0
                    ? `+${selected.data.currentFlowMW.toFixed(1)} MW (Discharge)`
                    : `${selected.data.currentFlowMW.toFixed(1)} MW (Charge)`}
                </p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Round-trip Efficiency</span>
                <p className="font-mono text-[#5a7a8f]">{(selected.data.efficiency * 100).toFixed(0)}%</p>
              </div>
            </>
          )}

          {selected.kind === 'load' && (
            <>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Load Sector</span>
                <p className="font-semibold capitalize text-[#38bdf8]">{selected.data.type.replace(/_/g, ' ')}</p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Priority</span>
                <p
                  className="font-mono font-bold uppercase"
                  style={{
                    color:
                      selected.data.priority === 'critical'
                        ? '#ff3b5c'
                        : selected.data.priority === 'high'
                          ? '#f5a623'
                          : '#00d68f',
                  }}
                >
                  {selected.data.priority}
                </p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Actual Demand</span>
                <p className="font-mono font-bold text-[#3b9eff]">{selected.data.demandMW.toFixed(1)} MW</p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Feeder Status</span>
                <p
                  className="font-mono font-bold"
                  style={{ color: selected.data.connected ? '#00d68f' : '#ff3b5c' }}
                >
                  {selected.data.connected ? 'Energized' : 'Shed / Disconnected'}
                </p>
              </div>
              <div className="col-span-2 rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Impacted Consumers</span>
                <p className="font-mono font-bold text-[#e0edf5]">
                  {selected.data.consumerCount.toLocaleString()} meters
                </p>
              </div>
            </>
          )}

          {selected.kind === 'line' && (
            <>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Line Rating</span>
                <p className="font-mono font-bold text-[#e0edf5]">{selected.data.capacityMW} MW</p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Active Flow</span>
                <p className="font-mono font-bold text-[#00e5c8]">
                  {Math.abs(selected.data.currentFlowMW).toFixed(1)} MW{' '}
                  <span className="text-[8px] text-[#5a7a8f]">
                    {selected.data.currentFlowMW >= 0 ? '(→)' : '(←)'}
                  </span>
                </p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Thermal Loading</span>
                <p
                  className="font-mono font-bold"
                  style={{
                    color:
                      selected.data.loadingPercent >= 100
                        ? '#ff3b5c'
                        : selected.data.loadingPercent >= 80
                          ? '#f5a623'
                          : '#00d68f',
                  }}
                >
                  {selected.data.loadingPercent.toFixed(1)}%
                </p>
              </div>
              <div className="rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">I²R Losses</span>
                <p className="font-mono text-[#5a7a8f]">{selected.data.lossesMW.toFixed(2)} MW</p>
              </div>
              <div className="col-span-2 rounded border border-[#1a3348]/60 bg-[#050a12] p-1.5">
                <span className="text-[8px] text-[#5a7a8f]">Corridor Length</span>
                <p className="font-mono text-[#e0edf5]">{selected.data.lengthKm} km</p>
              </div>
            </>
          )}
        </div>

        {/* Connected Infrastructure List */}
        <div className="mt-3 border-t border-[#1a3348]/60 pt-2.5">
          <div className="flex items-center justify-between text-[8px] text-[#5a7a8f]">
            <span className="uppercase tracking-wider">Connected Infrastructure ({related.length})</span>
            <span>Click to navigate</span>
          </div>

          <div className="mt-1 flex max-h-[140px] flex-col gap-1 overflow-y-auto">
            {related.map((rel) => (
              <button
                key={rel.id}
                onClick={() => onSelectRelated(rel.target)}
                className="flex items-center justify-between rounded border border-[#1a3348]/40 bg-[#050a12]/80 px-2 py-1 text-left transition hover:border-[#00e5c8]/50 hover:bg-[#00e5c8]/5"
              >
                <div className="flex flex-col">
                  <span className="text-[9px] font-medium text-[#e0edf5]">{rel.name}</span>
                  <span className="text-[8px] text-[#5a7a8f]">{rel.sub}</span>
                </div>
                <span className="text-[10px] text-[#5a7a8f]">→</span>
              </button>
            ))}
          </div>
        </div>

        {/* Operator Trip Action Button */}
        {selected.kind !== 'load' && (
          <div className="mt-3 border-t border-[#1a3348]/60 pt-2.5">
            <button
              onClick={handleTripAsset}
              disabled={selected.data.status === 'FAILED'}
              className="w-full rounded border border-[#ff3b5c]/40 bg-[#ff3b5c]/10 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-[#ff3b5c] transition hover:bg-[#ff3b5c]/20 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {selected.data.status === 'FAILED' ? 'Asset Out of Service' : `Trip ${selected.data.name}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
