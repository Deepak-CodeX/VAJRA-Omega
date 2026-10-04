'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useVajraStore, DEFAULT_GEO_LAYERS } from '@/store/vajraStore';
import Panel from '@/components/ui/Panel';
import type {
  Building,
  CriticalInfrastructure,
  GeoPowerAsset,
  GeoLayerId,
  City,
  CitySearchResult,
} from '@/types/geo';
import type { ScenarioId, FailureType, SimulationSpeed } from '@/types';
import { RealGeoDataProvider } from '@/simulation/geo/realGeoDataProvider';
import { DeterministicGeoDataProvider } from '@/simulation/geo/deterministicGeoTwin';
import type { CityTwinPackage } from '@/simulation/geo/geoProvider';
import { MapEngineAdapter } from '@/simulation/geo/mapEngineAdapter';
import { Building3DExtruder } from '@/simulation/geo/building3DExtruder';
import { VERIFIED_INDIAN_CITIES } from '@/simulation/geo/verifiedIndianCities';
import { getAllScenarios } from '@/simulation/scenarios/scenarios';
import 'maplibre-gl/dist/maplibre-gl.css';


// ─── Supported Layers by Category (Task 18: No unsupported controls) ─
const SUPPORTED_LAYER_CATEGORIES: {
  category: 'GEOGRAPHY' | 'POWER' | 'ANALYTICS';
  layers: { id: GeoLayerId; label: string; icon: string }[];
}[] = [
  {
    category: 'GEOGRAPHY',
    layers: [
      { id: 'BUILDINGS', label: 'Buildings', icon: '🏢' },
      { id: 'BASE_MAP', label: 'Base Map', icon: '🗺' },
      { id: 'SERVICE_REGIONS', label: 'Service Regions', icon: '⬡' },
    ],
  },
  {
    category: 'POWER',
    layers: [
      { id: 'SUBSTATIONS', label: 'Substations', icon: '⚡' },
      { id: 'TRANSMISSION', label: 'Transmission', icon: '〰' },
      { id: 'LOAD_CLUSTERS', label: 'Load Clusters', icon: '📍' },
      { id: 'LOAD_ZONES', label: 'Load Zones', icon: '👥' },
    ],
  },
  {
    category: 'ANALYTICS',
    layers: [
      { id: 'GRID_HEALTH', label: 'Grid Health', icon: '🩺' },
      { id: 'CRITICAL_INFRASTRUCTURE', label: 'Critical Infra', icon: '🏥' },
      { id: 'CASCADE_PROPAGATION', label: 'Cascade Impact', icon: '💥' },
    ],
  },
];

const VALIDATION_CITIES = [
  { id: 'city-delhi', label: 'Delhi', state: 'Delhi NCR' },
  { id: 'city-mumbai', label: 'Mumbai', state: 'Maharashtra' },
  { id: 'city-bengaluru', label: 'Bengaluru', state: 'Karnataka' },
  { id: 'city-chennai', label: 'Chennai', state: 'Tamil Nadu' },
  { id: 'city-kolkata', label: 'Kolkata', state: 'West Bengal' },
  { id: 'city-pune', label: 'Pune', state: 'Maharashtra' },
  { id: 'city-surat', label: 'Surat', state: 'Gujarat' },
  { id: 'city-bhopal', label: 'Bhopal', state: 'Madhya Pradesh' },
  { id: 'city-indore', label: 'Indore', state: 'Madhya Pradesh' },
];

const SPEEDS: SimulationSpeed[] = [0.5, 1, 2, 5, 10];

