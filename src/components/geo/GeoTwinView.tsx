'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useVajraStore } from '@/store/vajraStore';
import type {
  GeoLayerId,
} from '@/types/geo';
import { RealGeoDataProvider } from '@/simulation/geo/realGeoDataProvider';
import type { CityTwinPackage } from '@/simulation/geo/geoProvider';
import { MapEngineAdapter, type MapBackdropMode } from '@/simulation/geo/mapEngineAdapter';
import { GeoElectricalStateAdapter } from '@/simulation/geo/geoElectricalStateAdapter';
import { FeatureIdentityResolver } from '@/simulation/geo/featureIdentityResolver';
import { DEFAULT_GEO_TWIN_STATE } from '@/store/vajraStore';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface GeoLayerGroup {
  title: string;
  layers: { id: GeoLayerId; label: string; icon: string; tooltip: string }[];
}

const LAYER_GROUPS: GeoLayerGroup[] = [
  {
    title: 'GEOGRAPHY',
    layers: [
      { id: 'BASE_MAP', label: 'Base Map', icon: '🗺', tooltip: 'Toggle street and cartographic basemap terrain' },
      { id: 'BUILDINGS', label: 'Buildings', icon: '🏢', tooltip: 'Toggle 3D and 2D building footprints' },
      { id: 'CRITICAL_INFRASTRUCTURE', label: 'Critical Infra', icon: '🏥', tooltip: 'Shows high-priority facilities (hospitals, airports, water treatment)' },
    ],
  },
  {
    title: 'ELECTRICAL',
    layers: [
      { id: 'POWER_FLOW', label: 'Power Flow', icon: '▶', tooltip: 'Shows simulated active-power directional arrows and magnitude' },
      { id: 'SUBSTATIONS', label: 'Substations', icon: '◎', tooltip: 'Shows mapped transmission and distribution substations' },
      { id: 'TRANSMISSION', label: 'Transmission', icon: '━━', tooltip: 'Shows verified and schematic transmission lines' },
      { id: 'SERVICE_REGIONS', label: 'Load Regions', icon: '⬡', tooltip: 'Shows modeled regional demand and service catchments' },
    ],
  },
  {
    title: 'ANALYSIS',
    layers: [
      { id: 'GRID_HEALTH', label: 'Grid Health', icon: '🩺', tooltip: 'Highlights thermal loading and voltage status' },
      { id: 'FAILURES', label: 'Failures', icon: '✕', tooltip: 'Shows asset trip badges and failure isolation indicators' },
    ],
  },
];

const VALIDATION_CITIES = [
  { id: 'city-delhi', label: 'Delhi' },
  { id: 'city-mumbai', label: 'Mumbai' },
  { id: 'city-bengaluru', label: 'Bengaluru' },
  { id: 'city-bhopal', label: 'Bhopal' },
  { id: 'city-chennai', label: 'Chennai' },
  { id: 'city-kolkata', label: 'Kolkata' },
  { id: 'city-pune', label: 'Pune' },
];

