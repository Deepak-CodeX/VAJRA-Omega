'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useVajraStore } from '@/store/vajraStore';
import Panel from '@/components/ui/Panel';
import type {
  Building,
  CriticalInfrastructure,
  GeoPowerAsset,
  GeoLayerId,
} from '@/types/geo';
import { RealGeoDataProvider } from '@/simulation/geo/realGeoDataProvider';
import type { CityTwinPackage } from '@/simulation/geo/geoProvider';
import { MapEngineAdapter } from '@/simulation/geo/mapEngineAdapter';
import 'maplibre-gl/dist/maplibre-gl.css';

const LAYER_LABELS: { id: GeoLayerId; label: string; icon: string }[] = [
  { id: 'BASE_MAP', label: 'Base Map', icon: '🗺' },
  { id: 'BUILDINGS', label: 'Buildings', icon: '🏢' },
  { id: 'CRITICAL_INFRASTRUCTURE', label: 'Critical Infra', icon: '🏥' },
  { id: 'SUBSTATIONS', label: 'Substations', icon: '⚡' },
  { id: 'TRANSMISSION', label: 'Transmission', icon: '〰' },
  { id: 'SERVICE_REGIONS', label: 'Service Regions', icon: '⬡' },
  { id: 'LOAD_CLUSTERS', label: 'Load Clusters', icon: '📍' },
  { id: 'LOAD_ZONES', label: 'Load Zones', icon: '👥' },
  { id: 'GRID_HEALTH', label: 'Grid Health', icon: '🩺' },
];

const VALIDATION_CITIES = [
  { id: 'city-delhi', label: 'Delhi' },
  { id: 'city-mumbai', label: 'Mumbai' },
  { id: 'city-bengaluru', label: 'Bengaluru' },
  { id: 'city-chennai', label: 'Chennai' },
  { id: 'city-kolkata', label: 'Kolkata' },
  { id: 'city-pune', label: 'Pune' },
  { id: 'city-surat', label: 'Surat' },
  { id: 'city-bhopal', label: 'Bhopal' },
  { id: 'city-indore', label: 'Indore' },
];

