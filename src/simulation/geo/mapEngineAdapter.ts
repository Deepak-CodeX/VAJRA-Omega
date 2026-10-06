// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Map Engine Adapter (Task 15)
// ═══════════════════════════════════════════════════════════════════════
// Thin abstraction layer wrapping MapLibre GL JS.
// Decouples domain models, state stores, and UI components from the rendering engine.
// Supports:
//  - WebGL capability detection & graceful fallback
//  - Dark technical VAJRA theme (high-contrast, professional, zero-neon-clutter)
//  - City fly-to & camera transitions based on genuine WGS84 coordinates
//  - Bounding box framing
//  - Vector/GeoJSON data layer management (boundaries, transmission, substations, infra, buildings)
//  - Interactive feature picking
//  - OpenStreetMap & CARTO attribution
// ═══════════════════════════════════════════════════════════════════════

import type { Map as MapLibreMap, StyleSpecification, GeoJSONSource } from 'maplibre-gl';
import type {
  City,
  Building,
  CriticalInfrastructure,
  GeoPowerAsset,
  GeoBoundingBox,
  GeoCoordinate,
  GeoViewport,
  EstimatedServiceRegion,
  SpatialLoadCluster,
  GeoSimulationImpact,
  ServiceRegionSimulationImpact,
  CriticalInfraSimulationStatus,
  TransmissionCorridorImpact,
} from '@/types/geo';
import { Building3DExtruder } from './building3DExtruder';


export type MapBackdropMode = 'CARTOGRAPHIC' | 'SATELLITE';

export const ESRI_WORLD_IMAGERY_CONFIG = {
  id: 'satellite-imagery-src',
  layerId: 'satellite-imagery-layer',
  type: 'raster' as const,
  tiles: [
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  ],
  tileSize: 256,
  maxzoom: 19,
  attribution:
    'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, CNES/Airbus DS, USGS, AeroGRID, IGN, and the GIS User Community',
  provenanceClassification: 'CURRENT PUBLIC / EXTERNAL GEOGRAPHIC DATA' as const,
};

export interface MapEngineOptions {
  center: GeoCoordinate;
  zoom: number;
  pitch?: number;
  bearing?: number;
  interactive?: boolean;
  backdropMode?: MapBackdropMode;
}

export interface MapEngineEventHandlers {
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onCameraChange?: (viewport: GeoViewport) => void;
  onEntityClick?: (entityId: string) => void;
}

export class MapEngineAdapter {
  private map: MapLibreMap | null = null;
  private isLoaded = false;
  private isDestroyed = false;
  private handlers: MapEngineEventHandlers = {};
  private currentBackdropMode: MapBackdropMode = 'CARTOGRAPHIC';

  /**
   * Check if the client environment supports WebGL rendering.
   */
  public static isWebGLSupported(): boolean {
    try {
      if (typeof window === 'undefined') return false;
      const canvas = document.createElement('canvas');
      return !!(
        window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      );
    } catch {
      return false;
    }
  }

