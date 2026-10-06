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
  SpatialLoadZone,
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
  onFeatureClick?: (feature: any, lngLat: { lng: number; lat: number }) => void;
}

export class MapEngineAdapter {
  private map: MapLibreMap | null = null;
  private isLoaded = false;
  private isDestroyed = false;
  private handlers: MapEngineEventHandlers = {};
  public get eventHandlers(): MapEngineEventHandlers { return this.handlers; }
  private currentBackdropMode: MapBackdropMode = 'CARTOGRAPHIC';
  private activeFlowLines: Array<{
    pSrc: [number, number];
    pDst: [number, number];
    flowColor: string;
    flowMW: number;
    loading: number;
    id: string;
    isFocused: boolean;
    density: number;
  }> = [];
  private flowAnimFrameId: number | null = null;
  private animPhase: number = 0;

  public static readonly BASE_MAP_LAYER_IDS = [
    'background',
    'water',
    'waterway',
    'water_name',
    'landcover_ice_shelf',
    'landcover_glacier',
    'landuse_residential',
    'landcover_wood',
    'landuse_park',
    'aeroway-taxiway',
    'aeroway-runway-casing',
    'aeroway-area',
    'aeroway-runway',
    'road_area_pier',
    'road_pier',
    'highway_path',
    'highway_minor',
    'highway_major_casing',
    'highway_major_inner',
    'highway_major_subtle',
    'highway_motorway_casing',
    'highway_motorway_inner',
    'road_oneway',
    'road_oneway_opposite',
    'highway_motorway_subtle',
    'railway_transit',
    'railway_transit_dashline',
    'railway_minor',
    'railway_minor_dashline',
    'railway',
    'railway_dashline',
    'highway_name_other',
    'highway_name_motorway',
    'boundary_state',
    'boundary_country_z0-4',
    'boundary_country_z5-',
    'place_other',
    'place_suburb',
    'place_village',
    'place_town',
    'place_city',
    'place_city_large',
    'place_state',
    'place_country_other',
    'place_country_minor',
    'place_country_major',
  ];

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
        (window as any).__vajra_mapAdapter = this;
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

