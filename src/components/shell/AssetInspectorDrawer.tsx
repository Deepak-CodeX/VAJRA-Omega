'use client';

import React, { useState, useMemo } from 'react';
import type { PowerAsset } from '@/types/powerAsset';
import type { GeoFeatureIdentity } from '@/types/geoFeatureIdentity';

interface AssetInspectorDrawerProps {
  asset: PowerAsset | null;
  featureIdentity?: GeoFeatureIdentity | null;
  isOpen: boolean;
  onClose: () => void;
  onFlyToAsset?: (target: any) => void;
  onTripAsset?: (assetOrId: any) => void;
  onRestoreAsset?: (assetOrId: any) => void;
}

export default function AssetInspectorDrawer({
  asset,
  featureIdentity,
  isOpen,
  onClose,
  onFlyToAsset,
  onTripAsset,
  onRestoreAsset,
}: AssetInspectorDrawerProps) {
  // Decide if we have an active selection
  const hasSelection = !!(featureIdentity || asset);

  // Extract common display fields with priority on featureIdentity
  const name = featureIdentity?.name ?? asset?.name ?? 'Unnamed Entity';
  const id = featureIdentity?.featureId ?? asset?.id ?? 'Unknown';
  const externalId = featureIdentity?.externalId ?? null;
  const category = featureIdentity?.category ?? (
    asset?.assetType === 'TRANSMISSION_LINE' ? 'TRANSMISSION_LINE' :
    asset?.assetType === 'LOAD_ZONE' ? 'LOAD_REGION' :
    asset?.assetType === 'SUBSTATION' ? 'SUBSTATION' : 'OTHER'
  );
  const featureType = featureIdentity?.featureType ?? (
    asset?.assetType === 'TRANSMISSION_LINE' ? '400kV Transmission Line' :
    asset?.assetType === 'LOAD_ZONE' ? 'Modeled Spatial Demand Region' :
    asset?.assetType ?? 'Infrastructure'
  );
  const cityName = featureIdentity?.cityName ?? 'Active Metropolitan Grid';
  const coords = featureIdentity?.coordinates ?? asset?.coordinates ?? { latitude: 28.6139, longitude: 77.209 };
  const classification = featureIdentity?.classification ?? (asset?.classification as any) ?? 'CURRENT_PUBLIC';
  const source = featureIdentity?.source ?? asset?.source ?? 'OpenStreetMap / Utility Records';
  const sourceReference = featureIdentity?.provenance?.sourceReference ?? asset?.freshness ?? 'Public Geographic Data';

  // Electrical details if available
  const electrical = featureIdentity?.electricalDetails ?? (asset?.assetType === 'TRANSMISSION_LINE' || asset?.assetType === 'SUBSTATION' ? {
    assetType: asset?.assetType as any,
    voltageKV: asset?.voltageKV,
    capacityMW: asset?.nominalCapacityMVA,
    flowMW: asset?.activePowerFlowMW,
    signedFlowMW: asset?.signedFlowMW,
    flowDirection: asset?.flowDirection,
    directionDescription: asset?.directionDescription,
    fromName: asset?.fromSubstationName,
    toName: asset?.toSubstationName,
    loadingPercent: asset?.loadingPercent,
    status: asset?.status as any,
    upstreamInflows: asset?.upstreamSubstations,
    downstreamOutflows: asset?.downstreamSubstations,
    suppliedRegions: asset?.suppliedLoadRegions,
    geometryTypeDescription: asset?.geometryTypeDescription,
  } : undefined);

  // Building details if available
  const building = featureIdentity?.buildingDetails;

  // Load region details if available
  const loadRegion = featureIdentity?.loadRegionDetails ?? (asset?.assetType === 'LOAD_ZONE' ? {
    modeledDemandMW: asset.demandMW ?? asset.nominalCapacityMVA ?? 0,
    servedDemandMW: asset.suppliedMW ?? 0,
    unservedDemandMW: asset.unservedMW ?? 0,
    criticalDemandMW: 0,
    status: asset.status === 'TRIPPED' ? 'TOTAL_BLACKOUT' : (asset.unservedMW ?? 0) > 0 ? 'PARTIALLY_UNSERVED' : 'SUPPLIED',
    supplyingSubstations: asset.supplyingSubstations ?? [],
  } : undefined);

  const statusStr = electrical?.status ?? asset?.status ?? 'ONLINE';

  // Contextual Tabs: Do NOT show electrical tabs for plain buildings
  const availableTabs = useMemo(() => {
    const tabs: Array<{ id: 'IDENTITY' | 'GEODETIC' | 'ELECTRICAL' | 'DEMAND' | 'SIMULATION'; label: string }> = [
      { id: 'IDENTITY', label: 'Identity' },
      { id: 'GEODETIC', label: 'Geodetic' },
    ];
    if (electrical || category === 'SUBSTATION' || category === 'TRANSMISSION_LINE') {
      tabs.push({ id: 'ELECTRICAL', label: 'Electrical' });
    }
    if (building || loadRegion || category === 'LOAD_REGION') {
      tabs.push({ id: 'DEMAND', label: 'Demand' });
    }
    if (category === 'SUBSTATION' || category === 'TRANSMISSION_LINE' || category === 'CRITICAL_INFRASTRUCTURE') {
      tabs.push({ id: 'SIMULATION', label: 'Sim' });
    }
    return tabs;
  }, [electrical, category, building, loadRegion]);

  const [activeTab, setActiveTab] = useState<'IDENTITY' | 'GEODETIC' | 'ELECTRICAL' | 'DEMAND' | 'SIMULATION'>('IDENTITY');

  // Fallback to IDENTITY if activeTab is not relevant for current feature
  const effectiveTab = availableTabs.some((t) => t.id === activeTab) ? activeTab : 'IDENTITY';

  const handleCenterCamera = () => {
    if (onFlyToAsset) {
      onFlyToAsset({
        latitude: coords.latitude,
        longitude: coords.longitude,
        id,
        featureId: featureIdentity?.featureId,
      });
    }
  };

  return (
    <aside
      className={`relative flex h-full flex-col border-l border-[#1b2a38] bg-[#070d17] text-[#e0edf5] transition-all duration-300 ease-in-out z-30 select-none ${
        isOpen
          ? 'w-84 translate-x-0 opacity-100'
          : 'w-0 translate-x-full opacity-0 pointer-events-none border-l-0 overflow-hidden'
      }`}
    >
      {/* ─── Drawer Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-[#1b2a38] bg-[#09131f] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#00e5c8] shadow-[0_0_8px_#00e5c8]" />
          <h3 className="font-mono text-xs font-bold tracking-wider text-[#e0edf5] uppercase">
            Feature Inspector
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

      {!hasSelection ? (
        /* Empty State */
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#1b2a38] bg-[#0c1824] text-xl">
            🌍
          </div>
          <h4 className="font-mono text-xs font-semibold text-[#e0edf5]">No Feature Selected</h4>
          <p className="mt-1.5 font-sans text-xs leading-relaxed text-[#5a7a8f]">
            Click any building, substation, transmission line, or infrastructure feature on the map to inspect its authentic geographic identity and electrical parameters.
          </p>
        </div>
      ) : (
        /* Content when feature is selected */
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Identity Banner */}
          <div className="border-b border-[#1b2a38] bg-[#09131f]/80 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h4 className="font-mono text-xs font-bold text-[#e0edf5] truncate" title={name}>
                  {name}
                </h4>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] font-mono text-[#5a7a8f]">
                  <span>City: <span className="text-[#a0c4d8]">{cityName}</span></span>
                  {externalId && (
                    <span>OSM ID: <span className="text-[#38bdf8]">{externalId}</span></span>
                  )}
                </div>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold shrink-0 ${
                  statusStr === 'TRIPPED' || statusStr === 'FAILED'
                    ? 'border border-[#d9383a]/40 bg-[#d9383a]/15 text-[#ff6b6b]'
                    : statusStr === 'OVERLOADED' || statusStr === 'DEGRADED'
                    ? 'border border-[#f5a623]/40 bg-[#f5a623]/15 text-[#f5a623]'
                    : 'border border-[#00e5c8]/40 bg-[#00e5c8]/15 text-[#00e5c8]'
                }`}
              >
                {statusStr}
              </span>
            </div>

            {/* Classification & Category Badges */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[9px]">
              <span
                className={`rounded px-1.5 py-0.5 font-semibold ${
                  classification === 'VERIFIED_EXTERNAL'
                    ? 'bg-[#00e5c8]/15 text-[#00e5c8]'
                    : classification === 'CURRENT_PUBLIC'
                    ? 'bg-[#3a86ff]/15 text-[#3a86ff]'
                    : classification === 'MODELED' || classification === 'SIMULATED'
                    ? 'bg-[#8338ec]/15 text-[#d8b4fe]'
                    : 'bg-[#f5a623]/15 text-[#f5a623]'
                }`}
              >
                ● {classification.replace('_', ' ')}
              </span>
              <span className="rounded bg-[#0c1824] px-1.5 py-0.5 text-[#5a7a8f]">
                {category}
              </span>
            </div>

            {/* Quick Action: Persistent CENTER CAMERA ON FEATURE */}
            {onFlyToAsset && (
              <div className="mt-2.5">
                <button
                  onClick={handleCenterCamera}
                  className="w-full flex items-center justify-center gap-1.5 rounded border border-[#00e5c8]/50 bg-[#00e5c8]/10 py-1.5 text-[10px] font-mono font-bold text-[#00e5c8] hover:bg-[#00e5c8]/20 transition shadow-sm"
                  title="Smoothly center 3D MapLibre camera onto this feature"
                >
                  <span>🎯</span>
                  <span>CENTER CAMERA ON FEATURE</span>
                </button>
              </div>
            )}
          </div>

          {/* Dynamic Contextual Tab Selector */}
          <div className="flex border-b border-[#1b2a38] bg-[#050a12] text-[10px]">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-1.5 font-mono font-medium transition ${
                  effectiveTab === tab.id
                    ? 'border-b-2 border-[#00e5c8] bg-[#09131f] text-[#00e5c8]'
                    : 'text-[#5a7a8f] hover:text-[#e0edf5]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content Panels */}
          <div className="flex-1 overflow-y-auto p-3.5 font-mono text-xs space-y-3">
            {/* ─── TAB: IDENTITY ────────────────────────────────────── */}
            {effectiveTab === 'IDENTITY' && (
              <div className="space-y-3">
                <div>
                  <span className="text-[10px] text-[#5a7a8f]">FEATURE TYPE</span>
                  <div className="font-semibold text-[#e0edf5]">{featureType}</div>
                </div>

                {category === 'BUILDING' && building && (
                  <div className="rounded border border-[#1b2a38] bg-[#09131f] p-2.5 space-y-1.5">
                    <span className="text-[10px] font-bold text-[#38bdf8]">BUILDING SPECIFICATION</span>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#5a7a8f]">USAGE TYPE:</span>
                      <span className="text-[#e0edf5] font-semibold">{building.usageType}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#5a7a8f]">FLOOR AREA:</span>
                      <span className="text-[#e0edf5]">{building.areaSqMeters ? `${building.areaSqMeters.toLocaleString()} m²` : 'Footprint polygon'}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#5a7a8f]">HEIGHT / FLOORS:</span>
                      <span className="text-[#e0edf5]">{building.heightMeters ? `${building.heightMeters}m (${building.floorCount} floors)` : `${building.floorCount} floors`}</span>
                    </div>
                  </div>
                )}

                {category === 'SUBSTATION' && electrical && (
                  <div className="rounded border border-[#1b2a38] bg-[#09131f] p-2.5 space-y-1.5">
                    <span className="text-[10px] font-bold text-[#00e5c8]">SUBSTATION SPECIFICATION</span>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#5a7a8f]">VOLTAGE RATING:</span>
                      <span className="font-mono font-bold text-[#e0edf5]">{electrical.voltageKV ?? 400} kV</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#5a7a8f]">RATED CAPACITY:</span>
                      <span className="font-mono font-bold text-[#e0edf5]">{electrical.capacityMW ?? 800} MVA</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#5a7a8f]">CURRENT LOADING:</span>
                      <span className="font-mono font-bold text-[#00e5c8]">{(electrical.loadingPercent ?? 50).toFixed(1)}%</span>
                    </div>
                  </div>
                )}

                {category === 'TRANSMISSION_LINE' && electrical && (
                  <div className="rounded border border-[#1b2a38] bg-[#09131f] p-2.5 space-y-1.5">
                    <span className="text-[10px] font-bold text-[#00e5c8]">TRANSMISSION CORRIDOR</span>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#5a7a8f]">ACTIVE FLOW:</span>
                      <span className="font-mono font-bold text-[#00e5c8]">{(electrical.flowMW ?? 0).toFixed(1)} MW</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-[#5a7a8f]">DIRECTION:</span>
                      <span className="font-mono text-[#e0edf5]">{electrical.directionDescription ?? 'A → B'}</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-[#5a7a8f]">CAPACITY:</span>
                      <span className="text-[#e0edf5]">{electrical.capacityMW ?? 600} MW</span>
                    </div>
                  </div>
                )}

                {/* Provenance Box */}
                <div className="rounded border border-[#1b2a38] bg-[#09131f] p-2.5">
                  <span className="text-[10px] font-bold text-[#00e5c8]">DATA PROVENANCE</span>
                  <div className="mt-1 text-[11px] text-[#e0edf5]">{source}</div>
                  <div className="mt-0.5 text-[9px] text-[#5a7a8f]">Ref: {sourceReference}</div>
                  <div className="mt-1 text-[9px] text-[#38bdf8]">Classification: {classification}</div>
                </div>
              </div>
            )}

            {/* ─── TAB: GEODETIC ────────────────────────────────────── */}
            {effectiveTab === 'GEODETIC' && (
              <div className="space-y-3">
                <div className="rounded border border-[#1b2a38] bg-[#09131f] p-2.5 space-y-2">
                  <span className="text-[10px] font-bold text-[#00e5c8]">GEODETIC POSITION</span>
                  <div className="text-[11px] text-[#e0edf5]">
                    <div>Latitude: <span className="font-mono font-semibold text-[#38bdf8]">{coords.latitude.toFixed(6)}° N</span></div>
                    <div>Longitude: <span className="font-mono font-semibold text-[#38bdf8]">{coords.longitude.toFixed(6)}° E</span></div>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-[#5a7a8f]">METROPOLITAN REGION</span>
                  <div className="text-[#e0edf5] font-semibold">{cityName}</div>
                </div>
                {onFlyToAsset && (
                  <button
                    onClick={handleCenterCamera}
                    className="w-full rounded border border-[#00e5c8]/50 bg-[#00e5c8]/15 py-2 text-[11px] font-bold text-[#00e5c8] hover:bg-[#00e5c8]/25 transition"
                  >
                    🎯 CENTER CAMERA ON FEATURE
                  </button>
                )}
              </div>
            )}

            {/* ─── TAB: ELECTRICAL ──────────────────────────────────── */}
            {effectiveTab === 'ELECTRICAL' && (
              <div className="space-y-3">
                {electrical ? (
                  <>
                    <div className="flex items-center justify-between text-[10px] border-b border-[#1b2a38] pb-1">
                      <span className="text-[#5a7a8f]">RELATIONSHIP CLASSIFICATION</span>
                      <span className="font-bold text-[#00e5c8]">VERIFIED TOPOLOGICAL</span>
                    </div>

                    {electrical.assetType === 'TRANSMISSION_LINE' && (
                      <div className="space-y-2">
                        <span className="text-[10px] text-[#5a7a8f]">POWER FLOW VECTORS</span>
                        <div className="rounded border border-[#1b2a38] bg-[#0c1824] p-2.5 text-[10px] space-y-1.5">
                          <div className="flex justify-between">
                            <span className="text-[#5a7a8f]">FROM:</span>
                            <span className="text-[#e0edf5] font-semibold">{electrical.fromName ?? 'Terminal A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#5a7a8f]">TO:</span>
                            <span className="text-[#e0edf5] font-semibold">{electrical.toName ?? 'Terminal B'}</span>
                          </div>
                          <div className="flex justify-between text-[#00e5c8] font-bold pt-1.5 border-t border-[#1b2a38]">
                            <span>DIRECTION:</span>
                            <span>{electrical.directionDescription}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {electrical.assetType === 'SUBSTATION' && (
                      <>
                        <div>
                          <span className="text-[10px] text-[#5a7a8f]">UPSTREAM SOURCES (INFLOWS)</span>
                          {electrical.upstreamInflows && electrical.upstreamInflows.length > 0 ? (
                            <ul className="mt-1 space-y-1">
                              {electrical.upstreamInflows.map((s, idx) => (
                                <li key={idx} className="flex justify-between rounded border border-[#1b2a38] bg-[#0c1824] p-1.5 text-[10px]">
                                  <span className="text-[#e0edf5]">⬆ {s.name}</span>
                                  <span className="font-mono font-bold text-[#00e5c8]">+{s.flowMW.toFixed(1)} MW</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="mt-1 text-[10px] text-[#5a7a8f]">LOCAL GENERATION / PERIMETER INFLOW</div>
                          )}
                        </div>

                        <div>
                          <span className="text-[10px] text-[#5a7a8f]">DOWNSTREAM DELIVERIES (OUTFLOWS)</span>
                          {electrical.downstreamOutflows && electrical.downstreamOutflows.length > 0 ? (
                            <ul className="mt-1 space-y-1">
                              {electrical.downstreamOutflows.map((s, idx) => (
                                <li key={idx} className="flex justify-between rounded border border-[#1b2a38] bg-[#0c1824] p-1.5 text-[10px]">
                                  <span className="text-[#a0c4d8]">⬇ {s.name}</span>
                                  <span className="font-mono font-bold text-[#38bdf8]">{s.flowMW.toFixed(1)} MW</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="mt-1 text-[10px] text-[#5a7a8f]">LOCAL URBAN DISTRIBUTION LOADS</div>
                          )}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="p-3 text-center text-[#5a7a8f] text-[10px]">
                    No high-voltage transmission interconnect mapped to this feature.
                  </div>
                )}
              </div>
            )}

            {/* ─── TAB: MODELED DEMAND ───────────────────────────────── */}
            {effectiveTab === 'DEMAND' && (
              <div className="space-y-3">
                {building && (
                  <div className="rounded border border-[#f5a623]/30 bg-[#f5a623]/10 p-3 space-y-2">
                    <span className="text-[10px] font-bold text-[#f5a623]">ESTIMATED ELECTRICAL LOAD</span>
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono text-xl font-bold text-[#e0edf5]">
                        {building.modeledDemandMW.toFixed(2)} MW
                      </span>
                      <span className="rounded bg-[#f5a623]/25 px-1.5 py-0.5 text-[8px] font-bold text-[#f5a623]">
                        MODELED
                      </span>
                    </div>
                    <div className="text-[10px] font-bold text-[#ff6b6b]">
                      ⚠️ MODELED — NOT UTILITY TELEMETRY
                    </div>
                    <p className="text-[9px] text-[#88a4b8] leading-relaxed">
                      Demand is synthesized deterministically from municipal footprint area ({building.areaSqMeters} m²), floor multiplier ({building.floorCount} floors), and {building.usageType} power density. Private SCADA or AMI telemetry is not accessed.
                    </p>
                  </div>
                )}

                {loadRegion && (
                  <div className="rounded border border-[#1b2a38] bg-[#09131f] p-2.5 space-y-1.5">
                    <span className="text-[10px] font-bold text-[#00e5c8]">REGIONAL LOAD SUMMARY</span>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#5a7a8f]">DEMAND:</span>
                      <span className="font-mono font-bold text-[#e0edf5]">{loadRegion.modeledDemandMW.toFixed(1)} MW</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#5a7a8f]">DELIVERED:</span>
                      <span className="font-mono font-bold text-[#00e5c8]">{loadRegion.servedDemandMW.toFixed(1)} MW</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-[#5a7a8f]">UNSERVED:</span>
                      <span className={`font-mono font-bold ${loadRegion.unservedDemandMW > 0 ? 'text-[#ef4444]' : 'text-[#88a4b8]'}`}>
                        {loadRegion.unservedDemandMW.toFixed(1)} MW
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ─── TAB: SIMULATION ───────────────────────────────────── */}
            {effectiveTab === 'SIMULATION' && (
              <div className="space-y-3">
                <div className="rounded border border-[#d9383a]/30 bg-[#d9383a]/10 p-3 space-y-2">
                  <span className="text-[10px] font-bold text-[#ff6b6b]">SIMULATE ASSET CONTINGENCY</span>
                  <p className="text-[9px] text-[#88a4b8] leading-relaxed">
                    Inject simulated physical trip on this component to evaluate real-time load shedding and power flow re-routing.
                  </p>
                  <button
                    onClick={() => {
                      if (onTripAsset) {
                        onTripAsset(featureIdentity ?? asset);
                      }
                    }}
                    className="w-full rounded border border-[#d9383a] bg-[#d9383a]/20 py-2 text-[10px] font-bold text-[#ff6b6b] hover:bg-[#d9383a]/30 transition"
                  >
                    ⚡ SIMULATE FAULT / OUTAGE
                  </button>
                  {statusStr.includes('TRIPPED') || statusStr.includes('FAILED') ? (
                    <button
                      onClick={() => {
                        if (onRestoreAsset) {
                          onRestoreAsset(featureIdentity ?? asset);
                        }
                      }}
                      className="w-full mt-1.5 rounded border border-[#00e5c8] bg-[#00e5c8]/20 py-2 text-[10px] font-bold text-[#00e5c8] hover:bg-[#00e5c8]/30 transition"
                    >
                      🔄 RESTORE & CLEAR FAULT
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