  /**
   * Initializes the MapLibre GL map instance inside the specified container.
   */
  public async initialize(
    container: HTMLElement,
    options: MapEngineOptions,
    handlers: MapEngineEventHandlers = {},
  ): Promise<boolean> {
    if (!MapEngineAdapter.isWebGLSupported()) {
      return false;
    }

    this.handlers = handlers;
    this.currentBackdropMode = options.backdropMode ?? 'CARTOGRAPHIC';

    try {
      const maplibreModule = (await import('maplibre-gl')) as any;
      const MapConstructor = maplibreModule.default?.Map || maplibreModule.Map;

      // Configure static worker pipeline to avoid Next.js Webpack dynamic blob worker failures
      if (typeof window !== 'undefined') {
        const workerUrl = `${window.location.origin}/workers/maplibre/maplibre-gl-worker.mjs`;
        if (maplibreModule.config) {
          maplibreModule.config.WORKER_URL = workerUrl;
        }
        if (maplibreModule.default?.config) {
          maplibreModule.default.config.WORKER_URL = workerUrl;
        }
        if (maplibreModule.workerUrl !== undefined) {
          maplibreModule.workerUrl = workerUrl;
        }
        if (maplibreModule.default?.workerUrl !== undefined) {
          maplibreModule.default.workerUrl = workerUrl;
        }
      }

      // OpenFreeMap vector dark style: zero watermark, zero API key required
      const openFreeMapStyle = 'https://tiles.openfreemap.org/styles/dark';

      const mapInstance: MapLibreMap = new MapConstructor({
        container,
        style: 'https://tiles.openfreemap.org/styles/dark',
        center: [options.center.longitude, options.center.latitude],
        zoom: options.zoom,
        pitch: options.pitch ?? 45,
        bearing: options.bearing ?? 15,
        interactive: options.interactive ?? true,
        attributionControl: false, // Customized in VAJRA UI
      });

      this.map = mapInstance;
      if (typeof window !== 'undefined') {
        (window as any).__vajraMapAdapter = this;
        (window as any).__vajraMap = mapInstance;
      }

      mapInstance.on('load', () => {
        if (this.isDestroyed || !this.map) return;
        this.isLoaded = true;
        this.setupCustomLayers();
        this.handlers.onLoad?.();
      });

      mapInstance.on('error', (e: any) => {
        const err = e.error instanceof Error ? e.error : new Error(e.error?.message || 'Map engine error occurred');
        this.handlers.onError?.(err);
      });

      mapInstance.on('moveend', () => {
        if (!this.map || !this.isLoaded) return;
        const center = mapInstance.getCenter();
        this.handlers.onCameraChange?.({
          center: { latitude: center.lat, longitude: center.lng },
          zoom: mapInstance.getZoom(),
          pitchDegrees: mapInstance.getPitch(),
          bearingDegrees: mapInstance.getBearing(),
        });
      });

      return true;
    } catch (err: any) {
      this.handlers.onError?.(err);
      return false;
    }
  }

