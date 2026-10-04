'use client';

import React from 'react';
import { useVajraStore } from '@/store/vajraStore';
import { CANONICAL_CITIES_REGISTRY, CANONICAL_POWER_ASSETS } from '@/data/canonicalCitiesData';

export default function DataSourcesView() {
  const currentCity = useVajraStore((s) => s.geoTwin?.selectedCity);
  const cityId = currentCity?.id ?? 'city-delhi';
  const cityRegistry = CANONICAL_CITIES_REGISTRY[cityId] || CANONICAL_CITIES_REGISTRY['city-delhi'];
  const powerAssets = CANONICAL_POWER_ASSETS[cityId] || CANONICAL_POWER_ASSETS['city-delhi'] || [];

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto p-6 font-mono text-[#e0edf5]">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6 border-b border-[#1b2a38] pb-5">
        <div className="flex items-center gap-2">
          <span className="rounded bg-[#00e5c8]/15 px-2 py-0.5 text-xs font-bold text-[#00e5c8]">
            DATA GOVERNANCE & PROVENANCE
          </span>
          <h1 className="text-xl font-bold tracking-tight text-[#e0edf5]">
            Verified Data Source Registry
          </h1>
        </div>
        <p className="mt-1 font-sans text-xs text-[#5a7a8f]">
          System-wide truth audit for {cityRegistry.canonicalName}. Every entity, polygon, and bus
          is classified by authenticity.
        </p>
      </div>

      {/* ─── Mandatory System-Level Data Honesty Panel ───────────────────── */}
      <div className="mb-8 rounded-xl border border-[#1b2a38] bg-[#09131f] p-5">
        <h2 className="mb-4 text-xs font-bold tracking-wider text-[#00e5c8] uppercase">
          CITY PROVENANCE MATRIX — {cityRegistry.canonicalName.toUpperCase()}
        </h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* 1. Geographic Base */}
          <div className="rounded-lg border border-[#1b2a38] bg-[#0c1824] p-3.5">
            <span className="text-[10px] text-[#5a7a8f]">GEOGRAPHIC BASE & BOUNDARIES</span>
            <div className="mt-1 text-sm font-bold text-[#e0edf5]">
              {cityRegistry.geographicDataSources.baseMap}
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-[#5a7a8f]">Status:</span>
              <span className="font-bold text-[#00e5c8]">CURRENT (WGS84 EPSG:4326)</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-[#5a7a8f]">Coverage:</span>
              <span className="text-[#a0c4d8]">METROPOLITAN REGION</span>
            </div>
          </div>

          {/* 2. Power Infrastructure */}
          <div className="rounded-lg border border-[#1b2a38] bg-[#0c1824] p-3.5">
            <span className="text-[10px] text-[#5a7a8f]">POWER INFRASTRUCTURE</span>
            <div className="mt-1 text-sm font-bold text-[#e0edf5]">
              CEA National Grid + OpenInfraMap
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-[#5a7a8f]">Status:</span>
              <span className="font-bold text-[#3a86ff]">PUBLIC VERIFIED DATA</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-[#5a7a8f]">Coverage:</span>
              <span className="text-[#a0c4d8]">EHV 400kV & 220kV RING</span>
            </div>
          </div>

          {/* 3. Utility Feeder Connectivity */}
          <div className="rounded-lg border border-[#1b2a38] bg-[#0c1824] p-3.5">
            <span className="text-[10px] text-[#5a7a8f]">UTILITY FEEDER CONNECTIVITY</span>
            <div className="mt-1 text-sm font-bold text-[#f5a623]">
              11kV / 415V Last-Mile Feeder Paths
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-[#5a7a8f]">Status:</span>
              <span className="font-bold text-[#f5a623]">NOT PUBLICLY AVAILABLE</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-[#5a7a8f]">Treatment:</span>
              <span className="text-[#f5a623]">INFERRED VORONOI REGIONS</span>
            </div>
          </div>

          {/* 4. Live Telemetry */}
          <div className="rounded-lg border border-[#1b2a38] bg-[#0c1824] p-3.5">
            <span className="text-[10px] text-[#5a7a8f]">SCADA / PMU LIVE TELEMETRY</span>
            <div className="mt-1 text-sm font-bold text-[#5a7a8f]">
              Direct Utility Phasor Link
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-[#5a7a8f]">Status:</span>
              <span className="font-bold text-[#d9383a]">NOT CONNECTED</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-[#5a7a8f]">Protocol:</span>
              <span className="text-[#5a7a8f]">IEEE C37.118 (Awaiting Adapter)</span>
            </div>
          </div>

          {/* 5. Simulation Engine */}
          <div className="rounded-lg border border-[#1b2a38] bg-[#0c1824] p-3.5">
            <span className="text-[10px] text-[#5a7a8f]">SIMULATION ENGINE STATE</span>
            <div className="mt-1 text-sm font-bold text-[#d8b4fe]">
              Deterministic AC/DC Hybrid Flow
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-[#5a7a8f]">Status:</span>
              <span className="font-bold text-[#00e5c8]">ACTIVE</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-[#5a7a8f]">Coupling:</span>
              <span className="text-[#d8b4fe]">CANONICAL REAL GEOGRAPHY</span>
            </div>
          </div>

          {/* 6. 3D Building Extrusions */}
          <div className="rounded-lg border border-[#1b2a38] bg-[#0c1824] p-3.5">
            <span className="text-[10px] text-[#5a7a8f]">3D BUILDING GEOMETRY</span>
            <div className="mt-1 text-sm font-bold text-[#e0edf5]">
              OpenStreetMap Vector Tiles
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-[#5a7a8f]">Height Source:</span>
              <span className="text-[#a0c4d8]">TAGGED HEIGHT / FLOOR COUNT</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-[#5a7a8f]">Renderer:</span>
              <span className="text-[#00e5c8]">GPU MapLibre GL Fill-Extrusion</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Canonical Assets Audit Table ────────────────────────────────── */}
      <div className="rounded-xl border border-[#1b2a38] bg-[#09131f] p-5">
        <h2 className="mb-3 text-xs font-bold tracking-wider text-[#00e5c8] uppercase">
          REGISTERED POWER ASSETS PROVENANCE — {cityRegistry.canonicalName} ({powerAssets.length} ASSETS)
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-[#1b2a38] text-[10px] text-[#5a7a8f]">
                <th className="pb-2">ASSET NAME</th>
                <th className="pb-2">OPERATOR</th>
                <th className="pb-2">VOLTAGE</th>
                <th className="pb-2">WGS84 COORDINATES</th>
                <th className="pb-2">CLASSIFICATION</th>
                <th className="pb-2">DATA SOURCE & REFERENCE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1b2a38]/60 text-[11px]">
              {powerAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-[#0c1824]">
                  <td className="py-2.5 font-bold text-[#e0edf5]">{asset.name}</td>
                  <td className="py-2.5 text-[#a0c4d8]">{asset.operator ?? '—'}</td>
                  <td className="py-2.5 font-semibold text-[#00e5c8]">{asset.voltageKV} kV</td>
                  <td className="py-2.5 text-[#5a7a8f]">
                    {asset.coordinates.latitude.toFixed(4)}° N, {asset.coordinates.longitude.toFixed(4)}° E
                  </td>
                  <td className="py-2.5">
                    <span className="rounded bg-[#3a86ff]/15 px-1.5 py-0.5 text-[9px] font-bold text-[#3a86ff]">
                      {asset.classification}
                    </span>
                  </td>
                  <td className="py-2.5 text-[#5a7a8f]">
                    <div>{asset.source}</div>
                    {asset.sourceUrl && (
                      <a
                        href={asset.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-[#3a86ff] underline hover:text-[#60a5fa]"
                      >
                        Source Link ↗
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