export default function GeoTwinView() {
  const geoTwin = useVajraStore((s) => s.geoTwin);
  const searchAndNavigateCity = useVajraStore((s) => s.searchAndNavigateCity);
  const selectGeoEntity = useVajraStore((s) => s.selectGeoEntity);
  const setSelectedFeatureIdentity = useVajraStore((s) => s.setSelectedFeatureIdentity);
  const toggleGeoLayer = useVajraStore((s) => s.toggleGeoLayer);
  const setMapEngineStatus = useVajraStore((s) => s.setMapEngineStatus);
  const topology = useVajraStore((s) => s.topology);
  const clock = useVajraStore((s) => s.clock);
  const activeCascade = useVajraStore((s) => s.activeCascade);
  const recoveryPlans = useVajraStore((s) => s.recoveryPlans);
  const selectGeoCity = useVajraStore((s) => s.selectGeoCity);
  const metrics = useVajraStore((s) => s.metrics);

  const overloadedLinesCount = topology.transmissionLines.filter((l) => (l.loadingPercent ?? 0) >= 100).length;
  const failedAssetsCount =
    topology.substations.filter((s) => s.status === 'FAILED').length +
    topology.transmissionLines.filter((l) => l.status === 'FAILED').length;
  const totalUnservedMW = geoTwin?.simulationImpact?.totalCityUnservedMW ?? metrics.unservedLoadMW ?? 0;

  const [inputQuery, setInputQuery] = useState('');
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [twinData, setTwinData] = useState<CityTwinPackage | null>(null);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [backdropMode, setBackdropModeState] = useState<MapBackdropMode>('CARTOGRAPHIC');
  const [isMapReady, setIsMapReady] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapAdapterRef = useRef<MapEngineAdapter | null>(null);

  const selectedCity = geoTwin?.selectedCity ?? null;
  const visibleLayers = geoTwin?.visibleLayers;
  const isResolving = geoTwin?.locationResolutionStatus === 'RESOLVING';
  const errorMessage = geoTwin?.errorMessage;

  // Keep fresh references for MapLibre event handler closures
  const selectedCityRef = useRef(selectedCity);
  useEffect(() => {
    selectedCityRef.current = selectedCity;
  }, [selectedCity]);

  const twinDataRef = useRef(twinData);
  useEffect(() => {
    twinDataRef.current = twinData;
  }, [twinData]);

  const topologyRef = useRef(topology);
  useEffect(() => {
    topologyRef.current = topology;
  }, [topology]);

  const handleToggleBackdrop = (mode: MapBackdropMode) => {
    setBackdropModeState(mode);
    if (mapAdapterRef.current) {
      mapAdapterRef.current.setBackdropMode(mode);
    }
  };

  // Initialize Map Engine on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!MapEngineAdapter.isWebGLSupported()) {
      setIsFallbackMode(true);
      setMapEngineStatus('FALLBACK', 'WebGL not supported; running in resilient SVG fallback mode.');
      return;
    }

    const adapter = new MapEngineAdapter();
    mapAdapterRef.current = adapter;
    if (typeof window !== 'undefined') {
      (window as unknown as { __vajra_mapAdapter?: MapEngineAdapter }).__vajra_mapAdapter = adapter;
    }
    setMapEngineStatus('INITIALIZING');

    const defaultCenter = selectedCity
      ? selectedCity.centerCoordinates
      : { latitude: 28.6139, longitude: 77.209 };

    adapter
      .initialize(
        mapContainerRef.current,
        {
          center: defaultCenter,
          zoom: 11,
          pitch: 25,
          backdropMode,
        },
        {
          onLoad: () => {
            setMapEngineStatus('READY');
            setIsMapReady(true);
            adapter.setBackdropMode(backdropMode);
            if (selectedCity) {
              adapter.setCityBoundary(selectedCity);
              adapter.flyToCity(selectedCity, 1000);
            }
          },
          onError: (err) => {
            console.warn('[GeoTwinView] MapEngine error, falling back to SVG:', err);
            setIsFallbackMode(true);
            setMapEngineStatus('FALLBACK', err.message);
          },
          onFeatureClick: (feature, lngLat) => {
            const city = selectedCityRef.current;
            const powerAssets = twinDataRef.current?.powerAssets ?? [];
            const identity = FeatureIdentityResolver.resolve(
              feature,
              city,
              powerAssets,
              topologyRef.current,
              lngLat,
            );
            setSelectedFeatureIdentity(identity);
            selectGeoEntity(identity.featureId);
          },
          onEntityClick: (id) => {
            selectGeoEntity(id);
          },
        },
      )
      .then((success) => {
        if (!success) {
          setIsFallbackMode(true);
          setMapEngineStatus('FALLBACK');
        }
      });

    return () => {
      adapter.destroy();
      mapAdapterRef.current = null;
      setIsMapReady(false);
    };
  }, []);

  // Ensure full Geo-Twin city mapping (service regions, load clusters, load zones) is initialized
  useEffect(() => {
    if (selectedCity && (!geoTwin?.serviceRegions || geoTwin.serviceRegions.length === 0)) {
      selectGeoCity(selectedCity.id);
    }
  }, [selectedCity, geoTwin?.serviceRegions, selectGeoCity]);

  // Load twin data when selectedCity changes (City-Independent Real Provider)
  useEffect(() => {
    if (!selectedCity) return;

    const realProvider = new RealGeoDataProvider();

    realProvider.loadCityTwin(selectedCity.id).then((pkg) => {
      setTwinData(pkg);

      if (mapAdapterRef.current && pkg && isMapReady) {
        mapAdapterRef.current.setCityBoundary(pkg.city);
        mapAdapterRef.current.setPowerAssets(pkg.powerAssets, geoTwin?.simulationImpact?.corridorImpacts);
        mapAdapterRef.current.setCriticalInfrastructure(pkg.criticalInfrastructure, geoTwin?.simulationImpact?.criticalInfraStatus);
        mapAdapterRef.current.setBuildings(pkg.buildings);
        mapAdapterRef.current.flyToCity(pkg.city, 2000);
      }
    });
  }, [selectedCity, isMapReady]);

  // Synchronize layer visibility to MapEngine
  useEffect(() => {
    if (!mapAdapterRef.current || !visibleLayers || !isMapReady) return;
    for (const [layerId, isVis] of Object.entries(visibleLayers)) {
      mapAdapterRef.current.setLayerVisibility(layerId, isVis);
    }
  }, [visibleLayers, isMapReady]);

  // Sync simulation operational states, service regions, load clusters, load zones, and 3D buildings to MapEngine
  useEffect(() => {
    if (!mapAdapterRef.current || !isMapReady || !selectedCity) return;

    if (twinData) {
      // Deterministic simulation state synchronization through GeoElectricalStateAdapter
      const syncState = GeoElectricalStateAdapter.synchronize(
        topology,
        geoTwin ?? DEFAULT_GEO_TWIN_STATE,
        {
          powerAssets: twinData.powerAssets,
          criticalInfrastructure: twinData.criticalInfrastructure,
          buildings: twinData.buildings,
          serviceRegions: geoTwin?.serviceRegions,
          loadClusters: geoTwin?.loadClusters,
          loadZones: geoTwin?.loadZones,
        },
        selectedCity.id,
        clock.tick,
        recoveryPlans,
        activeCascade,
      );

      GeoElectricalStateAdapter.applyToMapAdapter(
        mapAdapterRef.current,
        syncState,
        {
          powerAssets: twinData.powerAssets,
          criticalInfrastructure: twinData.criticalInfrastructure,
          buildings: twinData.buildings,
          serviceRegions: geoTwin?.serviceRegions,
        },
        geoTwin?.simulationImpact,
        geoTwin?.selectedEntityId,
      );
    } else {
      mapAdapterRef.current.setCityBoundary(selectedCity);
      if (geoTwin?.serviceRegions) {
        mapAdapterRef.current.setServiceRegions(
          geoTwin.serviceRegions,
          geoTwin.simulationImpact?.serviceRegionImpacts,
        );
      }
    }

    if (visibleLayers) {
      for (const [layerId, isVis] of Object.entries(visibleLayers)) {
        mapAdapterRef.current.setLayerVisibility(layerId, isVis);
      }
    }
  }, [
    isMapReady,
    selectedCity,
    geoTwin?.serviceRegions,
    geoTwin?.loadClusters,
    geoTwin?.loadZones,
    geoTwin?.simulationImpact,
    geoTwin?.selectedEntityId,
    twinData,
    visibleLayers,
    topology,
    clock.tick,
    activeCascade,
    recoveryPlans,
  ]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = inputQuery.trim();
    if (!query) return;

    setSearchFeedback(null);

    // 1. Check if the query matches a loaded power asset or building in the active city
    const powerAssets = twinData?.powerAssets ?? [];
    const buildings = twinData?.buildings ?? [];
    const matchedAsset = powerAssets.find(
      (a) => a.name.toLowerCase().includes(query.toLowerCase()) || a.id.toLowerCase() === query.toLowerCase(),
    );
    const matchedBuilding = !matchedAsset
      ? buildings.find((b) => b.name.toLowerCase().includes(query.toLowerCase()))
      : null;

    if (matchedAsset) {
      selectGeoEntity(matchedAsset.id);
      if (mapAdapterRef.current && matchedAsset.coordinates) {
        mapAdapterRef.current.flyToCoordinates(matchedAsset.coordinates, 16);
      }
      setSearchFeedback(`Located asset: ${matchedAsset.name}`);
      return;
    }

    if (matchedBuilding) {
      selectGeoEntity(matchedBuilding.id);
      if (mapAdapterRef.current && matchedBuilding.coordinates) {
        mapAdapterRef.current.flyToCoordinates(matchedBuilding.coordinates, 16.5);
      }
      setSearchFeedback(`Located building: ${matchedBuilding.name}`);
      return;
    }

    // 2. Otherwise navigate to city
    const ok = await searchAndNavigateCity(query);
    if (!ok) {
      setSearchFeedback(`Location "${query}" not found in Indian Geo Registry.`);
    } else {
      setSearchFeedback(null);
    }
  };

  const handleSelectQuickCity = async (label: string) => {
    setInputQuery(label);
    setSearchFeedback(null);
    await searchAndNavigateCity(label);
  };

  // Convert lat/lng to normalized SVG view coordinates within bounding box for fallback
  const projectCoords = (lat: number, lng: number, box = selectedCity?.boundingBox) => {
    if (!box) return { x: 400, y: 300 };
    const width = 800;
    const height = 500;
    const padding = 50;

    const xNorm = (lng - box.minLongitude) / (box.maxLongitude - box.minLongitude);
    const yNorm = 1 - (lat - box.minLatitude) / (box.maxLatitude - box.minLatitude);

    const x = padding + xNorm * (width - 2 * padding);
    const y = padding + yNorm * (height - 2 * padding);

    return { x: Math.max(padding, Math.min(width - padding, x)), y: Math.max(padding, Math.min(height - padding, y)) };
  };

  return (
    <div className="relative flex flex-col flex-1 h-full w-full overflow-hidden bg-[#050a12] p-2 gap-1.5">
      {/* ─── Top Control Header (Compact & Floating Aesthetic - Part H) ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#1b2a38] bg-[#0c1319]/90 px-3 py-1.5 text-xs font-mono shadow-md backdrop-blur select-none">
        {/* Left: City Identifier & Quick Select */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-bold text-[#e0edf5]">
            <span className="text-[#00e5c8]">📍</span>
            <span>{selectedCity?.name ?? 'DELHI'}</span>
            <span className="rounded bg-[#00e5c8]/15 px-1.5 py-0.5 text-[9px] text-[#00e5c8]">
              {selectedCity?.regionalGridInterconnect ?? 'NORTHERN'}
            </span>
          </div>

          {/* Quick City Buttons */}
          <div className="hidden sm:flex items-center gap-1 border-l border-[#1b2a38] pl-2">
            {VALIDATION_CITIES.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectQuickCity(c.label)}
                disabled={isResolving}
                className={`rounded px-2 py-0.5 text-[9px] transition ${
                  selectedCity?.id === c.id || selectedCity?.name.toLowerCase().includes(c.label.toLowerCase())
                    ? 'border border-[#00e5c8] bg-[#00e5c8]/20 font-bold text-[#00e5c8]'
                    : 'border border-[#1b2a38] text-[#88a4b8] hover:border-[#5a7a8f]'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Center: Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5 flex-1 max-w-xs">
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Search city..."
            disabled={isResolving}
            className="flex-1 rounded border border-[#1b2a38] bg-[#070c12] px-2 py-0.5 text-[11px] text-[#e0edf5] placeholder-[#3a5568] focus:border-[#00e5c8] focus:outline-none"
          />
          <button
            type="submit"
            disabled={isResolving || !inputQuery.trim()}
            className="rounded border border-[#00e5c8]/40 bg-[#00e5c8]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#00e5c8] hover:bg-[#00e5c8]/20 disabled:opacity-40"
          >
            {isResolving ? '...' : 'FLY'}
          </button>
        </form>

        {/* Right: Backdrop Mode & Live Grid Telemetry HUD */}
        <div className="flex items-center gap-2">
          {/* Backdrop Mode Toggle */}
          <div className="flex items-center rounded border border-[#1b2a38] bg-[#070c12] p-0.5 text-[9px]">
            <button
              onClick={() => handleToggleBackdrop('CARTOGRAPHIC')}
              className={`rounded px-1.5 py-0.5 transition ${
                backdropMode === 'CARTOGRAPHIC'
                  ? 'bg-[#00e5c8]/20 font-bold text-[#00e5c8]'
                  : 'text-[#88a4b8] hover:text-[#e0edf5]'
              }`}
            >
              🗺️ MAP
            </button>
            <button
              onClick={() => handleToggleBackdrop('SATELLITE')}
              className={`rounded px-1.5 py-0.5 transition ${
                backdropMode === 'SATELLITE'
                  ? 'bg-[#00e5c8]/20 font-bold text-[#00e5c8]'
                  : 'text-[#88a4b8] hover:text-[#e0edf5]'
              }`}
            >
              🛰️ SATELLITE
            </button>
          </div>

          {/* Telemetry Pills */}
          <div className="hidden lg:flex items-center gap-1.5 text-[9px]">
            <span className="rounded border border-[#1b2a38] bg-[#070d17] px-2 py-0.5 text-[#00e5c8]">
              ⚡ {metrics.systemFrequencyHz.toFixed(2)} Hz
            </span>
            <span className="rounded border border-[#1b2a38] bg-[#070d17] px-2 py-0.5 text-[#e0edf5]">
              Gen: {metrics.totalGenerationMW.toFixed(0)} MW
            </span>
            <span className="rounded border border-[#1b2a38] bg-[#070d17] px-2 py-0.5 text-[#e0edf5]">
              Dem: {(geoTwin?.simulationImpact?.totalCityDemandMW ?? metrics.totalDemandMW).toFixed(0)} MW
            </span>
            {overloadedLinesCount > 0 && (
              <span className="rounded border border-[#ef4444]/40 bg-[#ef4444]/15 px-2 py-0.5 text-[#ef4444] font-bold">
                ⚠️ {overloadedLinesCount} Overloaded
              </span>
            )}
            {failedAssetsCount > 0 && (
              <span className="rounded border border-[#ef4444]/40 bg-[#ef4444]/15 px-2 py-0.5 text-[#ef4444] font-bold">
                ✕ {failedAssetsCount} Tripped
              </span>
            )}
            {totalUnservedMW > 0 && (
              <span className="rounded border border-[#ef4444]/40 bg-[#ef4444]/15 px-2 py-0.5 text-[#ef4444] font-bold">
                Unserved: {totalUnservedMW.toFixed(0)} MW
              </span>
            )}
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 rounded border border-[#ff3b5c]/40 bg-[#ff3b5c]/10 px-3 py-1 text-[11px] text-[#ff3b5c]">
          <span>⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ─── Main Map Viewport (Occupies 75-85% of Viewport - Part H) ─── */}
      <div className="relative flex-1 w-full min-h-[460px] h-full overflow-hidden rounded-lg border border-[#1b2a38] bg-[#070c12]">
        {/* MapLibre GL WebGL Map Container */}
        <div
          ref={mapContainerRef}
          className={`h-full w-full ${isFallbackMode ? 'hidden' : 'block'}`}
          style={{ width: '100%', height: '100%' }}
        />

        {/* Resilient SVG Fallback (Used when WebGL is unavailable) */}
        {isFallbackMode && (
          <svg
            viewBox="0 0 800 500"
            className="h-full w-full select-none"
            style={{ filter: 'drop-shadow(0 0 10px rgba(0,0,0,0.5))' }}
          >
            <defs>
              <pattern id="geo-grid-fallback" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#101c26" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect width="800" height="500" fill="url(#geo-grid-fallback)" />

            {selectedCity && (
              <g id="layer-basemap">
                <rect
                  x="40"
                  y="40"
                  width="720"
                  height="420"
                  fill="none"
                  stroke="#1a3348"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text x="50" y="55" fill="#3a5568" fontSize="8" fontFamily="monospace">
                  PERIMETER BOUNDARY: {selectedCity.boundingBox.minLatitude.toFixed(2)}°N to{' '}
                  {selectedCity.boundingBox.maxLatitude.toFixed(2)}°N
                </text>
              </g>
            )}

            {/* Service Regions Fallback */}
            {(visibleLayers?.SERVICE_REGIONS ?? true) &&
              geoTwin?.serviceRegions.map((region) => {
                const pts = region.boundaryPolygon
                  .map((coord) => {
                    const p = projectCoords(coord.latitude, coord.longitude);
                    return `${p.x},${p.y}`;
                  })
                  .join(' ');
                const regImpact = geoTwin?.simulationImpact?.serviceRegionImpacts?.[region.id];
                let fill = '#00e5c8';
                let fillOpacity = 0.06;
                let stroke = '#00e5c8';
                if (regImpact?.blackoutState === 'TOTAL_BLACKOUT') {
                  fill = '#ef4444';
                  fillOpacity = 0.25;
                  stroke = '#ef4444';
                } else if (regImpact?.blackoutState === 'PARTIAL_CURTAILMENT') {
                  fill = '#f5a623';
                  fillOpacity = 0.15;
                  stroke = '#f5a623';
                }

                return (
                  <polygon
                    key={region.id}
                    points={pts}
                    fill={fill}
                    fillOpacity={fillOpacity}
                    stroke={stroke}
                    strokeWidth={1}
                    strokeDasharray="3 2"
                    strokeOpacity={0.7}
                    onClick={() => selectGeoEntity(region.id)}
                    className="cursor-pointer hover:fill-opacity-30"
                  />
                );
              })}

            {/* Transmission Line Corridors Fallback */}
            {(visibleLayers?.TRANSMISSION ?? true) &&
              twinData?.powerAssets
                .filter((a) => a.category === 'TRANSMISSION_LINE' && a.pathCoordinates)
                .map((line) => {
                  const pts = line.pathCoordinates!
                    .map((coord) => {
                      const p = projectCoords(coord.latitude, coord.longitude);
                      return `${p.x},${p.y}`;
                    })
                    .join(' ');
                  const corr = geoTwin?.simulationImpact?.corridorImpacts?.[line.electricalAssetId ?? line.id];
                  let stroke = '#00e5c8';
                  let strokeWidth = 2;
                  let strokeDasharray: string | undefined = undefined;
                  if (corr?.isTripped) {
                    stroke = '#ef4444';
                    strokeWidth = 3;
                    strokeDasharray = '4 4';
                  } else if (corr?.isOverloaded) {
                    stroke = '#ef4444';
                    strokeWidth = 3;
                  } else if ((corr?.loadingPercent ?? 0) >= 85) {
                    stroke = '#f5a623';
                    strokeWidth = 2.5;
                  }

                  return (
                    <g key={line.id}>
                      <polyline
                        points={pts}
                        fill="none"
                        stroke={stroke}
                        strokeWidth={strokeWidth}
                        strokeDasharray={strokeDasharray}
                      />
                    </g>
                  );
                })}
          </svg>
        )}

        {/* ─── Compact Operational Legend (Part J) ─── */}
        <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1.5 rounded-lg border border-[#1b2a38] bg-[#070c12]/95 p-2.5 text-[9px] font-mono shadow-2xl backdrop-blur max-w-[210px] select-none">
          <div>
            <div className="text-[8px] uppercase tracking-wider text-[#00e5c8] font-bold">POWER FLOW</div>
            <div className="mt-0.5 space-y-0.5 text-[#88a4b8]">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[#10b981]">━━━▶</span>
                <span>Low (&lt;100 MW)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[#38bdf8]">━━━━▶</span>
                <span>Medium (100–250 MW)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[#f5a623]">━━━━━━▶</span>
                <span>High (&gt;250 MW)</span>
              </div>
            </div>
          </div>

          <div className="border-t border-[#1b2a38] pt-1">
            <div className="text-[8px] uppercase tracking-wider text-[#5a7a8f] font-bold">GRID STATE</div>
            <div className="mt-0.5 grid grid-cols-2 gap-x-2 gap-y-0.5">
              <div className="flex items-center gap-1 text-[#10b981]">
                <span>●</span>
                <span>Normal</span>
              </div>
              <div className="flex items-center gap-1 text-[#eab308]">
                <span>●</span>
                <span>Warning</span>
              </div>
              <div className="flex items-center gap-1 text-[#f97316]">
                <span>●</span>
                <span>Overloaded</span>
              </div>
              <div className="flex items-center gap-1 text-[#ef4444]">
                <span>●</span>
                <span>Failed</span>
              </div>
            </div>
          </div>

          <div className="border-t border-[#1b2a38] pt-1">
            <div className="text-[8px] uppercase tracking-wider text-[#5a7a8f] font-bold">DATA CLASSIFICATION</div>
            <div className="mt-0.5 space-y-0.5 text-[#88a4b8]">
              <div className="flex items-center justify-between">
                <span>VERIFIED EXTERNAL</span>
                <span className="text-[#00e5c8] font-bold">PUBLIC</span>
              </div>
              <div className="flex items-center justify-between">
                <span>CURRENT PUBLIC</span>
                <span className="text-[#38bdf8]">OSM</span>
              </div>
              <div className="flex items-center justify-between">
                <span>MODELED</span>
                <span className="text-[#f5a623]">DEMAND</span>
              </div>
              <div className="flex items-center justify-between">
                <span>SIMULATED</span>
                <span className="text-[#a855f7]">SOLVER</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mandatory Map Attribution Overlay */}
        <div className="absolute bottom-1 right-2 z-10 rounded bg-[#070c12]/85 px-2 py-0.5 text-[8px] font-mono text-[#5a7a8f]">
          {backdropMode === 'SATELLITE'
            ? 'Tiles © Esri, Maxar, Earthstar Geographics, CNES/Airbus DS, USGS | © OpenStreetMap'
            : (geoTwin?.attribution ?? '© OpenStreetMap contributors © OpenFreeMap')}
        </div>
      </div>

      {/* ─── Bottom Grouped Layer Control Bar (Part H & I) ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#1b2a38] bg-[#0c1319]/90 px-3 py-1 text-[9px] font-mono shadow-md backdrop-blur select-none">
        <div className="flex flex-wrap items-center gap-3">
          {LAYER_GROUPS.map((group) => (
            <div key={group.title} className="flex items-center gap-1">
              <span className="text-[8px] font-bold uppercase tracking-wider text-[#5a7a8f]">
                {group.title}:
              </span>
              <div className="flex items-center gap-1">
                {group.layers.map((layer) => {
                  const isVisible = visibleLayers?.[layer.id] ?? true;
                  return (
                    <button
                      key={layer.id}
                      onClick={() => toggleGeoLayer(layer.id)}
                      title={layer.tooltip}
                      className={`flex items-center gap-1 rounded px-2 py-0.5 text-[9px] transition ${
                        isVisible
                          ? 'border border-[#00e5c8]/50 bg-[#00e5c8]/15 text-[#00e5c8] font-bold'
                          : 'border border-[#1b2a38] text-[#5a7a8f] opacity-50 hover:opacity-80'
                      }`}
                    >
                      <span>{layer.icon}</span>
                      <span>{layer.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="text-[8px] text-[#5a7a8f]">
          PROVENANCE: {selectedCity?.provenance.sourceType ?? 'VERIFIED_EXTERNAL'} • PLANAR WGS84
        </div>
      </div>
    </div>
  );
}