  /**
   * Sets up VAJRA GeoJSON vector overlays and 3D streamed building extrusions.
   */
  private setupCustomLayers(): void {
    if (!this.map) return;

    // 0. Phase 4.1: 3D Directional Lighting for natural facade and roof contrast
    try {
      this.map.setLight({
        anchor: 'viewport',
        color: '#d0d8e8',
        intensity: 0.42,
        position: [1.2, 215, 35],
      });
    } catch {
      // Ignore if setLight is unsupported
    }

    // Phase 4.1: Subdue environment layers into a natural, non-neon geographic palette
    const trySetPaint = (layerId: string, prop: string, value: any) => {
      if (this.map?.getLayer(layerId)) {
        try {
          this.map.setPaintProperty(layerId, prop as any, value);
        } catch {
          // Ignore if property is unsupported in current layer type
        }
      }
    };

    trySetPaint('water', 'fill-color', '#09131d');
    trySetPaint('landuse_park', 'fill-color', '#0e1a14');
    trySetPaint('landcover_wood', 'fill-color', '#0e1a14');
    trySetPaint('landuse_residential', 'fill-color', '#10151c');
    trySetPaint('highway_minor', 'line-color', '#151c24');
    trySetPaint('highway_major_inner', 'line-color', '#1f2937');
    trySetPaint('highway_motorway_inner', 'line-color', '#2a374a');
    trySetPaint('highway_major_casing', 'line-color', '#0c1017');
    trySetPaint('highway_motorway_casing', 'line-color', '#0c1017');
    trySetPaint('background', 'background-color', '#0a0e14');

    // 0.1 Phase 4.3A: Genuine Satellite / Orthophoto Raster Backdrop Source (Esri World Imagery)
    const hasSatelliteSource = !!this.map.getSource('satellite-imagery-src');
    if (!hasSatelliteSource) {
      this.map.addSource('satellite-imagery-src', {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, CNES/Airbus DS, USGS, AeroGRID, IGN, and the GIS User Community',
      });
    }

    if (!this.map.getLayer('satellite-imagery-layer')) {
      const firstVectorLayerId = this.map.getLayer('water') ? 'water' : undefined;
      this.map.addLayer(
        {
          id: 'satellite-imagery-layer',
          type: 'raster',
          source: 'satellite-imagery-src',
          paint: {
            'raster-opacity': 1.0,
            'raster-fade-duration': 300,
          },
          layout: {
            visibility: this.currentBackdropMode === 'SATELLITE' ? 'visible' : 'none',
          },
        },
        firstVectorLayerId,
      );
    }

    // 1. Ensure OpenMapTiles vector 3D building extrusion layer is active
    const hasOpenMapTiles = !!this.map.getSource('openmaptiles');
    if (!hasOpenMapTiles) {
      this.map.addSource('openmaptiles', {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
      });
    }

    if (!this.map.getLayer('osm-streamed-buildings-3d')) {
      if (this.map.getLayer('building')) {
        this.map.setLayoutProperty('building', 'visibility', 'none');
      }

      this.map.addLayer({
        id: 'osm-streamed-buildings-3d',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13,
        paint: {
          // Stepped architectural material palette differentiated by real building height
          'fill-extrusion-color': [
            'case',
            ['boolean', ['feature-state', 'blackout'], false],
            '#070a0e', // De-energized building: deep void slate
            [
              'step',
              ['coalesce', ['get', 'render_height'], 15],
              '#18202a', // < 12m: low-rise/residential (deep slate graphite)
              12,
              '#1f2937', // 12m - 25m: mid-rise (architectural dark charcoal)
              25,
              '#283548', // 25m - 50m: high-rise (structured slate blue-gray)
              50,
              '#334155', // >= 50m: skyscrapers/towers (cool steel granite)
            ],
          ] as any,
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13,
            0,
            13.05,
            ['coalesce', ['get', 'render_height'], 15],
          ] as any,
          'fill-extrusion-base': [
            'interpolate',
            ['linear'],
            ['zoom'],
            13,
            0,
            13.05,
            ['coalesce', ['get', 'render_min_height'], 0],
          ] as any,
          'fill-extrusion-opacity': 0.88,
        },
      });
    }

