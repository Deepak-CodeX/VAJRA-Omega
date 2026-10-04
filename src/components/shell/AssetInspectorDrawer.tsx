'use client';

import React, { useState } from 'react';
import type { PowerAsset } from '@/types/powerAsset';

interface AssetInspectorDrawerProps {
  asset: PowerAsset | null;
  isOpen: boolean;
  onClose: () => void;
  onFlyToAsset?: (asset: PowerAsset) => void;
  onTripAsset?: (asset: PowerAsset) => void;
  onRestoreAsset?: (asset: PowerAsset) => void;
}

export default function AssetInspectorDrawer({
  asset,
  isOpen,
  onClose,
  onFlyToAsset,
  onTripAsset,
  onRestoreAsset,
}: AssetInspectorDrawerProps) {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'ELECTRICAL' | 'GEOGRAPHY' | 'EVENTS' | 'SIMULATION'>('OVERVIEW');

  if (!isOpen) return null;

  return (
    <aside className="relative flex h-full w-80 flex-col border-l border-[#1b2a38] bg-[#070d17] text-[#e0edf5] transition-all duration-200">
      {/* ─── Drawer Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-[#1b2a38] bg-[#09131f] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#00e5c8]" />
          <h3 className="font-mono text-xs font-bold tracking-wider text-[#e0edf5] uppercase">
            Asset Inspector
          </h3>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-[#5a7a8f] transition hover:bg-[#101d2c] hover:text-[#e0edf5]"
          title="Close Inspector"
        >
          ✕
        </button>
      </div>

      {!asset ? (
        /* Empty State */
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#1b2a38] bg-[#0c1824] text-xl">
            ⚡
          </div>
          <h4 className="font-mono text-xs font-semibold text-[#e0edf5]">No Asset Selected</h4>
          <p className="mt-1.5 font-sans text-xs leading-relaxed text-[#5a7a8f]">
            Select any substation, transmission line, generator, or critical facility in the
            Geo-Twin or Schematic to inspect its engineering telemetry and source provenance.
          </p>
        </div>
      ) : (
        /* Content when asset is selected */
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Asset Identity Banner */}
          <div className="border-b border-[#1b2a38] bg-[#09131f]/60 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-mono text-xs font-bold text-[#e0edf5]">{asset.name}</h4>
                <p className="mt-0.5 font-mono text-[10px] text-[#5a7a8f]">
                  ID: <span className="text-[#a0c4d8]">{asset.id}</span>
                </p>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ${
                  asset.status === 'TRIPPED'
                    ? 'border border-[#d9383a]/40 bg-[#d9383a]/15 text-[#ff6b6b]'
                    : asset.status === 'DEGRADED'
                    ? 'border border-[#f5a623]/40 bg-[#f5a623]/15 text-[#f5a623]'
                    : 'border border-[#00e5c8]/40 bg-[#00e5c8]/15 text-[#00e5c8]'
                }`}
              >
                {asset.status}
              </span>
            </div>

            {/* Classification & Provenance Badge */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 font-mono text-[9px]">
              <span
                className={`rounded px-1.5 py-0.5 font-semibold ${
                  asset.classification === 'VERIFIED_REAL'
                    ? 'bg-[#00e5c8]/15 text-[#00e5c8]'
                    : asset.classification === 'CURRENT_PUBLIC'
                    ? 'bg-[#3a86ff]/15 text-[#3a86ff]'
                    : asset.classification === 'INFERRED'
                    ? 'bg-[#f5a623]/15 text-[#f5a623]'
                    : 'bg-[#8338ec]/15 text-[#d8b4fe]'
                }`}
              >
                ● {asset.classification.replace('_', ' ')}
              </span>
              <span className="rounded bg-[#0c1824] px-1.5 py-0.5 text-[#5a7a8f]">
                Conf: {asset.confidence}
              </span>
            </div>
          </div>

          {/* Tab Selector */}
          <div className="flex border-b border-[#1b2a38] bg-[#050a12] text-[10px]">
            {(['OVERVIEW', 'ELECTRICAL', 'GEOGRAPHY', 'EVENTS', 'SIMULATION'] as const).map(
              (tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-1.5 font-mono font-medium transition ${
                    activeTab === tab
                      ? 'border-b-2 border-[#00e5c8] bg-[#09131f] text-[#00e5c8]'
                      : 'text-[#5a7a8f] hover:text-[#e0edf5]'
                  }`}
                >
                  {tab === 'OVERVIEW'
                    ? 'General'
                    : tab === 'ELECTRICAL'
                    ? 'Grid'
                    : tab === 'GEOGRAPHY'
                    ? 'Geo'
                    : tab === 'EVENTS'
                    ? 'Logs'
                    : 'Sim'}
                </button>
              )
            )}
          </div>

          {/* Tab Content Panels */}
          <div className="flex-1 overflow-y-auto p-3.5 font-mono text-xs">
            {activeTab === 'OVERVIEW' && (
              <div className="space-y-3">
                <div>
                  <span className="text-[10px] text-[#5a7a8f]">ASSET TYPE</span>
                  <div className="font-semibold text-[#e0edf5]">{asset.assetType}</div>
                </div>

                <div>
                  <span className="text-[10px] text-[#5a7a8f]">FACILITY OPERATOR</span>
                  <div className="text-[#a0c4d8]">
                    {asset.operator ?? 'DATA NOT PUBLICLY AVAILABLE'}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-[#5a7a8f]">VOLTAGE & CAPACITY</span>
                  <div className="text-[#e0edf5]">
                    {asset.voltageKV ? `${asset.voltageKV} kV` : 'NOT AVAILABLE'} •{' '}
                    {asset.nominalCapacityMVA ? `${asset.nominalCapacityMVA} MVA` : 'NOT AVAILABLE'}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-[#5a7a8f]">SUBSTATION ARCHITECTURE</span>
                  <div className="text-[#e0edf5]">{asset.substationType ?? 'Air Insulated (AIS)'}</div>
                </div>

                <div className="rounded border border-[#1b2a38] bg-[#09131f] p-2.5">
                  <span className="text-[10px] font-bold text-[#00e5c8]">DATA PROVENANCE</span>
                  <div className="mt-1 text-[11px] text-[#e0edf5]">{asset.source}</div>
                  <div className="mt-0.5 text-[9px] text-[#5a7a8f]">
                    Freshness: {asset.freshness}
                  </div>
                  {asset.sourceUrl && (
                    <a
                      href={asset.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 inline-block text-[9px] text-[#3a86ff] underline hover:text-[#60a5fa]"
                    >
                      Verify Reference Record ↗
                    </a>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'ELECTRICAL' && (
              <div className="space-y-3">
                <div>
                  <span className="text-[10px] text-[#5a7a8f]">CURRENT LOADING</span>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-2 flex-1 rounded bg-[#0c1824]">
                      <div
                        className={`h-2 rounded ${
                          (asset.loadingPercent ?? 0) > 85
                            ? 'bg-[#d9383a]'
                            : (asset.loadingPercent ?? 0) > 70
                            ? 'bg-[#f5a623]'
                            : 'bg-[#00e5c8]'
                        }`}
                        style={{ width: `${Math.min(100, asset.loadingPercent ?? 65)}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-bold text-[#e0edf5]">
                      {asset.loadingPercent ?? 65}%
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-[#5a7a8f]">VERIFIED CONNECTED BUSES</span>
                  {asset.connectedAssetIds.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {asset.connectedAssetIds.map((id) => (
                        <li
                          key={id}
                          className="rounded border border-[#1b2a38] bg-[#0c1824] p-1.5 text-[10px] text-[#a0c4d8]"
                        >
                          ⚡ {id}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-1 text-[10px] text-[#5a7a8f]">
                      NO PUBLIC FEEDER TOPOLOGY VERIFIED
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-[10px] text-[#5a7a8f]">ESTIMATED SERVICE REGION</span>
                  <div className="mt-1 rounded border border-[#1b2a38] bg-[#0c1824] p-2 text-[10px] text-[#f5a623]">
                    ⚠️ Spatial Voronoi approximation only. Do not treat as verified utility switchgear SLD.
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'GEOGRAPHY' && (
              <div className="space-y-3">
                <div>
                  <span className="text-[10px] text-[#5a7a8f]">GEODETIC COORDINATES</span>
                  <div className="text-[#e0edf5]">
                    Lat: {asset.coordinates.latitude.toFixed(5)}° N<br />
                    Lon: {asset.coordinates.longitude.toFixed(5)}° E
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-[#5a7a8f]">TERRAIN ELEVATION</span>
                  <div className="text-[#e0edf5]">
                    {asset.coordinates.elevationMeters
                      ? `${asset.coordinates.elevationMeters} m MSL`
                      : 'NOT AVAILABLE'}
                  </div>
                </div>

                {onFlyToAsset && (
                  <button
                    onClick={() => onFlyToAsset(asset)}
                    className="flex w-full items-center justify-center gap-1.5 rounded border border-[#00e5c8] bg-[#00e5c8]/10 py-1.5 font-mono text-[11px] font-semibold text-[#00e5c8] transition hover:bg-[#00e5c8]/20"
                  >
                    <span>🎯</span> Fly Camera to Asset
                  </button>
                )}
              </div>
            )}

            {activeTab === 'EVENTS' && (
              <div className="space-y-2">
                <span className="text-[10px] text-[#5a7a8f]">ASSET EVENT AUDIT</span>
                <div className="rounded border border-[#1b2a38] bg-[#0c1824] p-2 text-[10px]">
                  <span className="text-[#5a7a8f]">Tick: 0</span> — Substation initialized in
                  steady-state nominal loading.
                </div>
                {asset.status === 'TRIPPED' && (
                  <div className="rounded border border-[#d9383a]/40 bg-[#d9383a]/10 p-2 text-[10px] text-[#ff6b6b]">
                    ⚠️ Overcurrent trip triggered during cascade contingency.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'SIMULATION' && (
              <div className="space-y-3">
                <span className="text-[10px] text-[#5a7a8f]">CONTINGENCY INJECTION</span>
                <div className="space-y-2">
                  {asset.status !== 'TRIPPED' ? (
                    <button
                      onClick={() => onTripAsset?.(asset)}
                      className="flex w-full items-center justify-center gap-1 rounded border border-[#d9383a] bg-[#d9383a]/15 py-1.5 font-mono text-[11px] font-semibold text-[#ff6b6b] transition hover:bg-[#d9383a]/30"
                    >
                      ⚡ Force Trip Substation
                    </button>
                  ) : (
                    <button
                      onClick={() => onRestoreAsset?.(asset)}
                      className="flex w-full items-center justify-center gap-1 rounded border border-[#00e5c8] bg-[#00e5c8]/15 py-1.5 font-mono text-[11px] font-semibold text-[#00e5c8] transition hover:bg-[#00e5c8]/30"
                    >
                      ↺ Restore & Blackstart
                    </button>
                  )}
                  <p className="text-[9px] text-[#5a7a8f]">
                    Simulate N-1 single point of failure and observe geographic blackout propagation.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
