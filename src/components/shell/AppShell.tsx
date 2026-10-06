'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useVajraStore } from '@/store/vajraStore';
import { CANONICAL_CITIES_REGISTRY, CANONICAL_POWER_ASSETS } from '@/data/canonicalCitiesData';
import type { PowerAsset } from '@/types/powerAsset';

// Navigation Views
import OverviewView from '@/components/views/OverviewView';
import ElectricalSchematicView from '@/components/grid/ElectricalSchematicView';
import dynamic from 'next/dynamic';
const GeoTwinView = dynamic(() => import('@/components/geo/GeoTwinView'), { ssr: false });
import EventsView from '@/components/views/EventsView';
import ScenariosView from '@/components/views/ScenariosView';
import AnalyticsView from '@/components/views/AnalyticsView';
import DataSourcesView from '@/components/views/DataSourcesView';

// Shell Panes
import AssetInspectorDrawer from '@/components/shell/AssetInspectorDrawer';
import BottomTimelineBar from '@/components/shell/BottomTimelineBar';

import { GeoSimulationCoordinator } from '@/simulation/geo/geoSimulationCoordinator';
import { DEFAULT_GEO_TWIN_STATE } from '@/store/vajraStore';
import { tickToTimestamp } from '@/lib/utils';

export type NavViewId =
  | 'overview'
  | 'geotwin'
  | 'topology'
  | 'events'
  | 'scenarios'
  | 'analytics'
  | 'datasources';