    // 2. City Boundary Source & Layer
    this.map.addSource('vajra-boundary-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'vajra-boundary-fill',
      type: 'fill',
      source: 'vajra-boundary-src',
      paint: {
        'fill-color': '#0284c7',
        'fill-opacity': 0.02,
      },
    });

    this.map.addLayer({
      id: 'vajra-boundary-line',
      type: 'line',
      source: 'vajra-boundary-src',
      paint: {
        'line-color': '#0284c7',
        'line-width': 1.2,
        'line-dasharray': [4, 3],
        'line-opacity': 0.6,
      },
    });

    // 3. Transmission Line Corridors Source & Layer (High-contrast operational blue)
    this.map.addSource('vajra-transmission-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'vajra-transmission-glow',
      type: 'line',
      source: 'vajra-transmission-src',
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#0284c7'] as any,
        'line-width': 4.5,
        'line-opacity': 0.35,
        'line-blur': 2.5,
      },
    });

    this.map.addLayer({
      id: 'vajra-transmission-core',
      type: 'line',
      source: 'vajra-transmission-src',
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#38bdf8'] as any,
        'line-width': 2,
        'line-opacity': 0.95,
      },
    });

    // 4. Substations & Power Assets (Voltage-scaled, operational border ring)
    this.map.addSource('vajra-substations-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'vajra-substations-circle',
      type: 'circle',
      source: 'vajra-substations-src',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          ['case', ['>=', ['coalesce', ['get', 'voltageKV'], 0], 400], 6, 4],
          14,
          ['case', ['>=', ['coalesce', ['get', 'voltageKV'], 0], 400], 8.5, ['>=', ['coalesce', ['get', 'voltageKV'], 0], 220], 7, 5.5],
        ] as any,
        'circle-color': ['coalesce', ['get', 'color'], '#0284c7'] as any,
        'circle-stroke-width': 2,
        'circle-stroke-color': ['coalesce', ['get', 'strokeColor'], '#10b981'] as any,
      },
    });

    // 5. Critical Infrastructure
    this.map.addSource('vajra-infra-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'vajra-infra-circle',
      type: 'circle',
      source: 'vajra-infra-src',
      paint: {
        'circle-radius': 6,
        'circle-color': ['coalesce', ['get', 'color'], '#3b82f6'] as any,
        'circle-stroke-width': 2,
        'circle-stroke-color': ['coalesce', ['get', 'strokeColor'], '#10b981'] as any,
      },
    });

    // 6. Voronoi Estimated Service Regions (Subordinated in normal state)
    this.map.addSource('vajra-service-regions-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'vajra-service-regions-fill',
      type: 'fill',
      source: 'vajra-service-regions-src',
      paint: {
        'fill-color': ['coalesce', ['get', 'fillColor'], '#0f172a'] as any,
        'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.02] as any,
      },
    });

    this.map.addLayer({
      id: 'vajra-service-regions-line',
      type: 'line',
      source: 'vajra-service-regions-src',
      paint: {
        'line-color': ['coalesce', ['get', 'lineColor'], '#1e293b'] as any,
        'line-width': 1.2,
        'line-dasharray': [3, 2],
        'line-opacity': 0.45,
      },
    });

    // 7. Spatial Load Clusters
    this.map.addSource('vajra-load-clusters-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'vajra-load-clusters-circle',
      type: 'circle',
      source: 'vajra-load-clusters-src',
      paint: {
        'circle-radius': 4.5,
        'circle-color': '#eab308',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.75,
      },
    });

    // 8. Canonical Landmark Buildings Layer
    this.map.addSource('vajra-buildings-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'vajra-buildings-fill',
      type: 'fill',
      source: 'vajra-buildings-src',
      maxzoom: 13,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#283548'] as any,
        'fill-opacity': ['coalesce', ['get', 'opacity'], 0.25] as any,
      },
    });

    this.map.addLayer({
      id: 'vajra-buildings-line',
      type: 'line',
      source: 'vajra-buildings-src',
      maxzoom: 13,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#283548'] as any,
        'line-width': 0.8,
        'line-opacity': 0.4,
      },
    });

    // 9. 3D Building Extrusion Layer (Landmark extrusions in architectural palette)
    this.map.addLayer({
      id: 'vajra-buildings-extrusion',
      type: 'fill-extrusion',
      source: 'vajra-buildings-src',
      minzoom: 11,
      paint: {
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#283548'] as any,
        'fill-extrusion-height': ['coalesce', ['get', 'height'], 15] as any,
        'fill-extrusion-base': ['coalesce', ['get', 'base_height'], 0] as any,
        'fill-extrusion-opacity': 0.88,
      },
    });

    // Add click listener for feature selection
    this.map.on('click', (e) => {
      if (!this.map) return;
      const features = this.map.queryRenderedFeatures(e.point, {
        layers: [
          'vajra-substations-circle',
          'vajra-infra-circle',
          'vajra-load-clusters-circle',
          'vajra-service-regions-fill',
          'vajra-buildings-extrusion',
          'osm-streamed-buildings-3d',
          'vajra-buildings-fill',
          'vajra-transmission-core',
        ],
      });
      if (features.length > 0 && features[0].properties?.id) {
        this.handlers.onEntityClick?.(features[0].properties.id);
      }
    });
  }

  /**
   * Smoothly animates camera to target city coordinates with 3D oblique perspective.
   */
  public flyToCity(city: City, durationMs = 2000): void {
    if (!this.map) return;

    this.map.flyTo({
      center: [city.centerCoordinates.longitude, city.centerCoordinates.latitude],
      zoom: 14.0,
      pitch: 48,
      bearing: 18,
      duration: durationMs,
      essential: true,
    });
  }

  /**
   * Toggles backdrop mode between CARTOGRAPHIC and SATELLITE (Phase 4.3A).
   */
  public setBackdropMode(mode: MapBackdropMode): void {
    this.currentBackdropMode = mode;
    if (!this.map || !this.isLoaded) return;

    const isSatellite = mode === 'SATELLITE';
    if (this.map.getLayer('satellite-imagery-layer')) {
      this.map.setLayoutProperty('satellite-imagery-layer', 'visibility', isSatellite ? 'visible' : 'none');
    }

    const setOpacity = (layerId: string, opacity: number) => {
      if (this.map?.getLayer(layerId)) {
        try {
          this.map.setPaintProperty(layerId, 'fill-opacity', opacity);
        } catch {
          // Ignore
        }
      }
    };

    if (isSatellite) {
      setOpacity('water', 0.35);
      setOpacity('landuse_park', 0.2);
      setOpacity('landuse_residential', 0.0);
      setOpacity('landcover_wood', 0.2);
    } else {
      setOpacity('water', 1.0);
      setOpacity('landuse_park', 1.0);
      setOpacity('landuse_residential', 1.0);
      setOpacity('landcover_wood', 1.0);
    }
  }

  /**
   * Gets the active backdrop mode.
   */
  public getBackdropMode(): MapBackdropMode {
    return this.currentBackdropMode;
  }

  /**
   * Fits camera to exact geographic bounding box.
   */
  public fitBounds(box: GeoBoundingBox, padding = 40): void {
    if (!this.map) return;

    this.map.fitBounds(
      [
        [box.minLongitude, box.minLatitude],
        [box.maxLongitude, box.maxLatitude],
      ],
      { padding, duration: 1800, essential: true },
    );
  }

  /**
   * Updates the rendered city boundary polygon.
   */
  public setCityBoundary(city: City): void {
    if (!this.map || !this.isLoaded) return;

    const source = this.map.getSource('vajra-boundary-src') as GeoJSONSource | undefined;
    if (!source) return;

    const coords = city.boundaryPolygon ?? [
      { latitude: city.boundingBox.maxLatitude, longitude: city.boundingBox.minLongitude },
      { latitude: city.boundingBox.maxLatitude, longitude: city.boundingBox.maxLongitude },
      { latitude: city.boundingBox.minLatitude, longitude: city.boundingBox.maxLongitude },
      { latitude: city.boundingBox.minLatitude, longitude: city.boundingBox.minLongitude },
      { latitude: city.boundingBox.maxLatitude, longitude: city.boundingBox.minLongitude },
    ];

    const polygonRing = coords.map((c) => [c.longitude, c.latitude]);

    source.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: city.id, name: city.name },
          geometry: {
            type: 'Polygon',
            coordinates: [polygonRing],
          },
        },
      ],
    });
  }

  /**
   * Updates transmission lines and substations data with optional live corridor/asset status.
   */
  public setPowerAssets(
    assets: GeoPowerAsset[],
    corridorImpacts?: Record<string, TransmissionCorridorImpact>,
    subStatuses?: Record<string, string>,
  ): void {
    if (!this.map || !this.isLoaded) return;

    const lineSource = this.map.getSource('vajra-transmission-src') as GeoJSONSource | undefined;
    const subSource = this.map.getSource('vajra-substations-src') as GeoJSONSource | undefined;

    if (lineSource) {
      const lineFeatures = assets
        .filter((a) => a.category === 'TRANSMISSION_LINE' && a.pathCoordinates && a.pathCoordinates.length >= 2)
        .map((a) => {
          const corr = corridorImpacts?.[a.electricalAssetId ?? a.id] ?? (corridorImpacts ? Object.values(corridorImpacts).find((c) => c.lineName === a.name) : undefined);
          const isSimulated = a.provenance?.isVerifiedRealWorld === false || a.provenance?.sourceType === 'SYNTHETIC';

          let color = '#38bdf8'; // BLUE: transmission / public infrastructure
          if (isSimulated) {
            color = '#a855f7'; // PURPLE: simulated
          } else if (corr?.isTripped) {
            color = '#ef4444'; // RED: failed
          } else if (corr?.isOverloaded) {
            color = '#f97316'; // ORANGE: overload
          } else if ((corr?.loadingPercent ?? 0) >= 85) {
            color = '#eab308'; // YELLOW: warning
          }

          return {
            type: 'Feature' as const,
            properties: {
              id: a.id,
              name: a.name,
              voltageKV: a.voltageKV,
              color,
              loadingPercent: corr?.loadingPercent ?? 0,
              isOverloaded: corr?.isOverloaded ?? false,
              isTripped: corr?.isTripped ?? false,
              isSimulated,
              provenanceSource: a.provenance?.sourceType ?? 'UNKNOWN',
            },
            geometry: {
              type: 'LineString' as const,
              coordinates: a.pathCoordinates!.map((c) => [c.longitude, c.latitude]),
            },
          };
        });

      lineSource.setData({ type: 'FeatureCollection', features: lineFeatures });
    }

    if (subSource) {
      const subFeatures = assets
        .filter((a) => a.category !== 'TRANSMISSION_LINE')
        .map((a) => {
          const status = subStatuses?.[a.electricalAssetId ?? a.id];
          const isSimulated = a.provenance?.isVerifiedRealWorld === false || a.provenance?.sourceType === 'SYNTHETIC';

          let color = '#0284c7'; // BLUE: verified public infrastructure core
          let strokeColor = '#10b981'; // GREEN: healthy/verified operational ring

          if (isSimulated) {
            color = '#a855f7'; // PURPLE: simulated
            strokeColor = '#c084fc';
          } else if (status === 'FAILED') {
            color = '#ef4444'; // RED: failed
            strokeColor = '#fca5a5';
          } else if (status === 'OVERLOAD') {
            color = '#f97316'; // ORANGE: overload
            strokeColor = '#fed7aa';
          } else if (status === 'WARNING') {
            color = '#eab308'; // YELLOW: warning
            strokeColor = '#fef08a';
          }

          return {
            type: 'Feature' as const,
            properties: {
              id: a.id,
              name: a.name,
              voltageKV: a.voltageKV,
              category: a.category,
              color,
              strokeColor,
              isSimulated,
              provenanceSource: a.provenance?.sourceType ?? 'UNKNOWN',
            },
            geometry: {
              type: 'Point' as const,
              coordinates: [a.coordinates.longitude, a.coordinates.latitude],
            },
          };
        });

      subSource.setData({ type: 'FeatureCollection', features: subFeatures });
    }
  }

  /**
   * Updates critical infrastructure data with live power supply status colors.
   */
  public setCriticalInfrastructure(
    infra: CriticalInfrastructure[],
    statuses?: Record<string, CriticalInfraSimulationStatus>,
  ): void {
    if (!this.map || !this.isLoaded) return;

    const infraSource = this.map.getSource('vajra-infra-src') as GeoJSONSource | undefined;
    if (!infraSource) return;

    const features = infra.map((item) => {
      const status = statuses?.[item.id];
      let color = '#3b82f6'; // BLUE: public infrastructure
      let strokeColor = '#10b981'; // GREEN: healthy/verified supply
      if (status) {
        if (status.powerSupplyState === 'NORMAL_GRID') {
          color = '#3b82f6';
          strokeColor = '#10b981'; // GREEN: healthy
        } else if (status.powerSupplyState === 'BACKUP_ACTIVE') {
          color = '#eab308'; // YELLOW: warning / backup active
          strokeColor = '#fef08a';
        } else {
          color = '#ef4444'; // RED: failed / outage
          strokeColor = '#fca5a5';
        }
      }
      return {
        type: 'Feature' as const,
        properties: {
          id: item.id,
          name: item.name,
          infraType: item.infraType,
          priorityTier: item.priorityTier,
          powerState: status?.powerSupplyState ?? 'NORMAL_GRID',
          color,
          strokeColor,
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [item.coordinates.longitude, item.coordinates.latitude],
        },
      };
    });

    infraSource.setData({ type: 'FeatureCollection', features });
  }

  /**
   * Updates Voronoi estimated service regions with live blackout state coloring (Task 16/17).
   */
  public setServiceRegions(
    regions: EstimatedServiceRegion[],
    impacts?: Record<string, ServiceRegionSimulationImpact>,
  ): void {
    if (!this.map || !this.isLoaded) return;

    const source = this.map.getSource('vajra-service-regions-src') as GeoJSONSource | undefined;
    if (!source) return;

    const features = regions.map((r) => {
      const ring = r.boundaryPolygon.map((c) => [c.longitude, c.latitude]);
      if (ring.length > 0) {
        ring.push(ring[0]); // Close polygon
      }
      const impact = impacts?.[r.id];
      let fillColor = '#0f172a';
      let fillOpacity = 0.02; // Visually subordinate in normal state
      let lineColor = '#1e293b';

      if (impact) {
        if (impact.blackoutState === 'TOTAL_BLACKOUT') {
          fillColor = '#ef4444'; // RED: failed
          fillOpacity = 0.20;
          lineColor = '#ef4444';
        } else if (impact.blackoutState === 'PARTIAL_CURTAILMENT') {
          fillColor = '#eab308'; // YELLOW: warning
          fillOpacity = 0.12;
          lineColor = '#eab308';
        }
      }

      return {
        type: 'Feature' as const,
        properties: {
          id: r.id,
          name: `${r.substationName} Service Region`,
          substationId: r.substationId,
          areaSqKm: r.areaSqKm,
          demandMW: r.totalEstimatedDemandMW,
          fillColor,
          fillOpacity,
          lineColor,
          blackoutFraction: impact?.blackoutFraction ?? 0,
          blackoutState: impact?.blackoutState ?? 'NORMAL',
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [ring],
        },
      };
    });

    source.setData({ type: 'FeatureCollection', features });
  }

  /**
   * Task 17 & 19: Synchronizes map visual layers with live simulation impact.
   */
  public updateSimulationVisuals(
    regions: EstimatedServiceRegion[],
    infra: CriticalInfrastructure[],
    assets: GeoPowerAsset[],
    impact: GeoSimulationImpact,
    buildings?: Building[],
    nightMode = true,
  ): void {
    this.setServiceRegions(regions, impact.serviceRegionImpacts);
    this.setCriticalInfrastructure(infra, impact.criticalInfraStatus);
    this.setPowerAssets(assets, impact.corridorImpacts);
    if (buildings && buildings.length > 0) {
      this.update3DBuildings(buildings, impact, regions, infra, nightMode);
    }
  }

  /**
   * Updates spatial load clusters (Task 16).
   */
  public setLoadClusters(clusters: SpatialLoadCluster[]): void {
    if (!this.map || !this.isLoaded) return;

    const source = this.map.getSource('vajra-load-clusters-src') as GeoJSONSource | undefined;
    if (!source) return;

    const features = clusters.map((c) => ({
      type: 'Feature' as const,
      properties: {
        id: c.id,
        name: c.name,
        demandMW: c.totalDemandMW,
        category: c.loadCategory,
        isCritical: c.containsCriticalLoad,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [c.centroid.longitude, c.centroid.latitude],
      },
    }));

    source.setData({ type: 'FeatureCollection', features });
  }

  /**
   * Updates building footprints and 3D extrusion features (Task 18 & 19).
   */
  public setBuildings(
    buildings: Building[],
    impact?: GeoSimulationImpact,
    serviceRegions?: EstimatedServiceRegion[],
    criticalInfra?: CriticalInfrastructure[],
    nightMode = true,
  ): void {
    if (!this.map || !this.isLoaded) return;

    const source = this.map.getSource('vajra-buildings-src') as GeoJSONSource | undefined;
    if (!source) return;

    const fc = Building3DExtruder.buildGeoJSONFeatureCollection(
      buildings,
      impact,
      serviceRegions,
      criticalInfra,
      nightMode,
    );

    source.setData(fc as any);
  }

  /**
   * Task 19: High-performance update for 3D buildings and dynamic blackout shading.
   */
  public update3DBuildings(
    buildings: Building[],
    impact?: GeoSimulationImpact,
    serviceRegions?: EstimatedServiceRegion[],
    criticalInfra?: CriticalInfrastructure[],
    nightMode = true,
  ): void {
    this.setBuildings(buildings, impact, serviceRegions, criticalInfra, nightMode);
  }

  /**
   * Enables or disables 3D building extrusion layer.
   */
  public setBuilding3DExtrusion(enabled: boolean): void {
    if (!this.map || !this.isLoaded) return;
    if (this.map.getLayer('vajra-buildings-extrusion')) {
      this.map.setLayoutProperty(
        'vajra-buildings-extrusion',
        'visibility',
        enabled ? 'visible' : 'none',
      );
    }
    if (this.map.getLayer('osm-streamed-buildings-3d')) {
      this.map.setLayoutProperty(
        'osm-streamed-buildings-3d',
        'visibility',
        enabled ? 'visible' : 'none',
      );
    }
  }

  /**
   * Toggles Night City visual environment mode.
   */
  public setNightMode(enabled: boolean): void {
    if (!this.map || !this.isLoaded) return;
    if (this.map.getLayer('background')) {
      this.map.setPaintProperty('background', 'background-color', enabled ? '#030712' : '#0f172a');
    }
  }

  /**
   * Toggles layer visibility dynamically.
   */
  public setLayerVisibility(layerId: string, visible: boolean): void {
    if (!this.map || !this.isLoaded) return;

    const layerMap: Record<string, string[]> = {
      BASE_MAP: ['carto-dark-base'],
      BUILDINGS: ['vajra-buildings-fill', 'vajra-buildings-line', 'vajra-buildings-extrusion', 'osm-streamed-buildings-3d'],
      '3D_BUILDINGS': ['vajra-buildings-extrusion', 'osm-streamed-buildings-3d'],
      SUBSTATIONS: ['vajra-substations-circle', 'vajra-substations-glow'],
      TRANSMISSION: ['vajra-transmission-glow', 'vajra-transmission-core'],
      CRITICAL_INFRASTRUCTURE: ['vajra-infra-circle'],
      SERVICE_REGIONS: ['vajra-service-regions-fill', 'vajra-service-regions-line'],
      LOAD_CLUSTERS: ['vajra-load-clusters-circle'],
      LOAD_ZONES: ['vajra-service-regions-fill', 'vajra-service-regions-line'],
    };

    const targetLayerIds = layerMap[layerId] || [layerId];
    for (const id of targetLayerIds) {
      if (this.map.getLayer(id)) {
        this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    }
  }

  /**
   * Zooms in by 1 step smoothly.
   */
  public zoomIn(): void {
    if (!this.map) return;
    this.map.zoomIn({ duration: 300 });
  }

  /**
   * Zooms out by 1 step smoothly.
   */
  public zoomOut(): void {
    if (!this.map) return;
    this.map.zoomOut({ duration: 300 });
  }

  /**
   * Resets camera bearing to True North (0 degrees).
   */
  public resetNorth(): void {
    if (!this.map) return;
    this.map.resetNorth({ duration: 400 });
  }

  /**
   * Sets camera pitch degrees (0 = top-down 2D, 45 = 3D oblique).
   */
  public setPitch(degrees: number): void {
    if (!this.map) return;
    this.map.easeTo({ pitch: Math.max(0, Math.min(60, degrees)), duration: 400 });
  }

  /**
   * Returns current pitch in degrees.
   */
  public getPitch(): number {
    return this.map?.getPitch() ?? 0;
  }

  /**
   * Toggles pitch between 2D (0 deg) and 3D oblique (45 deg).
   */
  public togglePitch(): number {
    const current = this.getPitch();
    const next = current > 20 ? 0 : 45;
    this.setPitch(next);
    return next;
  }

  public resize(): void {
    this.map?.resize();
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.isLoaded = false;
  }
}