export default function GeoCommandCenter() {
  // Store state
  const geoTwin = useVajraStore((s) => s.geoTwin);
  const topology = useVajraStore((s) => s.topology);
  const metrics = useVajraStore((s) => s.metrics);
  const powerBalance = useVajraStore((s) => s.powerBalance);
  const clock = useVajraStore((s) => s.clock);
  const activeScenario = useVajraStore((s) => s.activeScenario);
  const activeCascade = useVajraStore((s) => s.activeCascade);
  const initialized = useVajraStore((s) => s.initialized);
  const recoveryPlans = useVajraStore((s) => s.recoveryPlans);

  // Store actions
  const setGeoViewActive = useVajraStore((s) => s.setGeoViewActive);
  const searchAndNavigateCity = useVajraStore((s) => s.searchAndNavigateCity);
  const searchGeoCities = useVajraStore((s) => s.searchGeoCities);
  const selectGeoEntity = useVajraStore((s) => s.selectGeoEntity);
  const toggleGeoLayer = useVajraStore((s) => s.toggleGeoLayer);
  const setAllGeoLayers = useVajraStore((s) => s.setAllGeoLayers);
  const setMapEngineStatus = useVajraStore((s) => s.setMapEngineStatus);
  const injectGeoFault = useVajraStore((s) => s.injectGeoFault);
  const activateScenario = useVajraStore((s) => s.activateScenario);
  const advanceCascadeStep = useVajraStore((s) => s.advanceCascadeStep);
  const resetCascade = useVajraStore((s) => s.resetCascade);
  const executeRecovery = useVajraStore((s) => s.executeRecovery);
  const start = useVajraStore((s) => s.start);
  const pause = useVajraStore((s) => s.pause);
  const tick = useVajraStore((s) => s.tick);
  const reset = useVajraStore((s) => s.reset);
  const setSpeed = useVajraStore((s) => s.setSpeed);

  // Local state
  const [inputQuery, setInputQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CitySearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [twinData, setTwinData] = useState<CityTwinPackage | null>(null);
  const [selectedEntityDetails, setSelectedEntityDetails] = useState<
    Building | CriticalInfrastructure | GeoPowerAsset | null
  >(null);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'LAYERS' | 'SCENARIO'>('LAYERS');
  const [is3DBuildings, setIs3DBuildings] = useState(true);
  const [isNightMode, setIsNightMode] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapAdapterRef = useRef<MapEngineAdapter | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const selectedCity = geoTwin?.selectedCity ?? null;
  const visibleLayers = geoTwin?.visibleLayers;
  const isResolving = geoTwin?.locationResolutionStatus === 'RESOLVING';
  const errorMessage = geoTwin?.errorMessage;

  // Clock format
  const hours = Math.floor(clock.tick / 3600) + 6;
  const minutes = Math.floor((clock.tick % 3600) / 60);
  const seconds = clock.tick % 60;
  const timeStr = `${String(hours % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Health color
  const healthColor =
    metrics.failedAssetCount > 0
      ? '#ef4444'
      : metrics.frequencyDeviationHz > 0.3
      ? '#f5a623'
      : '#00e5c8';

  // Available scenarios
  const scenarios = useMemo(() => getAllScenarios(), []);

  // Initialize Map Engine on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!MapEngineAdapter.isWebGLSupported()) {
      setIsFallbackMode(true);
      setMapEngineStatus('FALLBACK', 'WebGL unavailable; running in resilient SVG fallback mode.');
      return;
    }

    const adapter = new MapEngineAdapter();
    mapAdapterRef.current = adapter;
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
        },
        {
          onLoad: () => {
            setMapEngineStatus('READY');
            if (selectedCity) {
              adapter.setCityBoundary(selectedCity);
              adapter.flyToCity(selectedCity, 1000);
            }
          },
          onError: (err) => {
            console.warn('[GeoCommandCenter] MapEngine error, falling back to SVG:', err);
            setIsFallbackMode(true);
            setMapEngineStatus('FALLBACK', err.message);
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
    };
  }, []);

  // Load twin data when selectedCity changes
  useEffect(() => {
    if (!selectedCity) return;

    const realProvider = new RealGeoDataProvider();
    const demoProvider = new DeterministicGeoDataProvider();
    const providerToUse = selectedCity.id === 'city-delhi' ? demoProvider : realProvider;

    providerToUse.loadCityTwin(selectedCity.id).then((pkg) => {
      setTwinData(pkg);

      if (mapAdapterRef.current && pkg) {
        mapAdapterRef.current.setCityBoundary(pkg.city);
        mapAdapterRef.current.setPowerAssets(pkg.powerAssets);
        mapAdapterRef.current.setCriticalInfrastructure(pkg.criticalInfrastructure);
        mapAdapterRef.current.setBuildings(
          pkg.buildings,
          geoTwin?.simulationImpact,
          geoTwin?.serviceRegions,
          pkg.criticalInfrastructure,
          isNightMode,
        );
        mapAdapterRef.current.setNightMode(isNightMode);
        mapAdapterRef.current.setBuilding3DExtrusion(is3DBuildings);
        mapAdapterRef.current.flyToCity(pkg.city, 2000);
      }
    });
  }, [selectedCity]);

  // Reduced motion detection
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotion(mq.matches);
      const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mq.addEventListener('change', listener);
      return () => mq.removeEventListener('change', listener);
    }
  }, []);

  // Synchronize 3D Buildings & Night Mode to MapEngine
  useEffect(() => {
    if (!mapAdapterRef.current) return;
    mapAdapterRef.current.setNightMode(isNightMode);
    if (twinData?.buildings) {
      mapAdapterRef.current.setBuildings(
        twinData.buildings,
        geoTwin?.simulationImpact,
        geoTwin?.serviceRegions,
        twinData?.criticalInfrastructure,
        isNightMode,
      );
    }
  }, [isNightMode]);

  useEffect(() => {
    mapAdapterRef.current?.setBuilding3DExtrusion(is3DBuildings);
  }, [is3DBuildings]);

  // Synchronize layer visibility to MapEngine
  useEffect(() => {
    if (!mapAdapterRef.current || !visibleLayers) return;
    for (const [layerId, isVis] of Object.entries(visibleLayers)) {
      mapAdapterRef.current.setLayerVisibility(layerId, isVis);
    }
  }, [visibleLayers]);

  // Sync simulation impacts, service regions, load clusters, power assets, infra to MapEngine
  useEffect(() => {
    if (!mapAdapterRef.current) return;
    if (geoTwin?.serviceRegions) {
      mapAdapterRef.current.setServiceRegions(
        geoTwin.serviceRegions,
        geoTwin.simulationImpact?.serviceRegionImpacts,
      );
    }
    if (geoTwin?.loadClusters) {
      mapAdapterRef.current.setLoadClusters(geoTwin.loadClusters);
    }
    if (twinData?.powerAssets) {
      mapAdapterRef.current.setPowerAssets(
        twinData.powerAssets,
        geoTwin?.simulationImpact?.corridorImpacts,
      );
    }
    if (twinData?.criticalInfrastructure) {
      mapAdapterRef.current.setCriticalInfrastructure(
        twinData.criticalInfrastructure,
        geoTwin?.simulationImpact?.criticalInfraStatus,
      );
    }
    if (twinData?.buildings) {
      mapAdapterRef.current.setBuildings(
        twinData.buildings,
        geoTwin?.simulationImpact,
        geoTwin?.serviceRegions,
        twinData?.criticalInfrastructure,
        isNightMode,
      );
    }
  }, [
    geoTwin?.serviceRegions,
    geoTwin?.loadClusters,
    geoTwin?.simulationImpact,
    twinData?.powerAssets,
    twinData?.criticalInfrastructure,
    twinData?.buildings,
    isNightMode,
  ]);

  // Update selected entity details drawer
  useEffect(() => {
    if (!geoTwin?.selectedEntityId) {
      setSelectedEntityDetails(null);
      return;
    }
    const id = geoTwin.selectedEntityId;

    if (twinData) {
      const foundPower = twinData.powerAssets.find((a) => a.id === id);
      if (foundPower) {
        setSelectedEntityDetails(foundPower);
        return;
      }
      const foundInfra = twinData.criticalInfrastructure.find((i) => i.id === id);
      if (foundInfra) {
        setSelectedEntityDetails(foundInfra);
        return;
      }
      const foundBldg = twinData.buildings.find((b) => b.id === id);
      if (foundBldg) {
        setSelectedEntityDetails(foundBldg);
        return;
      }
    }

    // Check service regions or load clusters
    const foundRegion = geoTwin.serviceRegions.find((r) => r.id === id);
    if (foundRegion) {
      setSelectedEntityDetails({
        id: foundRegion.id,
        name: foundRegion.substationName + ' (Estimated Service Region)',
        entityType: 'ZONE',
        scaleLevel: 'DISTRICT_LOCALITY',
        coordinates: foundRegion.centerCoordinates,
        provenance: foundRegion.provenance,
      } as any);
      return;
    }

    const foundCluster = geoTwin.loadClusters.find((c) => c.id === id);
    if (foundCluster) {
      setSelectedEntityDetails({
        id: foundCluster.id,
        name: foundCluster.name,
        entityType: 'ZONE',
        scaleLevel: 'SITE',
        coordinates: foundCluster.centroid,
        provenance: {
          sourceType: 'MODELED',
          confidence: 'MEDIUM',
          sourceReference: foundCluster.clusteringMetric,
          lastUpdated: new Date().toISOString(),
          isVerifiedRealWorld: false,
          methodologyNotes: 'Deterministic spatial cluster.',
        },
      } as any);
      return;
    }

    setSelectedEntityDetails(null);
  }, [geoTwin?.selectedEntityId, twinData, geoTwin?.serviceRegions, geoTwin?.loadClusters]);

  // Search input change with debounce suggestion lookup
  useEffect(() => {
    if (!inputQuery || inputQuery.trim().length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchGeoCities(inputQuery);
        setSearchResults(res);
        setShowSearchDropdown(true);
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [inputQuery, searchGeoCities]);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputQuery.trim()) {
      setShowSearchDropdown(false);
      await searchAndNavigateCity(inputQuery);
    }
  };

  const handleSelectCityResult = async (cityName: string) => {
    setInputQuery(cityName);
    setShowSearchDropdown(false);
    await searchAndNavigateCity(cityName);
  };

  // Convert lat/lng to normalized SVG view coordinates for fallback
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

  // Look up mapping reference for selected entity
  const selectedMapping = geoTwin?.electricalGeoMappings.find(
    (m) => m.geoEntityId === selectedEntityDetails?.id || m.electricalAssetId === selectedEntityDetails?.id,
  );
  const selectedRegion = geoTwin?.serviceRegions.find(
    (r) => r.id === selectedEntityDetails?.id || r.substationId === selectedEntityDetails?.id,
  );
  const selectedRegionImpact = selectedRegion
    ? geoTwin?.simulationImpact?.serviceRegionImpacts?.[selectedRegion.id]
    : undefined;
  const selectedInfraStatus = selectedEntityDetails
    ? geoTwin?.simulationImpact?.criticalInfraStatus?.[selectedEntityDetails.id]
    : undefined;
  const selectedCorridorImpact = selectedEntityDetails
    ? geoTwin?.simulationImpact?.corridorImpacts?.[selectedMapping?.electricalAssetId ?? selectedEntityDetails.id]
    : undefined;
  const selectedSub = selectedEntityDetails && selectedEntityDetails.entityType === 'SUBSTATION'
    ? topology.substations.find((s) => s.id === selectedMapping?.electricalAssetId || s.id === selectedEntityDetails.id)
    : undefined;

  // Active cascade steps
  const cascadeSteps = activeCascade?.steps ?? [];

  return (
    <div className="flex flex-col gap-3 font-sans">
      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 1. TOP COMMAND BAR: Identity, City Search, Simulation Controls    */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1a3348] bg-[#0a1220]/95 px-4 py-2.5 shadow-xl backdrop-blur">
        {/* Brand & System Status */}
        <div className="flex items-center gap-3">
          <div
            className="h-3 w-3 rounded-full"
            style={{
              backgroundColor: healthColor,
              boxShadow: `0 0 10px ${healthColor}`,
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
          <div className="flex flex-col">
            <span className="font-mono text-xs font-bold tracking-[0.25em] text-[#00e5c8]">
              VAJRA-&#937; COMMAND CENTER
            </span>
            <span className="text-[9px] uppercase tracking-wider text-[#5a7a8f]">
              Synchronized City-Scale Digital Twin
            </span>
          </div>
        </div>

        {/* View Switcher: Schematic Topology vs Geo-Twin View */}
        <div className="flex items-center rounded border border-[#1b2a38] bg-[#070c12] p-0.5 text-xs font-mono">
          <button
            onClick={() => setGeoViewActive(false)}
            className="flex items-center gap-1.5 rounded px-3 py-1 font-semibold text-[#5a7a8f] transition hover:text-[#e0edf5]"
          >
            <span>⚡</span>
            <span>Schematic Topology</span>
          </button>
          <button
            onClick={() => setGeoViewActive(true)}
            className="flex items-center gap-1.5 rounded border border-[#00e5c8]/50 bg-[#00e5c8]/20 px-3 py-1 font-bold text-[#00e5c8]"
          >
            <span>🌍</span>
            <span>Geo-Twin View</span>
          </button>
        </div>

        {/* Prominent City Search & Quick Select */}
        <div ref={searchContainerRef} className="relative flex items-center gap-2 flex-1 max-w-md min-w-[260px]">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#5a7a8f]">🔍</span>
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                onFocus={() => inputQuery.trim().length >= 2 && setShowSearchDropdown(true)}
                placeholder="Search Indian city (e.g. Delhi, Mumbai, Bengaluru, Chennai)..."
                disabled={isResolving}
                className="w-full rounded border border-[#1a3348] bg-[#070c12] pl-8 pr-3 py-1.5 text-xs text-[#e0edf5] placeholder-[#3a5568] focus:border-[#00e5c8] focus:outline-none"
              />
              {inputQuery && (
                <button
                  type="button"
                  onClick={() => setInputQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#5a7a8f] hover:text-[#e0edf5]"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              disabled={isResolving || !inputQuery.trim()}
              className="rounded border border-[#00e5c8] bg-[#00e5c8]/10 px-3 py-1.5 text-xs font-mono font-bold text-[#00e5c8] transition hover:bg-[#00e5c8]/20 disabled:opacity-40"
            >
              {isResolving ? 'FLYING...' : 'FLY TO'}
            </button>
          </form>

          {/* Typeahead Suggestions Dropdown */}
          {showSearchDropdown && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded border border-[#1a3348] bg-[#0c1319] p-1 shadow-2xl backdrop-blur">
              {searchResults.map((res) => (
                <button
                  key={res.cityId}
                  onClick={() => handleSelectCityResult(res.displayName)}
                  className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs font-mono hover:bg-[#1a3348]/60 transition"
                >
                  <span className="font-bold text-[#00e5c8]">{res.displayName}</span>
                  <span className="text-[10px] text-[#5a7a8f]">{res.stateOrProvince}, {res.countryCode}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Simulation Clock & Execution Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded border border-[#1a3348] bg-[#050a12] px-3 py-1 text-xs font-mono">
            <span className="text-[9px] text-[#5a7a8f]">SIM</span>
            <span className="font-semibold text-[#00e5c8] tabular-nums">{timeStr}</span>
            <span className="text-[9px] text-[#3a5568]">T+{clock.tick.toLocaleString()}</span>
          </div>

          <div className="flex items-center gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded px-1.5 py-0.5 text-[9px] font-mono transition ${
                  clock.speed === s
                    ? 'bg-[#00e5c8]/20 text-[#00e5c8] font-bold border border-[#00e5c8]/40'
                    : 'text-[#5a7a8f] hover:bg-[#1a3348] hover:text-[#e0edf5]'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {!clock.isRunning ? (
              <button
                onClick={start}
                className="rounded border border-[#00d68f]/40 bg-[#00d68f]/10 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-[#00d68f] hover:bg-[#00d68f]/20 transition"
              >
                ▶ Run
              </button>
            ) : (
              <button
                onClick={pause}
                className="rounded border border-[#f5a623]/40 bg-[#f5a623]/10 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-[#f5a623] hover:bg-[#f5a623]/20 transition"
              >
                ⏸ Pause
              </button>
            )}
            <button
              onClick={tick}
              disabled={clock.isRunning}
              className="rounded border border-[#3b9eff]/40 bg-[#3b9eff]/10 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-[#3b9eff] hover:bg-[#3b9eff]/20 disabled:opacity-40 transition"
            >
              Step
            </button>
            <button
              onClick={reset}
              className="rounded border border-[#ef4444]/40 bg-[#ef4444]/10 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider text-[#ef4444] hover:bg-[#ef4444]/20 transition"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Validation Quick City Selector Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#1b2a38] bg-[#0c1319] px-3 py-1.5 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-wider text-[#5a7a8f]">Quick Cities:</span>
          {VALIDATION_CITIES.map((c) => (
            <button
              key={c.id}
              onClick={() => handleSelectCityResult(c.label)}
              disabled={isResolving}
              className={`rounded px-2 py-0.5 text-[9px] font-mono transition ${
                selectedCity?.id === c.id || selectedCity?.name.toLowerCase().includes(c.label.toLowerCase())
                  ? 'border border-[#00e5c8] bg-[#00e5c8]/20 font-bold text-[#00e5c8]'
                  : 'border border-[#1b2a38] text-[#88a4b8] hover:border-[#5a7a8f]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Selected City Context */}
        <div className="flex items-center gap-3 text-[10px] text-[#5a7a8f]">
          <span className="text-[#e0edf5] font-bold">{selectedCity?.name}</span>
          <span>{selectedCity?.regionalGridInterconnect}</span>
          <span
            className={`rounded px-1.5 py-0.2 font-mono text-[8px] font-bold ${
              selectedCity?.provenance.sourceType === 'VERIFIED_EXTERNAL'
                ? 'bg-[#00e5c8]/20 text-[#00e5c8]'
                : 'bg-[#f5a623]/20 text-[#f5a623]'
            }`}
          >
            {selectedCity?.provenance.sourceType}
          </span>
          {isFallbackMode && (
            <span className="rounded bg-[#f5a623]/20 px-1.5 py-0.2 font-mono text-[8px] text-[#f5a623]">
              SVG FALLBACK
            </span>
          )}
        </div>
      </div>

      {/* Error / Warning Alert Banner */}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-1.5 text-xs text-[#ef4444]">
          <span>⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 2. MAIN WORKSPACE: Left Controls + Center Map + Right Inspector    */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* ─── LEFT PANEL: Layers & Scenario Lab ─────────────────────── */}
        <div className={`flex flex-col gap-3 transition-all ${leftPanelCollapsed ? 'lg:col-span-1' : 'lg:col-span-3'}`}>
          <Panel
            title={leftPanelCollapsed ? 'CTRL' : 'Command Deck'}
            accent="cyan"
            action={
              <button
                onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
                className="text-[10px] text-[#5a7a8f] hover:text-[#00e5c8]"
              >
                {leftPanelCollapsed ? '▶' : '◀'}
              </button>
            }
          >
            {!leftPanelCollapsed && (
              <div className="flex flex-col gap-3">
                {/* Navigation Tabs */}
                <div className="flex items-center gap-1 border-b border-[#1b2a38] pb-1.5 text-xs font-mono">
                  <button
                    onClick={() => setActiveTab('LAYERS')}
                    className={`flex-1 rounded py-1 font-semibold transition ${
                      activeTab === 'LAYERS'
                        ? 'border border-[#00e5c8]/40 bg-[#00e5c8]/10 text-[#00e5c8]'
                        : 'text-[#5a7a8f] hover:text-[#e0edf5]'
                    }`}
                  >
                    Layers
                  </button>
                  <button
                    onClick={() => setActiveTab('SCENARIO')}
                    className={`flex-1 rounded py-1 font-semibold transition ${
                      activeTab === 'SCENARIO'
                        ? 'border border-[#f5a623]/40 bg-[#f5a623]/10 text-[#f5a623]'
                        : 'text-[#5a7a8f] hover:text-[#e0edf5]'
                    }`}
                  >
                    Scenarios
                  </button>
                </div>

                {/* TAB 1: Organized Layer Controls */}
                {activeTab === 'LAYERS' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between text-[10px] text-[#5a7a8f] font-mono">
                      <span>VISIBLE LAYERS</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setAllGeoLayers(true)}
                          className="hover:text-[#00e5c8] underline"
                        >
                          All
                        </button>
                        <span>|</span>
                        <button
                          onClick={() => setAllGeoLayers(false)}
                          className="hover:text-[#ef4444] underline"
                        >
                          None
                        </button>
                      </div>
                    </div>

                    {SUPPORTED_LAYER_CATEGORIES.map((cat) => (
                      <div key={cat.category} className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#5a7a8f]">
                          {cat.category}
                        </span>
                        <div className="flex flex-col gap-1">
                          {cat.layers.map((layer) => {
                            const isVis = visibleLayers?.[layer.id] ?? true;
                            return (
                              <button
                                key={layer.id}
                                onClick={() => toggleGeoLayer(layer.id)}
                                className={`flex items-center justify-between rounded border px-2 py-1 text-xs font-mono transition ${
                                  isVis
                                    ? 'border-[#00e5c8]/40 bg-[#00e5c8]/10 text-[#00e5c8]'
                                    : 'border-[#1b2a38] text-[#5a7a8f] hover:border-[#3a5568]'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span>{layer.icon}</span>
                                  <span>{layer.label}</span>
                                </div>
                                <span className="text-[10px]">{isVis ? 'ON' : 'OFF'}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 2: Scenarios & Fault Injection */}
                {activeTab === 'SCENARIO' && (
                  <div className="flex flex-col gap-2.5 font-mono">
                    <span className="text-[9px] uppercase tracking-wider text-[#5a7a8f]">
                      Active Scenario:
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {scenarios.map((sc) => (
                        <button
                          key={sc.id}
                          onClick={() => activateScenario(sc.id as ScenarioId)}
                          className={`flex flex-col rounded border p-2 text-left text-xs transition ${
                            activeScenario === sc.id
                              ? 'border-[#f5a623] bg-[#f5a623]/15 text-[#f5a623]'
                              : 'border-[#1b2a38] bg-[#070c12] text-[#88a4b8] hover:border-[#3a5568]'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold">
                            <span>{sc.name}</span>
                            {activeScenario === sc.id && <span className="text-[9px]">ACTIVE</span>}
                          </div>
                          <span className="text-[9px] text-[#5a7a8f] mt-0.5 line-clamp-1">
                            {sc.description}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Contingency Recovery Action */}
                    <div className="mt-2 border-t border-[#1b2a38] pt-2">
                      <button
                        onClick={() => executeRecovery()}
                        disabled={metrics.failedAssetCount === 0 && !activeCascade}
                        className="w-full flex items-center justify-center gap-1.5 rounded border border-[#00d68f] bg-[#00d68f]/10 py-1.5 text-xs font-bold text-[#00d68f] transition hover:bg-[#00d68f]/20 disabled:opacity-40"
                      >
                        <span>⟳</span>
                        <span>EXECUTE RECOVERY PLAN</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>

        {/* ─── CENTER VIEWPORT: Large Interactive Geographic Twin ───── */}
        <div className={`flex flex-col gap-2 ${leftPanelCollapsed && rightPanelCollapsed ? 'lg:col-span-10' : leftPanelCollapsed || rightPanelCollapsed ? 'lg:col-span-8' : 'lg:col-span-6'}`}>
          <div className="relative h-[560px] w-full overflow-hidden rounded-lg border border-[#1b2a38] bg-[#070c12] shadow-2xl">
            {/* MapLibre GL WebGL Map Container */}
            <div
              ref={mapContainerRef}
              className={`h-full w-full ${isFallbackMode ? 'hidden' : 'block'}`}
              style={{ width: '100%', height: '100%' }}
            />

            {/* Resilient SVG Fallback */}
            {isFallbackMode && (
              <svg viewBox="0 0 800 500" className="h-full w-full select-none">
                <defs>
                  <pattern id="geo-grid-cc" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#101c26" strokeWidth="0.8" />
                  </pattern>
                </defs>
                <rect width="800" height="500" fill="url(#geo-grid-cc)" />

                {selectedCity && (
                  <g id="layer-basemap-cc">
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
                      METROPOLITAN ENVELOPE: {selectedCity.boundingBox.minLatitude.toFixed(2)}°N to{' '}
                      {selectedCity.boundingBox.maxLatitude.toFixed(2)}°N
                    </text>
                  </g>
                )}

                {/* Voronoi Estimated Service Regions */}
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

                {/* Transmission Line Corridors */}
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
                        <polyline
                          key={line.id}
                          points={pts}
                          fill="none"
                          stroke={stroke}
                          strokeWidth={strokeWidth}
                          strokeDasharray={strokeDasharray}
                          strokeOpacity={corr?.isTripped ? 0.9 : 0.75}
                        />
                      );
                    })}

                {/* Load Clusters */}
                {(visibleLayers?.LOAD_CLUSTERS ?? true) &&
                  geoTwin?.loadClusters.map((cluster) => {
                    const pt = projectCoords(cluster.centroid.latitude, cluster.centroid.longitude);
                    return (
                      <g key={cluster.id} onClick={() => selectGeoEntity(cluster.id)} className="cursor-pointer">
                        <circle cx={pt.x} cy={pt.y} r={4.5} fill="#3a86ff" fillOpacity={0.8} stroke="#ffffff" strokeWidth={1} />
                        <text x={pt.x + 6} y={pt.y + 3} fill="#3a86ff" fontSize="7" fontFamily="monospace">
                          {cluster.totalDemandMW}MW
                        </text>
                      </g>
                    );
                  })}

                {/* Critical Infrastructure */}
                {(visibleLayers?.CRITICAL_INFRASTRUCTURE ?? true) &&
                  twinData?.criticalInfrastructure.map((infra) => {
                    const pt = projectCoords(infra.coordinates.latitude, infra.coordinates.longitude);
                    const status = geoTwin?.simulationImpact?.criticalInfraStatus?.[infra.id];
                    let fill = '#10b981';
                    if (status?.powerSupplyState === 'BACKUP_ACTIVE') fill = '#f5a623';
                    else if (status?.powerSupplyState === 'ISOLATED_BLACKOUT') fill = '#ef4444';

                    return (
                      <g key={infra.id} onClick={() => selectGeoEntity(infra.id)} className="cursor-pointer">
                        <circle cx={pt.x} cy={pt.y} r={5} fill={fill} stroke="#ffffff" strokeWidth={1} />
                        <text x={pt.x + 6} y={pt.y + 3} fill={fill} fontSize="7" fontFamily="monospace">
                          {infra.name.split(' ')[0]}
                        </text>
                      </g>
                    );
                  })}

                {/* Substations */}
                {(visibleLayers?.SUBSTATIONS ?? true) &&
                  twinData?.powerAssets
                    .filter((a) => a.category !== 'TRANSMISSION_LINE')
                    .map((sub) => {
                      const pt = projectCoords(sub.coordinates.latitude, sub.coordinates.longitude);
                      const isSubFailed = topology.substations.some(
                        (s) => (s.id === sub.electricalAssetId || s.id === sub.id) && s.status === 'FAILED',
                      );
                      return (
                        <g key={sub.id} onClick={() => selectGeoEntity(sub.id)} className="cursor-pointer">
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r={6}
                            fill={isSubFailed ? '#ef4444' : '#f5a623'}
                            stroke="#fff"
                            strokeWidth={1.5}
                          />
                          <text x={pt.x + 8} y={pt.y + 3} fill={isSubFailed ? '#ef4444' : '#f5a623'} fontSize="8" fontFamily="monospace">
                            {sub.name.split(' ')[0]} ({sub.voltageKV}kV)
                          </text>
                        </g>
                      );
                    })}
                {/* 3D Buildings & Footprints (SVG Fallback with Blackout Shading) */}
                {(visibleLayers?.BUILDINGS ?? true) &&
                  twinData?.buildings.map((bldg) => {
                    const visual = Building3DExtruder.deriveBlackoutVisual(
                      bldg,
                      geoTwin?.simulationImpact,
                      geoTwin?.serviceRegions,
                      twinData?.criticalInfrastructure,
                      isNightMode,
                    );
                    const pt = projectCoords(bldg.coordinates.latitude, bldg.coordinates.longitude);
                    return (
                      <rect
                        key={bldg.id}
                        x={pt.x - 3}
                        y={pt.y - 3}
                        width={6}
                        height={6}
                        fill={visual.colorHex}
                        fillOpacity={visual.opacity}
                        stroke={visual.dimmingFactor > 0.5 ? '#1b2a38' : '#38bdf8'}
                        strokeWidth={0.5}
                        onClick={() => selectGeoEntity(bldg.id)}
                        className="cursor-pointer hover:stroke-white"
                      />
                    );
                  })}
              </svg>
            )}

            {/* In-Map Navigation Controls (Top-Left) */}
            <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded border border-[#1b2a38] bg-[#070c12]/90 p-1 font-mono shadow backdrop-blur">
              <button
                onClick={() => mapAdapterRef.current?.zoomIn()}
                title="Zoom In"
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#1a3348] text-sm text-[#00e5c8]"
              >
                +
              </button>
              <button
                onClick={() => mapAdapterRef.current?.zoomOut()}
                title="Zoom Out"
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#1a3348] text-sm text-[#00e5c8]"
              >
                -
              </button>
              <div className="my-0.5 border-t border-[#1b2a38]" />
              <button
                onClick={() => selectedCity && mapAdapterRef.current?.flyToCity(selectedCity, 1200)}
                title="Fit City Bounds"
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#1a3348] text-xs text-[#88a4b8]"
              >
                ⛶
              </button>
              <button
                onClick={() => mapAdapterRef.current?.resetNorth()}
                title="Reset North"
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#1a3348] text-xs text-[#88a4b8]"
              >
                🧭
              </button>
              <button
                onClick={() => mapAdapterRef.current?.togglePitch()}
                title="Toggle 2D / 3D Pitch"
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#1a3348] text-[9px] font-bold text-[#88a4b8]"
              >
                3D
              </button>
              <button
                onClick={() => setIs3DBuildings(!is3DBuildings)}
                title={is3DBuildings ? 'Disable 3D Building Extrusion' : 'Enable 3D Building Extrusion'}
                className={`flex h-7 w-7 items-center justify-center rounded text-[11px] transition ${
                  is3DBuildings
                    ? 'bg-[#00e5c8]/20 text-[#00e5c8] border border-[#00e5c8]/40'
                    : 'text-[#5a7a8f] hover:bg-[#1a3348]'
                }`}
              >
                🏢
              </button>
              <button
                onClick={() => setIsNightMode(!isNightMode)}
                title={isNightMode ? 'Switch to Standard Day Environment' : 'Switch to Night City Mode'}
                className={`flex h-7 w-7 items-center justify-center rounded text-[11px] transition ${
                  isNightMode
                    ? 'bg-[#3b82f6]/20 text-[#60a5fa] border border-[#3b82f6]/40'
                    : 'text-[#5a7a8f] hover:bg-[#1a3348]'
                }`}
              >
                🌙
              </button>
              {reducedMotion && (
                <div
                  title="Reduced Motion Active (transitions simplified)"
                  className="flex h-7 w-7 items-center justify-center rounded bg-[#f5a623]/20 text-[9px] font-bold text-[#f5a623]"
                >
                  RM
                </div>
              )}
            </div>

            {/* Multi-Dimensional Technical Legend (Bottom-Left) */}
            <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1.5 rounded border border-[#1b2a38] bg-[#070c12]/95 p-2.5 text-[9px] font-mono shadow-2xl backdrop-blur max-w-[220px]">
              <div className="text-[8px] font-bold uppercase tracking-wider text-[#5a7a8f]">
                CITY / GEOGRAPHY (3D)
              </div>
              <div className="flex flex-col gap-0.5 text-[8px]">
                <span className="text-[#38bdf8]">🏢 Buildings (GPU 3D Extrusion)</span>
                <span className="text-[#00e5c8]">⬡ Service Regions (Voronoi)</span>
                <span className="text-[#f5a623]">🏥 Critical Infrastructure</span>
              </div>

              <div className="border-t border-[#1b2a38] pt-1">
                <div className="text-[8px] font-bold uppercase tracking-wider text-[#5a7a8f]">
                  GRID & BLACKOUT SHADING (TASK 19)
                </div>
                <div className="flex flex-col gap-0.5 text-[8px]">
                  <span className="flex items-center gap-1.5 text-[#38bdf8]">
                    <span className="inline-block w-2 h-2 rounded-xs bg-[#1e3a5f] border border-[#38bdf8]" />
                    ILLUMINATED (Normal / 0% Dim)
                  </span>
                  <span className="flex items-center gap-1.5 text-[#f5a623]">
                    <span className="inline-block w-2 h-2 rounded-xs bg-[#6b5314] border border-[#f5a623]" />
                    GRID STRESS (Depression / 25% Dim)
                  </span>
                  <span className="flex items-center gap-1.5 text-[#88a4b8]">
                    <span className="inline-block w-2 h-2 rounded-xs bg-[#131b26] border border-[#88a4b8]" />
                    ESTIMATED OUTAGE (Curtailment / 60%)
                  </span>
                  <span className="flex items-center gap-1.5 text-[#e0edf5]/60">
                    <span className="inline-block w-2 h-2 rounded-xs bg-[#060a0f] border border-[#1e293b]" />
                    SEVERE BLACKOUT (Unserved / 90%)
                  </span>
                  <span className="flex items-center gap-1.5 text-[#00e5c8]">
                    <span className="inline-block w-2 h-2 rounded-xs bg-[#0e7490] border border-[#00e5c8]" />
                    RECOVERING (Restoring Power)
                  </span>
                </div>
              </div>

              <div className="border-t border-[#1b2a38] pt-1">
                <div className="text-[8px] font-bold uppercase tracking-wider text-[#5a7a8f]">
                  DATA CONFIDENCE
                </div>
                <div className="flex flex-col gap-0.5 text-[8px]">
                  <span className="text-[#00e5c8]">✓ Verified (LiDAR / Real Survey)</span>
                  <span className="text-[#f5a623]">◉ Mapped (Floor Count Estimate)</span>
                  <span className="text-[#3b9eff]">◇ Inferred (Standard Category Fallback)</span>
                  <span className="text-[#88a4b8]">□ Synthetic (Baseline Modeled)</span>
                </div>
              </div>
            </div>

            {/* Mandatory OpenStreetMap & CARTO Attribution */}
            <div className="absolute bottom-1 right-2 z-10 rounded bg-[#070c12]/80 px-2 py-0.5 text-[8px] font-mono text-[#5a7a8f]">
              {geoTwin?.attribution ?? '© OpenStreetMap contributors © CARTO'}
            </div>
          </div>
        </div>

        {/* ─── RIGHT PANEL: Asset & Infrastructure Inspector ─────────── */}
        <div className={`flex flex-col gap-3 transition-all ${rightPanelCollapsed ? 'lg:col-span-1' : 'lg:col-span-3'}`}>
          <Panel
            title={rightPanelCollapsed ? 'INFO' : 'Telemetry Inspector'}
            accent="cyan"
            action={
              <button
                onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
                className="text-[10px] text-[#5a7a8f] hover:text-[#00e5c8]"
              >
                {rightPanelCollapsed ? '◀' : '▶'}
              </button>
            }
          >
            {!rightPanelCollapsed && (
              <div className="flex flex-col gap-2 font-mono text-xs">
                {selectedEntityDetails ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between border-b border-[#1b2a38] pb-1.5">
                      <span className="font-bold text-[#00e5c8] truncate max-w-[200px]">
                        {selectedEntityDetails.name}
                      </span>
                      <button
                        onClick={() => selectGeoEntity(null)}
                        className="text-xs text-[#5a7a8f] hover:text-[#e0edf5]"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex justify-between text-[10px]">
                      <span className="text-[#5a7a8f]">ENTITY TYPE:</span>
                      <span className="text-[#e0edf5]">{selectedEntityDetails.entityType}</span>
                    </div>

                    {selectedEntityDetails.entityType === 'BUILDING' && (() => {
                      const bldg = selectedEntityDetails as Building;
                      const visual = Building3DExtruder.deriveBlackoutVisual(
                        bldg,
                        geoTwin?.simulationImpact,
                        geoTwin?.serviceRegions,
                        twinData?.criticalInfrastructure,
                        isNightMode,
                      );
                      return (
                        <div className="flex flex-col gap-1.5 rounded border border-[#1b2a38] bg-[#070c12] p-2 text-[10px]">
                          <div className="flex items-center justify-between font-bold text-[#00e5c8]">
                            <span>3D DIGITAL TWIN METRICS</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                visual.blackoutCategory === 'ILLUMINATED'
                                  ? 'bg-[#10b981]/20 text-[#10b981]'
                                  : visual.blackoutCategory === 'GRID_STRESS'
                                  ? 'bg-[#f5a623]/20 text-[#f5a623]'
                                  : visual.blackoutCategory === 'RECOVERING'
                                  ? 'bg-[#00e5c8]/20 text-[#00e5c8]'
                                  : 'bg-[#ef4444]/20 text-[#ef4444]'
                              }`}
                            >
                              {visual.blackoutCategory}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#5a7a8f]">USAGE TYPE:</span>
                            <span className="text-[#e0edf5]">{bldg.usageType}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#5a7a8f]">EXTRUDED HEIGHT:</span>
                            <span className="text-[#e0edf5] font-bold">{visual.heightMeters} m</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#5a7a8f]">HEIGHT PROVENANCE:</span>
                            <span className={`font-bold ${visual.isHeightEstimated ? 'text-[#f5a623]' : 'text-[#00e5c8]'}`}>
                              {visual.provenance}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#5a7a8f]">HEIGHT ACCURACY:</span>
                            <span className="text-[#88a4b8]">
                              {visual.isHeightEstimated ? 'STANDARDIZED APPROXIMATION' : 'VERIFIED SURVEY ATTRIBUTE'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#5a7a8f]">VISUAL DIMMING:</span>
                            <span className="text-[#e0edf5]">{(visual.dimmingFactor * 100).toFixed(0)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#5a7a8f]">ELECTRICAL ASSOCIATION:</span>
                            <span className={`font-bold ${bldg.inferredFeederSubstationId ? 'text-[#00e5c8]' : 'text-[#ef4444]'}`}>
                              {bldg.inferredFeederSubstationId
                                ? `INFERRED FEEDER (${bldg.inferredFeederSubstationId})`
                                : 'NO VERIFIED ELECTRICAL ASSOCIATION'}
                            </span>
                          </div>
                          <div className="mt-1 rounded border border-[#1b2a38] bg-[#0c1319] p-1.5 text-[8px] text-[#88a4b8]">
                            {visual.uncertaintyLabel}
                          </div>
                        </div>
                      );
                    })()}

                    {selectedMapping && (
                      <>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-[#5a7a8f]">ELECTRICAL ID:</span>
                          <span className="text-[#00e5c8] font-bold">{selectedMapping.electricalAssetId}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-[#5a7a8f]">MAPPING:</span>
                          <span className="text-[#e0edf5]">{selectedMapping.mappingType}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-[#5a7a8f]">CONFIDENCE:</span>
                          <span
                            className={`font-bold ${
                              selectedMapping.confidence === 'HIGH'
                                ? 'text-[#00e5c8]'
                                : selectedMapping.confidence === 'MEDIUM'
                                ? 'text-[#f5a623]'
                                : 'text-[#88a4b8]'
                            }`}
                          >
                            {selectedMapping.confidence}
                          </span>
                        </div>
                      </>
                    )}

                    {/* Voronoi Region Details & Mandatory Disclaimer */}
                    {selectedRegion && (
                      <div className="flex flex-col gap-1 rounded border border-[#1b2a38] bg-[#070c12] p-2 text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-[#5a7a8f]">AREA:</span>
                          <span className="text-[#e0edf5]">{selectedRegion.areaSqKm} km²</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#5a7a8f]">EST. DEMAND:</span>
                          <span className="text-[#e0edf5]">{selectedRegion.totalEstimatedDemandMW} MW</span>
                        </div>
                        <div className="mt-1 rounded border border-[#f5a623]/30 bg-[#f5a623]/10 p-1.5 text-[8px] text-[#f5a623]">
                          SPATIAL ASSOCIATION — {selectedRegion.disclaimer}
                        </div>
                      </div>
                    )}

                    {/* Live Substation Electrical Telemetry */}
                    {selectedSub && (
                      <div className="flex flex-col gap-1 rounded border border-[#1b2a38] bg-[#070c12] p-2 text-[10px]">
                        <div className="flex items-center justify-between font-bold text-[#00e5c8]">
                          <span>SUBSTATION STATE</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[8px] font-bold ${
                              selectedSub.status === 'FAILED'
                                ? 'bg-[#ef4444]/20 text-[#ef4444]'
                                : selectedSub.status === 'OVERLOADED'
                                ? 'bg-[#f5a623]/20 text-[#f5a623]'
                                : 'bg-[#10b981]/20 text-[#10b981]'
                            }`}
                          >
                            {selectedSub.status}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#5a7a8f]">VOLTAGE:</span>
                          <span className="text-[#e0edf5]">
                            {selectedSub.voltagePU.toFixed(3)} p.u. {(selectedEntityDetails as any)?.voltageKV ? `(${(selectedEntityDetails as any).voltageKV} kV)` : ''}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#5a7a8f]">FREQUENCY:</span>
                          <span className="text-[#e0edf5]">{selectedSub.frequencyHz.toFixed(2)} Hz</span>
                        </div>
                      </div>
                    )}

                    {/* Live Transmission Corridor Telemetry */}
                    {selectedCorridorImpact && (
                      <div className="flex flex-col gap-1 rounded border border-[#1b2a38] bg-[#070c12] p-2 text-[10px]">
                        <div className="flex items-center justify-between font-bold text-[#00e5c8]">
                          <span>CORRIDOR LOADING</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[8px] font-bold ${
                              selectedCorridorImpact.isTripped
                                ? 'bg-[#ef4444]/20 text-[#ef4444]'
                                : selectedCorridorImpact.isOverloaded
                                ? 'bg-[#ef4444]/20 text-[#ef4444]'
                                : selectedCorridorImpact.loadingPercent >= 85
                                ? 'bg-[#f5a623]/20 text-[#f5a623]'
                                : 'bg-[#10b981]/20 text-[#10b981]'
                            }`}
                          >
                            {selectedCorridorImpact.isTripped
                              ? 'TRIPPED'
                              : selectedCorridorImpact.isOverloaded
                              ? 'OVERLOADED'
                              : 'NORMAL'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#5a7a8f]">FLOW / CAPACITY:</span>
                          <span className="text-[#e0edf5]">{selectedCorridorImpact.currentFlowMW} / {selectedCorridorImpact.capacityMW} MW</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#5a7a8f]">LOADING:</span>
                          <span
                            className={`font-bold ${
                              selectedCorridorImpact.loadingPercent >= 100
                                ? 'text-[#ef4444]'
                                : selectedCorridorImpact.loadingPercent >= 85
                                ? 'text-[#f5a623]'
                                : 'text-[#00e5c8]'
                            }`}
                          >
                            {selectedCorridorImpact.loadingPercent.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Live Critical Infrastructure Status */}
                    {selectedInfraStatus && (
                      <div className="flex flex-col gap-1 rounded border border-[#1b2a38] bg-[#070c12] p-2 text-[10px]">
                        <div className="flex items-center justify-between font-bold text-[#00e5c8]">
                          <span>POWER SUPPLY STATUS</span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[8px] font-bold ${
                              selectedInfraStatus.powerSupplyState === 'NORMAL_GRID'
                                ? 'bg-[#10b981]/20 text-[#10b981]'
                                : selectedInfraStatus.powerSupplyState === 'BACKUP_ACTIVE'
                                ? 'bg-[#f5a623]/20 text-[#f5a623]'
                                : 'bg-[#ef4444]/20 text-[#ef4444]'
                            }`}
                          >
                            {selectedInfraStatus.powerSupplyState}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#5a7a8f]">BACKUP POWER:</span>
                          <span className="text-[#e0edf5]">
                            {selectedInfraStatus.backupGenerationMW} MW ({selectedInfraStatus.backupCoveragePercent}% cov)
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between text-[10px]">
                      <span className="text-[#5a7a8f]">COORDINATES:</span>
                      <span>
                        {selectedEntityDetails.coordinates.latitude.toFixed(4)}°N,{' '}
                        {selectedEntityDetails.coordinates.longitude.toFixed(4)}°E
                      </span>
                    </div>

                    <div className="flex justify-between text-[10px]">
                      <span className="text-[#5a7a8f]">PROVENANCE:</span>
                      <span
                        className={`font-bold ${
                          selectedEntityDetails.provenance.sourceType === 'VERIFIED_EXTERNAL'
                            ? 'text-[#00e5c8]'
                            : 'text-[#f5a623]'
                        }`}
                      >
                        {selectedEntityDetails.provenance.sourceType}
                      </span>
                    </div>

                    {/* Direct Fault Simulation Action */}
                    <button
                      onClick={() => selectedEntityDetails && injectGeoFault(selectedEntityDetails.id)}
                      className="mt-2 flex items-center justify-center gap-1.5 rounded border border-[#ef4444] bg-[#ef4444]/10 py-1.5 text-xs font-mono font-bold text-[#ef4444] transition hover:bg-[#ef4444]/20"
                    >
                      <span>⚡</span>
                      <span>SIMULATE ASSET FAULT / TRIP</span>
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 text-center text-[#5a7a8f] py-6">
                    <span className="text-2xl">⚡</span>
                    <span className="text-xs">No asset currently selected.</span>
                    <span className="text-[10px] text-[#3a5568]">
                      Click any Substation, Transmission Corridor, Critical Facility, or Service Region to inspect live electrical state.
                    </span>

                    {/* Quick Pick Assets */}
                    {twinData && twinData.powerAssets.length > 0 && (
                      <div className="mt-4 flex flex-col gap-1 text-left">
                        <span className="text-[9px] uppercase tracking-wider text-[#5a7a8f]">
                          Metropolitan Assets:
                        </span>
                        {twinData.powerAssets.slice(0, 5).map((a) => (
                          <button
                            key={a.id}
                            onClick={() => selectGeoEntity(a.id)}
                            className="flex items-center justify-between rounded border border-[#1b2a38] px-2 py-1 text-[10px] hover:border-[#00e5c8] hover:text-[#00e5c8] transition"
                          >
                            <span className="truncate">{a.name}</span>
                            <span className="text-[#5a7a8f]">{a.category === 'TRANSMISSION_LINE' ? 'LINE' : `${a.voltageKV}kV`}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* 3. BOTTOM PANEL: Live KPIs & Cascading Failure Event Timeline     */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-3">
        {/* Authoritative Real-Time KPI System */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-10 gap-2 font-mono">
          <div className="flex flex-col rounded border border-[#1b2a38] bg-[#0c1319] p-2 text-xs">
            <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Generation</span>
            <span className="font-bold text-[#00e5c8]">{powerBalance.totalGenerationMW.toFixed(0)} MW</span>
          </div>
          <div className="flex flex-col rounded border border-[#1b2a38] bg-[#0c1319] p-2 text-xs">
            <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Total Demand</span>
            <span className="font-bold text-[#e0edf5]">{powerBalance.totalDemandMW.toFixed(0)} MW</span>
          </div>
          <div className="flex flex-col rounded border border-[#1b2a38] bg-[#0c1319] p-2 text-xs">
            <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Delivered</span>
            <span className="font-bold text-[#10b981]">
              {(powerBalance.totalDemandMW - metrics.unservedLoadMW).toFixed(0)} MW (
              {powerBalance.totalDemandMW > 0
                ? (((powerBalance.totalDemandMW - metrics.unservedLoadMW) / powerBalance.totalDemandMW) * 100).toFixed(0)
                : 100}%)
            </span>
          </div>
          <div className="flex flex-col rounded border border-[#1b2a38] bg-[#0c1319] p-2 text-xs">
            <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Unserved Deficit</span>
            <span className={`font-bold ${metrics.unservedLoadMW > 0 ? 'text-[#ef4444]' : 'text-[#88a4b8]'}`}>
              {metrics.unservedLoadMW.toFixed(0)} MW
            </span>
          </div>
          <div className="flex flex-col rounded border border-[#1b2a38] bg-[#0c1319] p-2 text-xs">
            <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Frequency</span>
            <span className="font-bold text-[#00e5c8]">{metrics.systemFrequencyHz.toFixed(2)} Hz</span>
          </div>
          <div className="flex flex-col rounded border border-[#1b2a38] bg-[#0c1319] p-2 text-xs">
            <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Voltage Health</span>
            <span className="font-bold text-[#00e5c8]">{metrics.voltageHealthIndex.toFixed(2)} p.u.</span>
          </div>
          <div className="flex flex-col rounded border border-[#1b2a38] bg-[#0c1319] p-2 text-xs">
            <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Renewable Share</span>
            <span className="font-bold text-[#00e5c8]">{(powerBalance.renewableFraction * 100).toFixed(0)}%</span>
          </div>
          <div className="flex flex-col rounded border border-[#1b2a38] bg-[#0c1319] p-2 text-xs">
            <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Failed Assets</span>
            <span className={`font-bold ${metrics.failedAssetCount > 0 ? 'text-[#ef4444]' : 'text-[#10b981]'}`}>
              {metrics.failedAssetCount}
            </span>
          </div>
          <div className="flex flex-col rounded border border-[#1b2a38] bg-[#0c1319] p-2 text-xs">
            <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Blackout Zones</span>
            <span className={`font-bold ${(geoTwin?.simulationImpact?.blackoutZoneCount ?? 0) > 0 ? 'text-[#ef4444]' : 'text-[#10b981]'}`}>
              {geoTwin?.simulationImpact?.blackoutZoneCount ?? 0} / {geoTwin?.serviceRegions.length ?? 0}
            </span>
          </div>
          <div className="flex flex-col rounded border border-[#1b2a38] bg-[#0c1319] p-2 text-xs">
            <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Infra At Risk</span>
            <span className={`font-bold ${(geoTwin?.simulationImpact?.criticalFacilitiesAtRisk ?? 0) > 0 ? 'text-[#f5a623]' : 'text-[#10b981]'}`}>
              {geoTwin?.simulationImpact?.criticalFacilitiesAtRisk ?? 0}
            </span>
          </div>
        </div>

        {/* Dynamic Cascading Failure & Event Timeline */}
        {activeCascade && (
          <Panel
            title={`Active Cascading Failure Audit — Depth ${activeCascade.depth} [${activeCascade.status}]`}
            accent="red"
            action={
              <div className="flex items-center gap-2">
                <button
                  onClick={() => advanceCascadeStep()}
                  disabled={activeCascade.status === 'STABILIZED' || activeCascade.status === 'COLLAPSED'}
                  className="rounded border border-[#00e5c8] bg-[#00e5c8]/10 px-2 py-0.5 text-[9px] font-mono font-bold text-[#00e5c8] hover:bg-[#00e5c8]/20 disabled:opacity-30"
                >
                  ▶ Advance Step
                </button>
                <button
                  onClick={() => resetCascade()}
                  className="rounded border border-[#ef4444] bg-[#ef4444]/10 px-2 py-0.5 text-[9px] font-mono font-bold text-[#ef4444] hover:bg-[#ef4444]/20"
                >
                  ↺ Reset Cascade
                </button>
              </div>
            }
          >
            <div className="flex flex-col gap-2 font-mono text-xs">
              <div className="flex items-center justify-between text-[10px] text-[#5a7a8f]">
                <span>TOTAL UNSERVED: {activeCascade.totalUnservedLoadMW} MW</span>
                <span>AFFECTED CONSUMERS: {activeCascade.affectedConsumers.toLocaleString()}</span>
                <span>CRITICAL LOADS: {activeCascade.criticalLoadsAffected}</span>
                <span>STABILITY INDEX: {(activeCascade.stabilityIndex ?? 1.0).toFixed(2)}</span>
              </div>

              {/* Step Timeline */}
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                {cascadeSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded border border-[#1b2a38] bg-[#070c12] px-2.5 py-1.5 text-[10px]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#00e5c8]">T+{step.tick.toString().padStart(2, '0')}</span>
                      <span className="rounded bg-[#ef4444]/20 px-1.5 py-0.2 font-bold text-[#ef4444]">
                        {step.action}
                      </span>
                      <span className="text-[#e0edf5]">
                        {step.triggerAssetName || step.triggerAssetId} ➔ {step.affectedAssetName || step.affectedAssetId}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[#88a4b8]">
                      {step.loadRedistributedMW > 0 && (
                        <span>+{step.loadRedistributedMW.toFixed(0)} MW shift</span>
                      )}
                      {step.resultingLoadingPercent > 0 && (
                        <span className="text-[#f5a623]">{step.resultingLoadingPercent.toFixed(0)}% load</span>
                      )}
                      {(step.unservedLoadMW ?? 0) > 0 && (
                        <span className="text-[#ef4444]">{(step.unservedLoadMW ?? 0).toFixed(0)} MW unserved</span>
                      )}
                      <span>{step.affectedConsumers?.toLocaleString()} consumers</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
