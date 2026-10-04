'use client';

import React from 'react';
import { useVajraStore } from '@/store/vajraStore';
import { CANONICAL_CITIES_REGISTRY } from '@/data/canonicalCitiesData';

export default function OverviewView({
  onNavigate,
}: {
  onNavigate: (view: 'geotwin' | 'topology' | 'scenarios' | 'datasources') => void;
}) {
  const metrics = useVajraStore((s) => s.metrics);
  const activeCascade = useVajraStore((s) => s.activeCascade);
  const currentCity = useVajraStore((s) => s.geoTwin?.selectedCity);
  const clock = useVajraStore((s) => s.clock);

  const cityId = currentCity?.id ?? 'city-delhi';
  const cityRegistry = CANONICAL_CITIES_REGISTRY[cityId] || CANONICAL_CITIES_REGISTRY['city-delhi'];

  // Plain language derivations
  const freq = metrics.systemFrequencyHz;
  const isNormalFreq = Math.abs(freq - 50.0) <= 0.2;
  const isCascadeActive = (activeCascade?.affectedAssetIds?.length ?? 0) > 0;
  const unservedMW = activeCascade?.totalUnservedLoadMW ?? 0;

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto p-6 font-mono text-[#e0edf5]">
      {/* ─── Hero Header & Location ──────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#1b2a38] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-[#00e5c8]/15 px-2 py-0.5 text-xs font-bold text-[#00e5c8]">
              LOCATION
            </span>
            <h1 className="text-xl font-bold tracking-tight text-[#e0edf5]">
              {cityRegistry.canonicalName}
            </h1>
          </div>
          <p className="mt-1 font-sans text-xs text-[#5a7a8f]">
            Interconnected with {cityRegistry.regionalGridInterconnect} • WGS84 Centroid: [
            {cityRegistry.latitude.toFixed(4)}° N, {cityRegistry.longitude.toFixed(4)}° E]
          </p>
        </div>

        {/* Quick View Navigation Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('geotwin')}
            className="flex items-center gap-1.5 rounded-lg border border-[#00e5c8] bg-[#00e5c8]/10 px-3.5 py-2 text-xs font-semibold text-[#00e5c8] transition hover:bg-[#00e5c8]/20"
          >
            <span>🌍</span> Open 3D Geo-Twin
          </button>
          <button
            onClick={() => onNavigate('topology')}
            className="flex items-center gap-1.5 rounded-lg border border-[#1b2a38] bg-[#0c1824] px-3.5 py-2 text-xs font-semibold text-[#e0edf5] transition hover:border-[#00e5c8]"
          >
            <span>⚡</span> Electrical Schematic
          </button>
        </div>
      </div>

      {/* ─── Grid Operational Status Cards ───────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Frequency Card */}
        <div className="rounded-xl border border-[#1b2a38] bg-[#09131f] p-4">
          <div className="flex items-center justify-between text-[11px] text-[#5a7a8f]">
            <span>SYSTEM FREQUENCY</span>
            <span
              className={`h-2 w-2 rounded-full ${
                isNormalFreq ? 'bg-[#00e5c8]' : 'bg-[#d9383a] animate-ping'
              }`}
            />
          </div>
          <div className="mt-2 text-2xl font-bold text-[#e0edf5]">
            {freq.toFixed(3)} <span className="text-sm font-normal text-[#5a7a8f]">Hz</span>
          </div>
          <div className="mt-1 text-[11px]">
            {isNormalFreq ? (
              <span className="text-[#00e5c8]">✓ Within nominal 49.85 – 50.05 Hz</span>
            ) : (
              <span className="text-[#ff6b6b]">⚠️ Frequency excursion detected!</span>
            )}
          </div>
        </div>

        {/* Demand vs Generation Card */}
        <div className="rounded-xl border border-[#1b2a38] bg-[#09131f] p-4">
          <div className="flex items-center justify-between text-[11px] text-[#5a7a8f]">
            <span>DEMAND vs GENERATION</span>
            <span>⚡</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#e0edf5]">
            {metrics.totalDemandMW.toFixed(0)}{' '}
            <span className="text-sm font-normal text-[#5a7a8f]">/ {metrics.totalGenerationMW.toFixed(0)} MW</span>
          </div>
          <div className="mt-1 text-[11px] text-[#a0c4d8]">
            Reserve Margin: {(metrics.totalGenerationMW - metrics.totalDemandMW).toFixed(0)} MW
          </div>
        </div>

        {/* System Outages Card */}
        <div className="rounded-xl border border-[#1b2a38] bg-[#09131f] p-4">
          <div className="flex items-center justify-between text-[11px] text-[#5a7a8f]">
            <span>OUTAGES & FAILURES</span>
            <span>🚨</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#e0edf5]">
            {activeCascade?.affectedAssetIds?.length ?? 0}{' '}
            <span className="text-sm font-normal text-[#5a7a8f]">Tripped Assets</span>
          </div>
          <div className="mt-1 text-[11px]">
            {isCascadeActive ? (
              <span className="text-[#ff6b6b]">⚠️ {unservedMW.toFixed(1)} MW Unserved</span>
            ) : (
              <span className="text-[#00e5c8]">✓ Zero active blackout conditions</span>
            )}
          </div>
        </div>

        {/* Data Honesty Status Card */}
        <div className="rounded-xl border border-[#1b2a38] bg-[#09131f] p-4">
          <div className="flex items-center justify-between text-[11px] text-[#5a7a8f]">
            <span>DATA PROVENANCE</span>
            <span>🛡️</span>
          </div>
          <div className="mt-2 text-base font-bold text-[#3a86ff]">CURRENT PUBLIC</div>
          <div className="mt-1 text-[11px] text-[#5a7a8f]">
            CEA + OpenStreetMap Verified Base
          </div>
        </div>
      </div>

      {/* ─── Two-Column Executive Briefing ────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: What is happening & What is important? */}
        <div className="rounded-xl border border-[#1b2a38] bg-[#09131f] p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#00e5c8] uppercase">
            <span>ℹ️</span> Operational Assessment
          </h2>
          <div className="mt-4 space-y-3 font-sans text-xs leading-relaxed text-[#a0c4d8]">
            <p>
              <strong className="font-mono text-[#e0edf5]">Grid Integrity:</strong>{' '}
              {isCascadeActive
                ? `Cascade failure active. Multiple high-voltage corridors or substations have disconnected due to thermal overloads. Protection systems have isolated ${activeCascade?.affectedAssetIds?.length ?? 0} facilities.`
                : 'The transmission and sub-transmission network is operating under steady-state equilibrium. Voltage profiles across all monitored 400kV and 220kV buses remain within permissible operational bands.'}
            </p>
            <p>
              <strong className="font-mono text-[#e0edf5]">Data Freshness:</strong> Baseline
              power assets, transmission corridors, and capacity ratings originate from the{' '}
              <span className="text-[#3a86ff]">{cityRegistry.electricalDataSources.transmissionGrid}</span>
              . Building footprints and road networks originate from{' '}
              <span className="text-[#3a86ff]">{cityRegistry.geographicDataSources.buildingFootprints}</span>
              .
            </p>
            <p>
              <strong className="font-mono text-[#e0edf5]">Notice on Utility Feeders:</strong>{' '}
              Last-mile 11kV feeder lines are not published in public open data. VAJRA-Ω derives
              service regions via spatial Voronoi proximity. These are explicitly tagged{' '}
              <span className="rounded bg-[#f5a623]/15 px-1 font-mono text-[10px] text-[#f5a623]">
                INFERRED
              </span>
              .
            </p>
          </div>
        </div>

        {/* Right: What can I do? Actions & Next Steps */}
        <div className="rounded-xl border border-[#1b2a38] bg-[#09131f] p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#00e5c8] uppercase">
            <span>🎯</span> Recommended Actions
          </h2>
          <div className="mt-4 space-y-2.5">
            <button
              onClick={() => onNavigate('geotwin')}
              className="flex w-full items-center justify-between rounded-lg border border-[#1b2a38] bg-[#0c1824] p-3 text-left transition hover:border-[#00e5c8]"
            >
              <div>
                <div className="font-mono text-xs font-bold text-[#e0edf5]">
                  1. Inspect Geographic 3D City Twin
                </div>
                <div className="mt-0.5 font-sans text-[11px] text-[#5a7a8f]">
                  Fly camera to {cityRegistry.canonicalName}, toggle 3D building extrusions, and view
                  substation locations in real space.
                </div>
              </div>
              <span className="text-base text-[#00e5c8]">→</span>
            </button>

            <button
              onClick={() => onNavigate('topology')}
              className="flex w-full items-center justify-between rounded-lg border border-[#1b2a38] bg-[#0c1824] p-3 text-left transition hover:border-[#00e5c8]"
            >
              <div>
                <div className="font-mono text-xs font-bold text-[#e0edf5]">
                  2. Review Voltage-Tier Schematic
                </div>
                <div className="mt-0.5 font-sans text-[11px] text-[#5a7a8f]">
                  Understand the transmission hierarchy from 400kV bulk transmission down to
                  distribution load centers.
                </div>
              </div>
              <span className="text-base text-[#00e5c8]">→</span>
            </button>

            <button
              onClick={() => onNavigate('scenarios')}
              className="flex w-full items-center justify-between rounded-lg border border-[#1b2a38] bg-[#0c1824] p-3 text-left transition hover:border-[#00e5c8]"
            >
              <div>
                <div className="font-mono text-xs font-bold text-[#e0edf5]">
                  3. Test Contingency & Cascade Resilience
                </div>
                <div className="mt-0.5 font-sans text-[11px] text-[#5a7a8f]">
                  Inject N-1 transformer or transmission trips to observe deterministic cascade
                  propagation and blackstart recovery.
                </div>
              </div>
              <span className="text-base text-[#00e5c8]">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