export default function AppShell() {
  const currentCity = useVajraStore((s) => s.geoTwin?.selectedCity);
  const geoTwin = useVajraStore((s) => s.geoTwin);
  const selectedEntityId = useVajraStore((s) => s.geoTwin?.selectedEntityId);
  const selectedFeatureIdentity = useVajraStore((s) => s.geoTwin?.selectedFeatureIdentity);
  const selectGeoEntity = useVajraStore((s) => s.selectGeoEntity);
  const searchAndNavigateCity = useVajraStore((s) => s.searchAndNavigateCity);
  const clock = useVajraStore((s) => s.clock);
  const metrics = useVajraStore((s) => s.metrics);
  const activeCascade = useVajraStore((s) => s.activeCascade);
  const topology = useVajraStore((s) => s.topology);
  const injectFault = useVajraStore((s) => s.injectFault);
  const generateRecovery = useVajraStore((s) => s.generateRecovery);
  const executeRecovery = useVajraStore((s) => s.executeRecovery);
  const initialized = useVajraStore((s) => s.initialized);
  const initialize = useVajraStore((s) => s.initialize);

  // Shell State
  const [activeNav, setActiveNav] = useState<NavViewId>('geotwin');
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(true);
  const [citySelectorOpen, setCitySelectorOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__vajraStore = useVajraStore;
    }
    if (!initialized) {
      initialize();
    }
  }, [initialized, initialize]);

  useEffect(() => {
    if (selectedEntityId || selectedFeatureIdentity) {
      setIsInspectorOpen(true);
    }
  }, [selectedEntityId, selectedFeatureIdentity]);

  // Initial 8 cities
  const cityId = currentCity?.id ?? 'city-delhi';
  const cityRegistry = CANONICAL_CITIES_REGISTRY[cityId] || null;
  const allPowerAssets = useMemo(() => {
    return CANONICAL_POWER_ASSETS[cityId] || [];
  }, [cityId]);


  // Selected Power Asset with Dynamic Operational Simulation State (Phase 5 Electrical Architecture)
  const selectedAsset = useMemo(() => {
    if (!selectedEntityId) return null;

    // Strictly isolated to the active city - no cross-city leakage
    let base = allPowerAssets.find((a) => a.id === selectedEntityId) || null;

    // Check if selectedEntityId is a transmission line in topology
    if (!base) {
      const line = topology.transmissionLines.find(
        (l) => l.id === selectedEntityId || l.name === selectedEntityId || selectedEntityId.includes(l.id),
      );
      if (line) {
        const fromSub = topology.substations.find((s) => s.id === line.fromId);
        const toSub = topology.substations.find((s) => s.id === line.toId);
        const signedFlow = line.currentFlowMW || 0;
        const absFlow = Math.abs(signedFlow);
        const fromName = fromSub?.name ?? line.fromId;
        const toName = toSub?.name ?? line.toId;
        const directionStr = signedFlow >= 0 ? `${fromName} → ${toName}` : `${toName} → ${fromName}`;

        base = {
          id: line.id,
          assetType: 'TRANSMISSION_LINE' as any,
          name: line.name || `400kV Transmission Link (${line.id})`,
          operator: 'State Transmission Utility (Transco) / PGCIL',
          coordinates: fromSub?.geoRef?.coordinates || { latitude: 28.6139, longitude: 77.209 },
          voltageKV: 400,
          nominalCapacityMVA: line.capacityMW,
          status: line.status === 'FAILED' ? 'TRIPPED' : line.loadingPercent >= 100 ? 'DEGRADED' : 'ONLINE',
          loadingPercent: line.loadingPercent,
          source: 'Simulated Electrical State / CEA SLD Topology',
          sourceUrl: '',
          retrievedAt: new Date().toISOString(),
          updateFrequency: 'REALTIME',
          freshness: 'Dynamic DC Power Flow Solver',
          confidence: 'HIGH',
          classification: 'CURRENT_PUBLIC',
          geometryProvenance: 'ESTIMATED_COORDINATE',
          topologyProvenance: 'VERIFIED_UTILITY_SLD',
          connectedAssetIds: [line.fromId, line.toId],
          activePowerFlowMW: absFlow,
          signedFlowMW: signedFlow,
          flowDirection: signedFlow >= 0 ? 'A_TO_B' : 'B_TO_A',
          directionDescription: directionStr,
          fromSubstationId: line.fromId,
          toSubstationId: line.toId,
          fromSubstationName: fromName,
          toSubstationName: toName,
          geometryTypeDescription: 'SCHEMATIC TRANSMISSION CONNECTION',
        } as any;
      }
    }

    // Check if selectedEntityId is a substation in topology
    if (!base) {
      const sub = topology.substations.find((s) => s.id === selectedEntityId);
      if (sub) {
        const subLoading = sub.capacityMW > 0 ? (sub.currentLoadMW / sub.capacityMW) * 100 : 0;
        base = {
          id: sub.id,
          assetType: 'SUBSTATION' as any,
          name: sub.name,
          operator: 'State Transmission Utility (Transco) / PGCIL',
          coordinates: sub.geoRef?.coordinates || { latitude: 28.6139, longitude: 77.209 },
          voltageKV: sub.type === 'transmission' ? 400 : 220,
          nominalCapacityMVA: sub.capacityMW,
          status: sub.status === 'FAILED' ? 'TRIPPED' : subLoading >= 100 ? 'DEGRADED' : 'ONLINE',
          loadingPercent: subLoading,
          source: 'Verified CEA Utility SLD / OpenStreetMap',
          sourceUrl: '',
          retrievedAt: new Date().toISOString(),
          updateFrequency: 'DAILY',
          freshness: 'Verified Substation Node',
          confidence: 'HIGH',
          classification: 'CURRENT_PUBLIC',
          geometryProvenance: 'FIELD_SURVEYED',
          topologyProvenance: 'VERIFIED_UTILITY_SLD',
          connectedAssetIds: sub.connectedLines ?? [],
        } as any;
      }
    }

    // Check if selectedEntityId is a service region in geoTwin
    if (!base && geoTwin?.serviceRegions) {
      const region = geoTwin.serviceRegions.find((r) => r.id === selectedEntityId);
      if (region) {
        const regImpact = geoTwin.simulationImpact?.serviceRegionImpacts?.[region.id];
        const supplyingSub = topology.substations.find((s) => s.id === region.substationId);
        const subName = supplyingSub?.name ?? region.substationName ?? region.substationId;
        const demandMW = regImpact?.totalDemandMW ?? region.totalEstimatedDemandMW;
        const servedMW = regImpact?.servedDemandMW ?? demandMW;
        const unservedMW = regImpact?.unservedDemandMW ?? 0;

        base = {
          id: region.id,
          assetType: 'LOAD_ZONE' as any,
          name: (region as any).name || (region.substationName ? `${region.substationName} Service Region` : `Service Region ${region.id}`),
          operator: 'Distribution Utility (Discom)',
          coordinates: {
            latitude: region.boundaryPolygon?.[0]?.latitude ?? region.centerCoordinates.latitude,
            longitude: region.boundaryPolygon?.[0]?.longitude ?? region.centerCoordinates.longitude,
          },
          voltageKV: 11,
          nominalCapacityMVA: demandMW,
          status: regImpact?.blackoutState === 'TOTAL_BLACKOUT' ? 'TRIPPED' : regImpact?.blackoutState === 'PARTIAL_CURTAILMENT' ? 'DEGRADED' : 'ONLINE',
          loadingPercent: demandMW > 0 ? (servedMW / demandMW) * 100 : 100,
          source: 'Modeled Spatial Demand / OpenStreetMap Boundaries',
          sourceUrl: '',
          retrievedAt: new Date().toISOString(),
          updateFrequency: 'DAILY',
          freshness: 'Synthesized Geospatial Cluster',
          confidence: 'MEDIUM',
          classification: 'INFERRED',
          geometryProvenance: 'APPROXIMATE_BOUNDS',
          topologyProvenance: 'INFERRED_SPATIAL_TIE',
          connectedAssetIds: [region.substationId],
          demandMW,
          suppliedMW: servedMW,
          unservedMW,
          supplyingSubstations: [{ id: region.substationId, name: subName, flowMW: servedMW }],
          geometryTypeDescription: 'MODELED SPATIAL DEMAND REGION',
        } as any;
      }
    }

    if (!base) return null;

    // Check dynamic simulation state from authoritative topology
    const elecId = (base as any).electricalAssetId;
    const sub = topology.substations.find(
      (s) => s.id === base.id || (elecId && s.id === elecId) || base.id.includes(s.id) || s.id.includes(base.id),
    );
    const line = topology.transmissionLines.find(
      (l) => l.id === base.id || (elecId && l.id === elecId) || l.name === base.name,
    );

    let simStatus: string = base.status;
    let loading = base.loadingPercent ?? 0;
    let upstreamSubstations: { id: string; name: string; flowMW: number }[] = (base as any).upstreamSubstations || [];
    let downstreamSubstations: { id: string; name: string; flowMW: number }[] = (base as any).downstreamSubstations || [];
    let suppliedLoadRegions: string[] = (base as any).suppliedLoadRegions || [];

    if (sub) {
      const subLoading = sub.capacityMW > 0 ? (sub.currentLoadMW / sub.capacityMW) * 100 : ((sub as any).loadingPercent ?? 65);
      simStatus =
        sub.status === 'FAILED' || sub.status === 'ISOLATED'
          ? 'SIMULATED TRIPPED'
          : subLoading >= 100
          ? 'SIMULATED OVERLOAD'
          : subLoading >= 85
          ? 'SIMULATED WARNING'
          : 'ONLINE';
      loading = subLoading;

      // Calculate Upstream Sources (inflows) and Downstream Deliveries (outflows)
      upstreamSubstations = [];
      downstreamSubstations = [];

      topology.transmissionLines.forEach((l) => {
        const flow = l.currentFlowMW || 0;
        if (l.toId === sub.id) {
          const other = topology.substations.find((s) => s.id === l.fromId);
          const otherName = other?.name || l.fromId;
          if (flow >= 0) {
            upstreamSubstations.push({ id: l.fromId, name: otherName, flowMW: Math.abs(flow) });
          } else {
            downstreamSubstations.push({ id: l.fromId, name: otherName, flowMW: Math.abs(flow) });
          }
        } else if (l.fromId === sub.id) {
          const other = topology.substations.find((s) => s.id === l.toId);
          const otherName = other?.name || l.toId;
          if (flow >= 0) {
            downstreamSubstations.push({ id: l.toId, name: otherName, flowMW: Math.abs(flow) });
          } else {
            upstreamSubstations.push({ id: l.toId, name: otherName, flowMW: Math.abs(flow) });
          }
        }
      });

      // Include generators feeding this substation
      topology.generators.forEach((g) => {
        if (g.connectedTo?.includes(sub.id) || g.id === sub.id) {
          upstreamSubstations.push({ id: g.id, name: `${g.name} (${g.type.toUpperCase()})`, flowMW: g.currentOutputMW });
        }
      });

      // Find supplied service regions
      suppliedLoadRegions = (geoTwin?.serviceRegions || [])
        .filter((r) => r.substationId === sub.id || r.substationId === base.id)
        .map((r) => (r as any).name || `${r.substationName} Service Region`);
    } else if (line) {
      simStatus =
        line.status === 'FAILED'
          ? 'SIMULATED TRIPPED'
          : line.loadingPercent >= 100
          ? 'SIMULATED OVERLOAD'
          : line.loadingPercent >= 85
          ? 'SIMULATED WARNING'
          : 'ONLINE';
      loading = line.loadingPercent;
    }

    return {
      ...base,
      status: simStatus as any,
      loadingPercent: loading,
      upstreamSubstations,
      downstreamSubstations,
      suppliedLoadRegions,
    };
  }, [allPowerAssets, selectedEntityId, topology, geoTwin]);

  // Simulation Status derivation
  const isCascadeActive = (activeCascade?.affectedAssetIds?.length ?? 0) > 0;
  const isFrequencyStressed = Math.abs(metrics.systemFrequencyHz - 50.0) > 0.2;

  const simulationStatus = isCascadeActive
    ? { label: 'CASCADE ACTIVE', color: 'bg-[#d9383a]/20 text-[#ff6b6b] border-[#d9383a]/50' }
    : isFrequencyStressed
    ? { label: 'GRID STRESSED', color: 'bg-[#f5a623]/20 text-[#f5a623] border-[#f5a623]/50' }
    : { label: 'NORMAL OPERATION', color: 'bg-[#00e5c8]/15 text-[#00e5c8] border-[#00e5c8]/40' };

  // Navigation Items
  const navItems: { id: NavViewId; label: string; icon: string; shortcut: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📊', shortcut: '1' },
    { id: 'geotwin', label: 'Geo-Twin', icon: '🌍', shortcut: '2' },
    { id: 'topology', label: 'Grid Topology', icon: '⚡', shortcut: '3' },
    { id: 'events', label: 'Events', icon: '🔔', shortcut: '4' },
    { id: 'scenarios', label: 'Scenarios', icon: '🎯', shortcut: '5' },
    { id: 'analytics', label: 'Analytics', icon: '📈', shortcut: '6' },
    { id: 'datasources', label: 'Data Sources', icon: '🛡️', shortcut: '7' },
  ];

  const handleCitySelect = async (cId: string) => {
    setCitySelectorOpen(false);
    await searchAndNavigateCity(cId);
  };

  const handleFlyToGeo = (target: any) => {
    setActiveNav('geotwin');
    if (!target) return;

    if (target.id) {
      selectGeoEntity(target.id);
    } else if (target.featureId) {
      selectGeoEntity(target.featureId);
    }

    const lat =
      target.latitude ??
      target.coordinates?.latitude ??
      selectedFeatureIdentity?.coordinates?.latitude ??
      selectedAsset?.coordinates?.latitude;
    const lng =
      target.longitude ??
      target.coordinates?.longitude ??
      selectedFeatureIdentity?.coordinates?.longitude ??
      selectedAsset?.coordinates?.longitude;

    if (typeof lat === 'number' && typeof lng === 'number' && typeof window !== 'undefined') {
      const adapter = (window as any).__vajraMapAdapter || (window as any).__vajra_mapAdapter;
      if (adapter?.flyToCoordinates) {
        adapter.flyToCoordinates({ latitude: lat, longitude: lng }, 16);
      } else if ((window as any).__vajraMap?.flyTo) {
        (window as any).__vajraMap.flyTo({
          center: [lng, lat],
          zoom: 16,
          pitch: 48,
          duration: 1500,
          essential: true,
        });
      }
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#050a12] text-[#e0edf5]">
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 1. TOP BAR                                                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <header className="z-20 flex h-13 items-center justify-between border-b border-[#1b2a38] bg-[#070d17] px-4 font-mono select-none">
        {/* Left: Brand & City Selector */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#00e5c8]/40 bg-[#00e5c8]/10 text-sm font-bold text-[#00e5c8]">
              Ω
            </span>
            <div className="leading-tight">
              <span className="font-bold tracking-wider text-[#e0edf5]">VAJRA-Ω</span>
              <span className="ml-1 text-[9px] text-[#5a7a8f]">DIGITAL TWIN</span>
            </div>
          </div>

          <div className="h-4 w-px bg-[#1b2a38]" />

          {/* Current City Dropdown Switcher */}
          <div className="relative">
            <button
              onClick={() => setCitySelectorOpen(!citySelectorOpen)}
              className="flex items-center gap-2 rounded-lg border border-[#1b2a38] bg-[#0c1824] px-2.5 py-1 text-xs text-[#e0edf5] transition hover:border-[#00e5c8]"
            >
              <span className="text-[11px] text-[#00e5c8]">📍</span>
              <span className="font-bold">{cityRegistry.canonicalName}</span>
              <span className="text-[10px] text-[#5a7a8f]">▼</span>
            </button>

            {/* City Dropdown Menu */}
            {citySelectorOpen && (
              <div className="absolute top-9 left-0 z-50 w-72 rounded-xl border border-[#1b2a38] bg-[#09131f] p-2 shadow-2xl backdrop-blur">
                <div className="px-2 py-1 text-[10px] font-bold text-[#5a7a8f] uppercase">
                  Select Indian Metropolis
                </div>
                <div className="mt-1 space-y-1">
                  {Object.values(CANONICAL_CITIES_REGISTRY).map((c) => (
                    <button
                      key={c.cityId}
                      onClick={() => handleCitySelect(c.cityId)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                        c.cityId === cityId
                          ? 'border border-[#00e5c8]/40 bg-[#00e5c8]/10 text-[#00e5c8]'
                          : 'text-[#e0edf5] hover:bg-[#101d2c]'
                      }`}
                    >
                      <div>
                        <div className="font-bold">{c.canonicalName}</div>
                        <div className="text-[10px] text-[#5a7a8f]">{c.state}</div>
                      </div>
                      <span className="rounded bg-[#0c1824] px-1.5 py-0.5 text-[9px] text-[#5a7a8f]">
                        {c.coverageStatus}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: System Status & Provenance Badges */}
        <div className="hidden items-center gap-3 md:flex">
          {/* Simulation Status Badge */}
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${simulationStatus.color}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            <span>{simulationStatus.label}</span>
          </div>

          {/* Data Provenance Badge */}
          <div className="flex items-center gap-1.5 rounded-lg border border-[#3a86ff]/40 bg-[#3a86ff]/10 px-2.5 py-1 text-[11px] font-bold text-[#3a86ff]">
            <span>🛡️</span>
            <span>CURRENT PUBLIC DATA (CEA / OSM)</span>
          </div>
        </div>

        {/* Right: Simulation Clock & Inspector Toggle */}
        <div className="flex items-center gap-3">
          <div className="text-right text-xs">
            <div className="font-bold text-[#e0edf5]">{tickToTimestamp(clock.tick)}</div>
            <div className="text-[10px] text-[#5a7a8f]">Tick: {clock.tick}</div>
          </div>

          <button
            onClick={() => setIsInspectorOpen(!isInspectorOpen)}
            className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition ${
              isInspectorOpen
                ? 'border-[#00e5c8] bg-[#00e5c8]/15 text-[#00e5c8]'
                : 'border-[#1b2a38] bg-[#0c1824] text-[#5a7a8f] hover:text-[#e0edf5]'
            }`}
            title="Toggle Asset Inspector Drawer"
          >
            <span>🔍</span>
            <span className="hidden sm:inline">Inspector</span>
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 2. BODY (Left Nav + Main Canvas + Right Inspector)                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* ─── Left Navigation Bar ───────────────────────────────────────── */}
        <nav className="flex w-16 flex-col items-center border-r border-[#1b2a38] bg-[#070d17] py-3 select-none lg:w-48">
          <div className="w-full space-y-1 px-2">
            {navItems.map((item) => {
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left font-mono transition ${
                    isActive
                      ? 'border border-[#00e5c8]/50 bg-[#00e5c8]/15 text-[#00e5c8]'
                      : 'text-[#5a7a8f] hover:bg-[#0c1824] hover:text-[#e0edf5]'
                  }`}
                  title={`${item.label} (Press ${item.shortcut})`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="hidden text-xs font-semibold lg:inline">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Bottom Telemetry Status Pill */}
          <div className="mt-auto hidden w-full px-3 text-[10px] text-[#5a7a8f] lg:block">
            <div className="rounded-lg border border-[#1b2a38] bg-[#09131f] p-2 text-center">
              <div className="text-[9px] text-[#ff6b6b]">SCADA: UNLINKED</div>
              <div className="text-[8px] text-[#5a7a8f]">SIM ENGINE ACTIVE</div>
            </div>
          </div>
        </nav>

        {/* ─── Main Canvas (Primary Visualization Area) ───────────────────── */}
        <main className="relative flex flex-1 flex-col overflow-hidden bg-[#050a12]">
          {activeNav === 'overview' && <OverviewView onNavigate={setActiveNav} />}
          {activeNav === 'geotwin' && <GeoTwinView />}
          {activeNav === 'topology' && (
            <ElectricalSchematicView
              onAssetSelect={(asset) => {
                if (asset) {
                  selectGeoEntity(asset.id);
                  setIsInspectorOpen(true);
                }
              }}
              onFlyToGeo={handleFlyToGeo}
            />
          )}
          {activeNav === 'events' && <EventsView />}
          {activeNav === 'scenarios' && <ScenariosView />}
          {activeNav === 'analytics' && <AnalyticsView />}
          {activeNav === 'datasources' && <DataSourcesView />}
        </main>

        {/* ─── Right Inspector Drawer ────────────────────────────────────── */}
        <AssetInspectorDrawer
          asset={selectedAsset}
          featureIdentity={selectedFeatureIdentity}
          isOpen={isInspectorOpen}
          onClose={() => setIsInspectorOpen(false)}
          onFlyToAsset={handleFlyToGeo}
          onTripAsset={(assetOrIdentity) => {
            const assetId = (assetOrIdentity as any).featureId || (assetOrIdentity as any).id;
            const assetType = (assetOrIdentity as any).category || (assetOrIdentity as any).assetType;
            if (assetType === 'TRANSMISSION_LINE') {
              injectFault('LINE_FAILURE', [assetId]);
            } else {
              const target = GeoSimulationCoordinator.resolveGeoFaultTarget(
                assetId,
                geoTwin ?? { ...DEFAULT_GEO_TWIN_STATE },
                topology,
              );
              if (target) {
                injectFault('SUBSTATION_FAILURE', [target.targetAssetId]);
              } else {
                injectFault('SUBSTATION_FAILURE', [assetId]);
              }
            }
          }}
          onRestoreAsset={(_asset) => {
            generateRecovery();
            executeRecovery();
          }}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 3. BOTTOM TIMELINE & SIMULATION CONTROLS                            */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <BottomTimelineBar />
    </div>
  );
}