    // 0. Phase 4.1 & 4.6: 3D Directional Lighting for natural facade and roof contrast
    try {
      this.map.setLight({
        anchor: 'map',
        color: '#f8fafc',
        intensity: 0.45,
        position: [1.15, 210, 42],
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
        minzoom: 12.5,
        paint: {
          // Stepped architectural material palette differentiated by real building height
          'fill-extrusion-color': [
            'case',
            ['boolean', ['feature-state', 'blackout'], false],
            '#070a0e', // De-energized building: deep void slate
            [
              'step',
              ['coalesce', ['get', 'render_height'], ['get', 'height'], 14],
              '#182330', // < 12m: low-rise/residential (deep slate graphite)
              12,
              '#223042', // 12m - 25m: mid-rise (architectural dark charcoal)
              25,
              '#2b3d54', // 25m - 50m: high-rise (structured slate blue-gray)
              50,
              '#384e6b', // >= 50m: skyscrapers/towers (cool steel granite)
            ],
          ] as any,
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12.5,
            0,
            14.0,
            ['coalesce', ['get', 'render_height'], ['get', 'height'], 14],
          ] as any,
          'fill-extrusion-base': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12.5,
            0,
            14.0,
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
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          ['case', ['>=', ['coalesce', ['get', 'voltageKV'], 0], 400], 6.0, 4.0],
          14,
          ['case', ['>=', ['coalesce', ['get', 'voltageKV'], 0], 400], 8.5, 5.5],
        ] as any,
        'line-opacity': 0.35,
        'line-blur': 2.5,
      },
    });

    this.map.addLayer({
      id: 'vajra-transmission-core',
      type: 'line',
      source: 'vajra-transmission-src',
      paint: {
        'line-color': ['coalesce', ['get', 'flowColor'], ['get', 'color'], '#38bdf8'] as any,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          ['coalesce', ['get', 'flowLineWidth'], ['case', ['>=', ['coalesce', ['get', 'voltageKV'], 0], 400], 2.8, 1.8]],
          14,
          ['coalesce', ['get', 'flowLineWidth'], ['case', ['>=', ['coalesce', ['get', 'voltageKV'], 0], 400], 3.8, 2.4]],
        ] as any,
        'line-opacity': ['coalesce', ['get', 'opacity'], 0.95] as any,
      },
    });

    this.map.addLayer({
      id: 'vajra-transmission-health-glow',
      type: 'line',
      source: 'vajra-transmission-src',
      paint: {
        'line-color': ['coalesce', ['get', 'healthStatusColor'], ['get', 'color'], '#38bdf8'] as any,
        'line-width': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          ['case', ['>=', ['coalesce', ['get', 'voltageKV'], 0], 400], 8.0, 5.5],
          14,
          ['case', ['>=', ['coalesce', ['get', 'voltageKV'], 0], 400], 11.0, 7.5],
        ] as any,
        'line-opacity': ['coalesce', ['get', 'glowOpacity'], 0.45] as any,
        'line-blur': 3.5,
      },
    });

    // 3.1 Directional Flow Arrows Source & Layer (Phase 5)
    this.map.addSource('vajra-transmission-arrows-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'vajra-transmission-arrows',
      type: 'symbol',
      source: 'vajra-transmission-arrows-src',
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 55,
        'text-field': '▶',
        'text-size': 11,
        'text-keep-upright': false,
        'symbol-avoid-edges': true,
      },
      paint: {
        'text-color': ['coalesce', ['get', 'flowColor'], '#10b981'] as any,
        'text-opacity': ['coalesce', ['get', 'opacity'], 0.9] as any,
      },
    });

    // 3.2 Moving Flow Particles Pulse Layer (Tied to simulation clock & flow direction)
    this.map.addSource('vajra-flow-particles-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'vajra-flow-particles-layer',
      type: 'circle',
      source: 'vajra-flow-particles-src',
      paint: {
        'circle-radius': ['coalesce', ['get', 'radius'], 3.5] as any,
        'circle-color': ['coalesce', ['get', 'color'], '#10b981'] as any,
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.95,
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
          ['case', ['>=', ['coalesce', ['get', 'voltageKV'], 0], 400], 6.5, 4.5],
          14,
          ['case', ['>=', ['coalesce', ['get', 'voltageKV'], 0], 400], 9.0, ['>=', ['coalesce', ['get', 'voltageKV'], 0], 220], 7.5, 5.5],
        ] as any,
        'circle-color': ['coalesce', ['get', 'color'], '#0284c7'] as any,
        'circle-opacity': ['coalesce', ['get', 'opacity'], 1.0] as any,
        'circle-stroke-width': 2,
        'circle-stroke-color': ['coalesce', ['get', 'strokeColor'], '#10b981'] as any,
        'circle-stroke-opacity': ['coalesce', ['get', 'opacity'], 1.0] as any,
      },
    });

    this.map.addLayer({
      id: 'vajra-substations-health-ring',
      type: 'circle',
      source: 'vajra-substations-src',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          10,
          8,
          14,
          12,
        ] as any,
        'circle-color': 'transparent',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': ['coalesce', ['get', 'healthStatusColor'], ['get', 'strokeColor'], '#10b981'] as any,
        'circle-stroke-opacity': ['coalesce', ['get', 'opacity'], 0.9] as any,
      },
    });

    this.map.addLayer({
      id: 'vajra-substations-badge',
      type: 'symbol',
      source: 'vajra-substations-src',
      layout: {
        'text-field': [
          'case',
          ['==', ['coalesce', ['get', 'isTripped'], false], true],
          '✕',
          ['==', ['coalesce', ['get', 'isOverloaded'], false], true],
          '⚠',
          ['==', ['coalesce', ['get', 'isGenerator'], false], true],
          '⚙',
          '',
        ] as any,
        'text-size': 12,
        'text-offset': [0, -1.3],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': [
          'case',
          ['==', ['coalesce', ['get', 'isTripped'], false], true],
          '#ef4444',
          ['==', ['coalesce', ['get', 'isOverloaded'], false], true],
          '#f97316',
          '#38bdf8',
        ] as any,
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

    // 7.1 Spatial Load Zones (District Locality Polygons)
    this.map.addSource('vajra-load-zones-src', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });

    this.map.addLayer({
      id: 'vajra-load-zones-fill',
      type: 'fill',
      source: 'vajra-load-zones-src',
      paint: {
        'fill-color': ['coalesce', ['get', 'fillColor'], '#6366f1'] as any,
        'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.12] as any,
      },
    });

    this.map.addLayer({
      id: 'vajra-load-zones-line',
      type: 'line',
      source: 'vajra-load-zones-src',
      paint: {
        'line-color': ['coalesce', ['get', 'lineColor'], '#6366f1'] as any,
        'line-width': 1.5,
        'line-dasharray': [4, 2],
        'line-opacity': 0.75,
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
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11.0,
          0,
          12.5,
          ['coalesce', ['get', 'height'], 15],
        ] as any,
        'fill-extrusion-base': [
          'interpolate',
          ['linear'],
          ['zoom'],
          11.0,
          0,
          12.5,
          ['coalesce', ['get', 'base_height'], 0],
        ] as any,
        'fill-extrusion-opacity': 0.88,
      },
    });

    // Interactive feature layer hierarchy (prioritizing point/line assets over background polygons)
    const interactiveLayers = [
      'vajra-substations-circle',
      'vajra-substations-health-ring',
      'vajra-infra-circle',
      'vajra-transmission-core',
      'vajra-transmission-glow',
      'vajra-transmission-health-glow',
      'vajra-load-clusters-circle',
      'vajra-buildings-extrusion',
      'vajra-buildings-fill',
      'vajra-load-zones-fill',
      'vajra-service-regions-fill',
      'osm-streamed-buildings-3d',
    ];

    // Cursor pointer on hover over interactive features
    for (const layerId of interactiveLayers) {
      this.map.on('mouseenter', layerId, () => {
        if (this.map) this.map.getCanvas().style.cursor = 'pointer';
      });
      this.map.on('mouseleave', layerId, () => {
        if (this.map) this.map.getCanvas().style.cursor = '';
      });
    }

    // Add click listener with small bounding buffer for pinpoint asset picking
    this.map.on('click', (e) => {
      if (!this.map) return;
      const bbox: [[number, number], [number, number]] = [
        [e.point.x - 4, e.point.y - 4],
        [e.point.x + 4, e.point.y + 4],
      ];
      const validLayers = interactiveLayers.filter((id) => this.map?.getLayer(id));
      const features = this.map.queryRenderedFeatures(bbox, {
        layers: validLayers,
      });
      if (features.length > 0) {
        const topFeature = features[0];
        const targetId =
          topFeature.properties?.id ||
          (topFeature.properties?.osm_id ? `osm-${topFeature.properties.osm_id}` : `feat-${Math.round(e.lngLat.lat * 10000)}-${Math.round(e.lngLat.lng * 10000)}`);
        if (targetId) {
          this.handlers.onEntityClick?.(targetId);
        }
        this.handlers.onFeatureClick?.(topFeature, { lng: e.lngLat.lng, lat: e.lngLat.lat });
      } else {
        this.handlers.onEntityClick?.('');
        this.handlers.onFeatureClick?.(null, { lng: e.lngLat.lng, lat: e.lngLat.lat });
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
   * Smoothly animates camera to target geodetic coordinate with 3D oblique perspective.
   */
  public flyToCoordinates(
    coords: { latitude: number; longitude: number },
    zoom: number = 15.5,
    pitch: number = 48,
    bearing?: number,
  ): void {
    if (!this.map) return;
    const currentBearing = this.map.getBearing() ?? 0;
    this.map.flyTo({
      center: [coords.longitude, coords.latitude],
      zoom: Math.max(10, Math.min(19, zoom)),
      pitch: Math.max(0, Math.min(60, pitch)),
      bearing: bearing !== undefined ? bearing : (currentBearing || 18),
      duration: 1600,
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

    const setExtrusionOpacity = (layerId: string, opacity: number) => {
      if (this.map?.getLayer(layerId)) {
        try {
          this.map.setPaintProperty(layerId, 'fill-extrusion-opacity', opacity);
        } catch {
          // Ignore
        }
      }
    };

    if (isSatellite) {
      setOpacity('water', 0.30);
      setOpacity('landuse_park', 0.15);
      setOpacity('landuse_residential', 0.0);
      setOpacity('landcover_wood', 0.15);
      setExtrusionOpacity('osm-streamed-buildings-3d', 0.82);
      setExtrusionOpacity('vajra-buildings-extrusion', 0.85);
    } else {
      setOpacity('water', 1.0);
      setOpacity('landuse_park', 1.0);
      setOpacity('landuse_residential', 1.0);
      setOpacity('landcover_wood', 1.0);
      setExtrusionOpacity('osm-streamed-buildings-3d', 0.88);
      setExtrusionOpacity('vajra-buildings-extrusion', 0.88);
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
  /**
   * Updates transmission lines and substations data with live electrical flow,
   * directional chevrons, flow magnitude scaling, moving particle pulses, and network highlighting.
   */
  public setPowerAssets(
    assets: GeoPowerAsset[],
    corridorImpacts?: Record<string, TransmissionCorridorImpact>,
    subStatuses?: Record<string, string>,
    syncState?: import('./geoElectricalStateAdapter').GeoTwinSynchronizedState,
    selectedEntityId?: string | null,
    tick: number = 0,
  ): void {
    if (!this.map || !this.isLoaded) return;

    const lineSource = this.map.getSource('vajra-transmission-src') as GeoJSONSource | undefined;
    const arrowSource = this.map.getSource('vajra-transmission-arrows-src') as GeoJSONSource | undefined;
    const particleSource = this.map.getSource('vajra-flow-particles-src') as GeoJSONSource | undefined;
    const subSource = this.map.getSource('vajra-substations-src') as GeoJSONSource | undefined;

    const currentTick = tick || syncState?.tick || 0;

    // Check which substations and lines are connected to selected asset for selective network highlighting
    const connectedToSelection = new Set<string>();
    if (selectedEntityId) {
      connectedToSelection.add(selectedEntityId);
      // If selected is a substation, find all lines connected to it
      for (const a of assets) {
        if (a.category === 'TRANSMISSION_LINE') {
          if (a.id.includes(selectedEntityId)) {
            connectedToSelection.add(a.id);
            // Also add the other endpoint
            const endpoints = a.id.replace('line-', '').replace('inferred-', '').split('--');
            for (const ep of endpoints) connectedToSelection.add(ep);
          }
        }
      }
      // If selected is a transmission line, add its endpoints
      const lineAsset = assets.find((a) => a.id === selectedEntityId);
      if (lineAsset && lineAsset.category === 'TRANSMISSION_LINE') {
        const endpoints = lineAsset.id.replace('line-', '').replace('inferred-', '').split('--');
        for (const ep of endpoints) connectedToSelection.add(ep);
      }
    }

    if (lineSource) {
      const arrowFeatures: any[] = [];
      const particleFeatures: any[] = [];
      const newActiveFlowLines: typeof this.activeFlowLines = [];

      const lineFeatures = assets
        .filter((a) => a.category === 'TRANSMISSION_LINE' && a.pathCoordinates && a.pathCoordinates.length >= 2)
        .map((a) => {
          const syncLine = syncState?.transmissionCorridors[a.id];
          const corr = corridorImpacts?.[a.electricalAssetId ?? a.id] ?? (corridorImpacts ? Object.values(corridorImpacts).find((c) => c.lineName === a.name) : undefined);
          const isSimulated = a.provenance?.isVerifiedRealWorld === false || a.provenance?.sourceType === 'SYNTHETIC';

          const loading = syncLine?.loadingPercent ?? corr?.loadingPercent ?? 0;
          const flowMW = syncLine?.activePowerFlowMW ?? Math.abs(corr?.currentFlowMW ?? 0);
          const isTripped = corr?.isTripped || corr?.status === 'FAILED' || syncLine?.isTripped || false;
          const isOverloaded = corr?.isOverloaded || loading >= 100 || syncLine?.isOverloaded || false;
          const isWarning = !isOverloaded && (loading >= 85 || corr?.status === 'WARNING');
          const isRecovering = corr?.status === 'RECOVERING' || syncLine?.isRecovering || false;

          let color = '#38bdf8'; // Base infrastructure blue
          let flowColor = '#10b981'; // Default normal healthy flow (Green)

          if (isSimulated) {
            color = '#a855f7';
            flowColor = '#a855f7';
          } else if (isTripped) {
            color = '#ef4444';
            flowColor = '#ef4444';
          } else if (isOverloaded) {
            color = '#f97316';
            flowColor = '#f97316';
          } else if (isWarning) {
            color = '#eab308';
            flowColor = '#eab308';
          } else if (isRecovering) {
            color = '#00e5c8';
            flowColor = '#00e5c8';
          }

          const healthStatusColor = flowColor;
          const hasZeroFlow = flowMW < 0.05 || isTripped;

          // Flow magnitude line width scaling
          const baseWidth = Math.max(1.8, Math.min(6.5, 1.8 + (loading / 100) * 4.2));

          // Opacity with selective network focus
          const isFocused = !selectedEntityId || connectedToSelection.has(a.id);
          const opacity = isFocused ? 0.95 : 0.2;
          const glowOpacity = isFocused ? (selectedEntityId ? 0.75 : 0.4) : 0.08;
          const flowLineWidth = isFocused && selectedEntityId ? baseWidth + 1.5 : baseWidth;

          const p0 = [a.pathCoordinates![0].longitude, a.pathCoordinates![0].latitude];
          const p1 = [a.pathCoordinates![1].longitude, a.pathCoordinates![1].latitude];

          const direction = syncLine?.flowDirection ?? (corr?.currentFlowMW !== undefined && corr.currentFlowMW < 0 ? 'B_TO_A' : 'A_TO_B');

          // Build Directional Chevron Features along line
          if (!hasZeroFlow && a.pathCoordinates && a.pathCoordinates.length >= 2) {
            const arrowCoords = direction === 'B_TO_A' ? [p1, p0] : [p0, p1];
            arrowFeatures.push({
              type: 'Feature',
              properties: {
                id: `arrow-${a.id}`,
                flowColor,
                flowMW,
                opacity: isFocused ? 0.95 : 0.15,
                direction,
              },
              geometry: {
                type: 'LineString',
                coordinates: arrowCoords,
              },
            });

            // Build Moving Particle Pulses along line (phase tied to currentTick & live continuous animator)
            const pSrc: [number, number] = direction === 'B_TO_A' ? [p1[0], p1[1]] : [p0[0], p0[1]];
            const pDst: [number, number] = direction === 'B_TO_A' ? [p0[0], p0[1]] : [p1[0], p1[1]];
            const density = loading >= 80 || flowMW >= 300 ? 4 : flowMW >= 100 ? 3 : 2;

            newActiveFlowLines.push({
              pSrc,
              pDst,
              flowColor,
              flowMW,
              loading,
              id: a.id,
              isFocused,
              density,
            });

            for (let i = 0; i < density; i++) {
              const phase = ((currentTick * 0.18 + i * 0.33) % 1.0);
              const curLng = pSrc[0] + (pDst[0] - pSrc[0]) * phase;
              const curLat = pSrc[1] + (pDst[1] - pSrc[1]) * phase;

              particleFeatures.push({
                type: 'Feature',
                properties: {
                  id: `pulse-${a.id}-${i}`,
                  color: flowColor,
                  radius: isFocused ? (selectedEntityId ? 4.5 : 3.5) : 2.5,
                  opacity: isFocused ? 0.95 : 0.15,
                },
                geometry: {
                  type: 'Point',
                  coordinates: [curLng, curLat],
                },
              });
            }
          }

          return {
            type: 'Feature' as const,
            properties: {
              id: a.id,
              name: a.name,
              voltageKV: a.voltageKV,
              color,
              flowColor,
              healthStatusColor,
              loadingPercent: loading,
              currentFlowMW: flowMW,
              isOverloaded,
              isTripped,
              hasZeroFlow,
              flowLineWidth,
              opacity,
              glowOpacity,
              isSimulated,
              provenanceSource: a.provenance?.sourceType ?? 'UNKNOWN',
            },
            geometry: {
              type: 'LineString' as const,
              coordinates: [p0, p1],
            },
          };
        });

      lineSource.setData({ type: 'FeatureCollection', features: lineFeatures });

      if (arrowSource) {
        arrowSource.setData({ type: 'FeatureCollection', features: arrowFeatures });
      }

      if (particleSource) {
        particleSource.setData({ type: 'FeatureCollection', features: particleFeatures });
      }

      this.activeFlowLines = newActiveFlowLines;
      this.startFlowAnimation();
    }

    if (subSource) {
      const subFeatures = assets
        .filter((a) => a.category !== 'TRANSMISSION_LINE')
        .map((a) => {
          const status =
            subStatuses?.[a.id] ??
            subStatuses?.[a.electricalAssetId ?? ''] ??
            (a.electricalAssetId ? subStatuses?.[`sub-${a.electricalAssetId}`] : undefined);
          const isSimulated = a.provenance?.isVerifiedRealWorld === false || a.provenance?.sourceType === 'SYNTHETIC';

          let color = '#0284c7'; // BLUE: verified public infrastructure core
          let strokeColor = '#10b981'; // GREEN: healthy/verified operational ring

          if (isSimulated) {
            color = '#a855f7'; // PURPLE: simulated
            strokeColor = '#c084fc';
          } else if (status === 'RECOVERING') {
            color = '#00e5c8'; // CYAN: recovering
            strokeColor = '#5eead4';
          } else if (status === 'FAILED' || status === 'TRIPPED') {
            color = '#ef4444'; // RED: failed
            strokeColor = '#fca5a5';
          } else if (status === 'OVERLOAD' || status === 'OVERLOADED') {
            color = '#f97316'; // ORANGE: overload
            strokeColor = '#fed7aa';
          } else if (status === 'WARNING') {
            color = '#eab308'; // YELLOW: warning
            strokeColor = '#fef08a';
          }

          const isTripped = status === 'FAILED' || status === 'TRIPPED';
          const isOverloaded = status === 'OVERLOAD' || status === 'OVERLOADED';
          const isGenerator = a.category === 'GENERATOR' || a.id.includes('gen');

          const healthStatusColor =
            isTripped
              ? '#ef4444' // RED: failed
              : isOverloaded
              ? '#f97316' // ORANGE: overload
              : status === 'WARNING'
              ? '#eab308' // YELLOW: warning
              : status === 'RECOVERING'
              ? '#00e5c8' // CYAN: recovering
              : isSimulated
              ? '#a855f7' // PURPLE: simulated
              : '#10b981'; // GREEN: healthy

          const isFocused = !selectedEntityId || connectedToSelection.has(a.id);
          const opacity = isFocused ? 1.0 : 0.3;

          return {
            type: 'Feature' as const,
            properties: {
              id: a.id,
              name: a.name,
              voltageKV: a.voltageKV,
              category: a.category,
              color,
              strokeColor,
              healthStatusColor,
              isTripped,
              isOverloaded,
              isGenerator,
              opacity,
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
   * Updates spatial load zones (Task 16/Phase 4.4).
   */
  public setLoadZones(zones: SpatialLoadZone[]): void {
    if (!this.map || !this.isLoaded) return;

    const source = this.map.getSource('vajra-load-zones-src') as GeoJSONSource | undefined;
    if (!source) return;

    const features = zones.map((z) => {
      let ring: number[][] = [];
      if (z.boundaryPolygon && z.boundaryPolygon.length > 0) {
        ring = z.boundaryPolygon.map((c) => [c.longitude, c.latitude]);
      } else {
        const radiusM = 1500;
        const latRad = (z.coordinates.latitude * Math.PI) / 180;
        const earthRadius = 6371000;
        const latDelta = (radiusM / earthRadius) * (180 / Math.PI);
        const lngDelta = (radiusM / (earthRadius * Math.cos(latRad))) * (180 / Math.PI);
        for (let i = 0; i < 16; i++) {
          const angle = (i * 2 * Math.PI) / 16;
          ring.push([
            z.coordinates.longitude + lngDelta * Math.cos(angle),
            z.coordinates.latitude + latDelta * Math.sin(angle),
          ]);
        }
        ring.push(ring[0]);
      }

      let categoryColor = '#6366f1'; // Indigo default (MIXED/RESIDENTIAL)
      if (z.criticality === 'CRITICAL' || z.loadCategory === 'CRITICAL') categoryColor = '#ef4444';
      else if (z.loadCategory === 'INDUSTRIAL') categoryColor = '#f59e0b';
      else if (z.loadCategory === 'COMMERCIAL') categoryColor = '#06b6d4';
      else if (z.loadCategory === 'EV') categoryColor = '#10b981';

      return {
        type: 'Feature' as const,
        properties: {
          id: z.id,
          name: z.name,
          demandMW: z.estimatedDemandMW,
          category: z.loadCategory,
          criticality: z.criticality,
          fillColor: categoryColor,
          fillOpacity: 0.12,
          lineColor: categoryColor,
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
   * Toggles layer visibility dynamically (Phase 4.4 layer integrity engine).
   */
  public setLayerVisibility(layerId: string, visible: boolean): void {
    if (!this.map || !this.isLoaded) return;

    // 1. Base Map toggle controls all background, cartographic, and satellite layers
    if (layerId === 'BASE_MAP') {
      for (const id of MapEngineAdapter.BASE_MAP_LAYER_IDS) {
        if (this.map.getLayer(id)) {
          this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
        }
      }
      if (this.map.getLayer('satellite-imagery-layer')) {
        const satVisible = visible && this.currentBackdropMode === 'SATELLITE';
        this.map.setLayoutProperty('satellite-imagery-layer', 'visibility', satVisible ? 'visible' : 'none');
      }
      return;
    }

    // 2. Specialized overlays mapping (strictly isolated targets)
    const layerMap: Record<string, string[]> = {
      BUILDINGS: ['vajra-buildings-fill', 'vajra-buildings-line', 'vajra-buildings-extrusion', 'osm-streamed-buildings-3d'],
      '3D_BUILDINGS': ['vajra-buildings-extrusion', 'osm-streamed-buildings-3d'],
      SUBSTATIONS: ['vajra-substations-circle', 'vajra-substations-badge'],
      TRANSMISSION: ['vajra-transmission-glow', 'vajra-transmission-core', 'vajra-transmission-arrows', 'vajra-flow-particles-layer'],
      POWER_FLOW: ['vajra-transmission-arrows', 'vajra-flow-particles-layer'],
      CRITICAL_INFRASTRUCTURE: ['vajra-infra-circle'],
      SERVICE_REGIONS: ['vajra-service-regions-fill', 'vajra-service-regions-line'],
      LOAD_CLUSTERS: ['vajra-load-clusters-circle'],
      LOAD_ZONES: ['vajra-load-zones-fill', 'vajra-load-zones-line'],
      GRID_HEALTH: ['vajra-substations-health-ring', 'vajra-transmission-health-glow'],
      FAILURES: ['vajra-substations-badge'],
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

  /**
   * Continuous GPU-friendly WebGL animation loop for active power flow particles.
   * Runs at ~25-30fps directly updating the GeoJSON source with zero React re-renders.
   */
  private startFlowAnimation(): void {
    if (this.flowAnimFrameId !== null || typeof window === 'undefined') return;

    let lastTime = performance.now();
    const animate = (now: number) => {
      if (this.isDestroyed || !this.map) {
        this.flowAnimFrameId = null;
        return;
      }

      const elapsed = now - lastTime;
      if (elapsed >= 35) {
        lastTime = now;
        this.animPhase = (this.animPhase + elapsed / 1200) % 1.0;

        const particleSource = this.map.getSource('vajra-flow-particles-src') as GeoJSONSource | undefined;
        if (particleSource && this.activeFlowLines.length > 0) {
          const particleFeatures: any[] = [];
          for (const line of this.activeFlowLines) {
            const count = line.density;
            for (let i = 0; i < count; i++) {
              const phase = (this.animPhase + i / count) % 1.0;
              const curLng = line.pSrc[0] + (line.pDst[0] - line.pSrc[0]) * phase;
              const curLat = line.pSrc[1] + (line.pDst[1] - line.pSrc[1]) * phase;

              particleFeatures.push({
                type: 'Feature',
                properties: {
                  id: `pulse-${line.id}-${i}`,
                  color: line.flowColor,
                  radius: line.isFocused ? (line.flowMW > 400 ? 4.5 : 3.5) : 2.5,
                  opacity: line.isFocused ? 0.95 : 0.25,
                },
                geometry: {
                  type: 'Point',
                  coordinates: [curLng, curLat],
                },
              });
            }
          }
          try {
            particleSource.setData({ type: 'FeatureCollection', features: particleFeatures });
          } catch {
            // Source busy or style reload
          }
        }
      }

      this.flowAnimFrameId = requestAnimationFrame(animate);
    };

    this.flowAnimFrameId = requestAnimationFrame(animate);
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.flowAnimFrameId !== null && typeof window !== 'undefined') {
      cancelAnimationFrame(this.flowAnimFrameId);
      this.flowAnimFrameId = null;
    }
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.isLoaded = false;
  }
}