export default function GeoTwinView() {
  const geoTwin = useVajraStore((s) => s.geoTwin);
  const searchAndNavigateCity = useVajraStore((s) => s.searchAndNavigateCity);
  const selectGeoEntity = useVajraStore((s) => s.selectGeoEntity);
  const toggleGeoLayer = useVajraStore((s) => s.toggleGeoLayer);
  const setMapEngineStatus = useVajraStore((s) => s.setMapEngineStatus);
  const injectGeoFault = useVajraStore((s) => s.injectGeoFault);
  const topology = useVajraStore((s) => s.topology);

  const [inputQuery, setInputQuery] = useState('');
  const [twinData, setTwinData] = useState<CityTwinPackage | null>(null);
  const [selectedEntityDetails, setSelectedEntityDetails] = useState<
    Building | CriticalInfrastructure | GeoPowerAsset | null
  >(null);
  const [isFallbackMode, setIsFallbackMode] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapAdapterRef = useRef<MapEngineAdapter | null>(null);

  const selectedCity = geoTwin?.selectedCity ?? null;
  const visibleLayers = geoTwin?.visibleLayers;
  const isResolving = geoTwin?.locationResolutionStatus === 'RESOLVING';
  const errorMessage = geoTwin?.errorMessage;

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
            console.warn('[GeoTwinView] MapEngine error, falling back to SVG:', err);
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

  // Load twin data when selectedCity changes (City-Independent Real Provider)
  useEffect(() => {
    if (!selectedCity) return;

    const realProvider = new RealGeoDataProvider();

    realProvider.loadCityTwin(selectedCity.id).then((pkg) => {
      setTwinData(pkg);

      if (mapAdapterRef.current && pkg) {
        mapAdapterRef.current.setCityBoundary(pkg.city);
        mapAdapterRef.current.setPowerAssets(pkg.powerAssets);
        mapAdapterRef.current.setCriticalInfrastructure(pkg.criticalInfrastructure);
        mapAdapterRef.current.setBuildings(pkg.buildings);
        mapAdapterRef.current.flyToCity(pkg.city, 2000);
      }
    });
  }, [selectedCity]);

  // Synchronize layer visibility to MapEngine
  useEffect(() => {
    if (!mapAdapterRef.current || !visibleLayers) return;
    for (const [layerId, isVis] of Object.entries(visibleLayers)) {
      mapAdapterRef.current.setLayerVisibility(layerId, isVis);
    }
  }, [visibleLayers]);

  // Sync simulation impacts, service regions, load clusters, and 3D buildings to MapEngine
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
    if (twinData?.buildings && twinData.buildings.length > 0) {
      mapAdapterRef.current.update3DBuildings(
        twinData.buildings,
        geoTwin?.simulationImpact,
        geoTwin?.serviceRegions,
        twinData?.criticalInfrastructure,
        true,
      );
    }
  }, [
    geoTwin?.serviceRegions,
    geoTwin?.loadClusters,
    geoTwin?.simulationImpact,
    twinData?.powerAssets,
    twinData?.criticalInfrastructure,
    twinData?.buildings,
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

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputQuery.trim()) {
      await searchAndNavigateCity(inputQuery);
    }
  };

  const handleSelectQuickCity = async (label: string) => {
    setInputQuery(label);
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

  return (
    <Panel title="Geo-Twin — City-Scale Digital Twin" accent="cyan" className="relative">
      <div className="flex flex-col gap-3">
        {/* Top Control Bar: City Search & Quick Select */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-[#1b2a38] bg-[#0c1319] p-2.5">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 min-w-[280px]">
            <span className="text-xs text-[#5a7a8f]">🔍</span>
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Search Indian city / metropolitan area (e.g. Delhi, Mumbai, Bengaluru, Chennai)..."
              disabled={isResolving}
              className="flex-1 rounded border border-[#1a3348] bg-[#070c12] px-2.5 py-1 text-xs text-[#e0edf5] placeholder-[#3a5568] focus:border-[#00e5c8] focus:outline-none"
            />
            <button
              type="submit"
              disabled={isResolving || !inputQuery.trim()}
              className="rounded border border-[#00e5c8] bg-[#00e5c8]/10 px-3 py-1 text-xs font-mono font-bold text-[#00e5c8] transition hover:bg-[#00e5c8]/20 disabled:opacity-40"
            >
              {isResolving ? 'RESOLVING...' : 'FLY TO CITY'}
            </button>
          </form>

          {/* Representative validation city chips */}
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[9px] uppercase tracking-wider text-[#5a7a8f] mr-1">Validation:</span>
            {VALIDATION_CITIES.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectQuickCity(c.label)}
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
        </div>

        {/* Error / Warning Alert Banner */}
        {errorMessage && (
          <div className="flex items-center gap-2 rounded border border-[#ff3b5c]/40 bg-[#ff3b5c]/10 px-3 py-1.5 text-[11px] text-[#ff3b5c]">
            <span>⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Provenance & Grid Scale Banner */}
        <div className="flex flex-wrap items-center justify-between rounded border border-[#f5a623]/30 bg-[#f5a623]/5 px-3 py-1.5 text-[10px]">
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[8px] font-bold ${
                selectedCity?.provenance.sourceType === 'VERIFIED_EXTERNAL'
                  ? 'bg-[#00e5c8]/20 text-[#00e5c8]'
                  : 'bg-[#f5a623]/20 text-[#f5a623]'
              }`}
            >
              DATA PROVENANCE: {selectedCity?.provenance.sourceType ?? 'SYNTHETIC'}
            </span>
            <span className="text-[#88a4b8]">
              {selectedCity?.name} ({selectedCity?.regionalGridInterconnect})
            </span>
          </div>
          <div className="flex items-center gap-3 text-[9px] text-[#5a7a8f]">
            <span>Lat: {selectedCity?.centerCoordinates.latitude.toFixed(4)}°N</span>
            <span>Lng: {selectedCity?.centerCoordinates.longitude.toFixed(4)}°E</span>
            <span>Population: {selectedCity?.population ? `${(selectedCity.population / 1000000).toFixed(1)}M` : 'N/A'}</span>
            {isFallbackMode && (
              <span className="rounded bg-[#f5a623]/20 px-1 py-0.2 font-mono text-[#f5a623]">
                SVG FALLBACK
              </span>
            )}
          </div>
        </div>

        {/* Task 17: Live Simulation Impact Bar */}
        {geoTwin?.simulationImpact && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 rounded border border-[#1b2a38] bg-[#0c1319] p-2 text-xs font-mono">
            <div className="flex flex-col">
              <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">City Demand</span>
              <span className="font-bold text-[#e0edf5]">{geoTwin.simulationImpact.totalCityDemandMW} MW</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Delivered Power</span>
              <span className="font-bold text-[#00e5c8]">
                {geoTwin.simulationImpact.totalCityServedMW} MW ({(geoTwin.simulationImpact.cityServiceFraction * 100).toFixed(0)}%)
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Blackout Deficit</span>
              <span className={`font-bold ${geoTwin.simulationImpact.totalCityUnservedMW > 0 ? 'text-[#ef4444]' : 'text-[#88a4b8]'}`}>
                {geoTwin.simulationImpact.totalCityUnservedMW} MW
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Blackout Zones</span>
              <span className={`font-bold ${geoTwin.simulationImpact.blackoutZoneCount > 0 ? 'text-[#ef4444]' : 'text-[#10b981]'}`}>
                {geoTwin.simulationImpact.blackoutZoneCount} / {geoTwin.serviceRegions.length}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f]">Critical Facilities at Risk</span>
              <span className={`font-bold ${geoTwin.simulationImpact.criticalFacilitiesAtRisk > 0 ? 'text-[#f5a623]' : 'text-[#10b981]'}`}>
                {geoTwin.simulationImpact.criticalFacilitiesAtRisk}
              </span>
            </div>
          </div>
        )}

        {/* Layer Visibility Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[#1b2a38] pb-2">
          <span className="text-[8px] uppercase tracking-wider text-[#5a7a8f] mr-1">Layers:</span>
          {LAYER_LABELS.map((layer) => {
            const isVisible = visibleLayers?.[layer.id] ?? true;
            return (
              <button
                key={layer.id}
                onClick={() => toggleGeoLayer(layer.id)}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-mono transition ${
                  isVisible
                    ? 'border border-[#00e5c8]/50 bg-[#00e5c8]/10 text-[#00e5c8]'
                    : 'border border-[#1b2a38] text-[#5a7a8f] opacity-50 hover:opacity-80'
                }`}
              >
                <span>{layer.icon}</span>
                <span>{layer.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main Map Viewport */}
        <div className="relative h-[480px] w-full overflow-hidden rounded border border-[#1b2a38] bg-[#070c12]">
          {/* MapLibre GL WebGL Map Container */}
          <div
            ref={mapContainerRef}
            className={`h-full w-full ${isFallbackMode ? 'hidden' : 'block'}`}
            style={{ width: '100%', height: '100%' }}
          />

          {/* Resilient SVG Fallback (Used when WebGL is unavailable or failed) */}
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

              {/* Voronoi Estimated Service Regions (Fallback) */}
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
                      <g key={line.id}>
                        <polyline
                          points={pts}
                          fill="none"
                          stroke={stroke}
                          strokeWidth={strokeWidth}
                          strokeDasharray={strokeDasharray}
                          strokeOpacity={corr?.isTripped ? 0.9 : 0.75}
                        />
                      </g>
                    );
                  })}

              {/* Spatial Load Clusters (Fallback) */}
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

              {/* Critical Infrastructure (Fallback) */}
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
                      <g
                        key={sub.id}
                        onClick={() => selectGeoEntity(sub.id)}
                        className="cursor-pointer"
                      >
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
            </svg>
          )}

          {/* Layer Legend */}
          <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1 rounded border border-[#1b2a38] bg-[#070c12]/90 p-2 text-[9px] font-mono shadow backdrop-blur">
            <div className="text-[8px] uppercase tracking-wider text-[#5a7a8f] font-bold">MAPPING LEGEND</div>
            <div className="flex items-center gap-1.5 text-[#00e5c8]">
              <span>●</span>
              <span>Verified infrastructure</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#f5a623]">
              <span>◉</span>
              <span>Source-matched</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#3a86ff]">
              <span>⬡</span>
              <span>Estimated service region</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#88a4b8]">
              <span>◇</span>
              <span>Synthetic simulation</span>
            </div>
            <div className="mt-1 border-t border-[#1b2a38] pt-1">
              <div className="text-[8px] uppercase tracking-wider text-[#5a7a8f] font-bold">GRID POWER STATE</div>
              <div className="flex items-center gap-1.5 text-[#10b981]">
                <span>●</span>
                <span>Normal / Powered</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#f5a623]">
                <span>●</span>
                <span>Curtailment / Backup</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#ef4444]">
                <span>●</span>
                <span>Blackout / Tripped</span>
              </div>
            </div>
          </div>

          {/* Mandatory OpenStreetMap & CARTO Attribution Overlay */}
          <div className="absolute bottom-1 right-2 z-10 rounded bg-[#070c12]/80 px-2 py-0.5 text-[8px] font-mono text-[#5a7a8f]">
            {geoTwin?.attribution ?? '© OpenStreetMap contributors © CARTO'}
          </div>

          {/* Selected Entity Inspector Drawer */}
          {selectedEntityDetails && (
            <div className="absolute right-3 top-3 z-20 w-80 max-h-[440px] overflow-y-auto rounded border border-[#1b2a38] bg-[#0c1319]/95 p-3 shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between border-b border-[#1b2a38] pb-1.5">
                <span className="font-mono text-xs font-bold text-[#00e5c8] truncate max-w-[230px]">
                  {selectedEntityDetails.name}
                </span>
                <button
                  onClick={() => selectGeoEntity(null)}
                  className="text-xs text-[#5a7a8f] hover:text-[#e0edf5]"
                >
                  ✕
                </button>
              </div>

              <div className="mt-2 flex flex-col gap-1.5 text-[10px] font-mono text-[#88a4b8]">
                <div className="flex justify-between">
                  <span className="text-[#5a7a8f]">ENTITY TYPE:</span>
                  <span className="text-[#e0edf5]">{selectedEntityDetails.entityType}</span>
                </div>

                {selectedMapping && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-[#5a7a8f]">ELECTRICAL ID:</span>
                      <span className="text-[#00e5c8] font-bold">{selectedMapping.electricalAssetId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5a7a8f]">MAPPING TYPE:</span>
                      <span className="text-[#e0edf5]">{selectedMapping.mappingType}</span>
                    </div>
                    <div className="flex justify-between">
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

                {selectedRegion && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-[#5a7a8f]">AREA:</span>
                      <span className="text-[#e0edf5]">{selectedRegion.areaSqKm} km²</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5a7a8f]">EST. DEMAND:</span>
                      <span className="text-[#e0edf5]">{selectedRegion.totalEstimatedDemandMW} MW</span>
                    </div>
                    <div className="rounded border border-[#00e5c8]/30 bg-[#00e5c8]/10 p-1.5 text-[9px] text-[#00e5c8]">
                      {selectedRegion.disclaimer}
                    </div>
                  </>
                )}

                {/* Task 17: Live Region Simulation Impact */}
                {selectedRegionImpact && (
                  <div className="mt-2 rounded border border-[#1b2a38] bg-[#070c12] p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[9px] font-bold text-[#00e5c8]">
                      <span>LIVE SERVICE STATUS</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[8px] font-bold ${
                          selectedRegionImpact.blackoutState === 'TOTAL_BLACKOUT'
                            ? 'bg-[#ef4444]/20 text-[#ef4444]'
                            : selectedRegionImpact.blackoutState === 'PARTIAL_CURTAILMENT'
                            ? 'bg-[#f5a623]/20 text-[#f5a623]'
                            : 'bg-[#10b981]/20 text-[#10b981]'
                        }`}
                      >
                        {selectedRegionImpact.blackoutState}
                      </span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-[#5a7a8f]">SERVED / DEMAND:</span>
                      <span className="text-[#e0edf5]">
                        {selectedRegionImpact.servedDemandMW} / {selectedRegionImpact.totalDemandMW} MW
                      </span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-[#5a7a8f]">BLACKOUT DEFICIT:</span>
                      <span className="text-[#ef4444] font-bold">
                        {selectedRegionImpact.unservedDemandMW} MW ({(selectedRegionImpact.blackoutFraction * 100).toFixed(0)}%)
                      </span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-[#5a7a8f]">AFFECTED CONSUMERS:</span>
                      <span className="text-[#e0edf5]">{selectedRegionImpact.affectedConsumerCount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-[#5a7a8f]">POWER QUALITY INDEX:</span>
                      <span className="text-[#00e5c8]">{selectedRegionImpact.powerQualityIndex.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Task 17: Live Critical Infra Status */}
                {selectedInfraStatus && (
                  <div className="mt-2 rounded border border-[#1b2a38] bg-[#070c12] p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[9px] font-bold text-[#00e5c8]">
                      <span>LIVE POWER SUPPLY</span>
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
                    <div className="flex justify-between text-[9px]">
                      <span className="text-[#5a7a8f]">BACKUP GENERATION:</span>
                      <span className="text-[#e0edf5]">
                        {selectedInfraStatus.backupGenerationMW} MW ({selectedInfraStatus.backupCoveragePercent}% cov)
                      </span>
                    </div>
                    {selectedInfraStatus.feedSubstationId && (
                      <div className="flex justify-between text-[9px]">
                        <span className="text-[#5a7a8f]">FEED SUBSTATION:</span>
                        <span className="text-[#88a4b8]">{selectedInfraStatus.feedSubstationId}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Task 17: Live Corridor Status */}
                {selectedCorridorImpact && (
                  <div className="mt-2 rounded border border-[#1b2a38] bg-[#070c12] p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[9px] font-bold text-[#00e5c8]">
                      <span>CORRIDOR ELECTRICAL STATE</span>
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
                    <div className="flex justify-between text-[9px]">
                      <span className="text-[#5a7a8f]">FLOW / CAPACITY:</span>
                      <span className="text-[#e0edf5]">
                        {selectedCorridorImpact.currentFlowMW} / {selectedCorridorImpact.capacityMW} MW
                      </span>
                    </div>
                    <div className="flex justify-between text-[9px]">
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

                {/* Task 17: Live Substation Status */}
                {selectedSub && (
                  <div className="mt-2 rounded border border-[#1b2a38] bg-[#070c12] p-2 flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[9px] font-bold text-[#00e5c8]">
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
                    <div className="flex justify-between text-[9px]">
                      <span className="text-[#5a7a8f]">VOLTAGE:</span>
                      <span className="text-[#e0edf5]">{selectedSub.voltagePU.toFixed(3)} p.u.</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-[#5a7a8f]">FREQUENCY:</span>
                      <span className="text-[#e0edf5]">{selectedSub.frequencyHz.toFixed(2)} Hz</span>
                    </div>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-[#5a7a8f]">COORDINATES:</span>
                  <span>
                    {selectedEntityDetails.coordinates.latitude.toFixed(4)}°N,{' '}
                    {selectedEntityDetails.coordinates.longitude.toFixed(4)}°E
                  </span>
                </div>

                <div className="flex justify-between">
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

                {selectedMapping?.mappingType === 'SPATIAL_INFERENCE' && (
                  <div className="mt-1 rounded border border-[#f5a623]/30 bg-[#f5a623]/10 p-1.5 text-[9px] text-[#f5a623]">
                    Estimated from spatial proximity.
                    <div className="text-[8px] text-[#88a4b8] mt-0.5">
                      Proximity is not proof of electrical connectivity.
                    </div>
                  </div>
                )}

                {/* Task 17: Interactive Geo-Fault Injection */}
                <button
                  onClick={() => selectedEntityDetails && injectGeoFault(selectedEntityDetails.id)}
                  className="mt-3 flex items-center justify-center gap-1.5 rounded border border-[#ef4444] bg-[#ef4444]/10 py-1.5 text-xs font-mono font-bold text-[#ef4444] transition hover:bg-[#ef4444]/20"
                >
                  <span>⚡</span>
                  <span>SIMULATE ASSET FAULT / TRIP</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}
