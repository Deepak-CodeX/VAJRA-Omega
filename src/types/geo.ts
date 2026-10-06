// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Geo-Twin Domain Model & Type Definitions
// ═══════════════════════════════════════════════════════════════════════
// Architecture:
// Strict separation between:
// 1. Geographic Graph (physical coordinates, bounding boxes, spatial containment)
// 2. Electrical Graph (substations, lines, generators, buses, feeders)
// 3. Simulation State (voltages, flows, frequencies, cascades, recoveries)
// ═══════════════════════════════════════════════════════════════════════

import type { AssetStatus } from './index';

// ─── Coordinate System ──────────────────────────────────────────────
// Convention: WGS84 (EPSG:4326) Decimal Degrees.
// Latitude: -90.0 to +90.0 (North positive)
// Longitude: -180.0 to +180.0 (East positive)
// Optional Elevation: meters above sea level (MSL)
// Strictly distinct from screen X/Y or abstract schematic GridPosition.

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
  elevationMeters?: number;
}

export interface GeoBoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

// ─── Data Provenance & Confidence Model ──────────────────────────────
// Every geographic or infrastructure entity must explicitly declare its source.
// Synthetic or modeled data must NEVER be passed off as verified real-world ground truth.

export type DataProvenanceType =
  | 'VERIFIED_EXTERNAL' // Ground-truthed public or utility data (e.g. OpenStreetMap surveyed, CEA published)
  | 'MODELED'           // Derived via engineering estimation, building footprint heuristics, or geospatial interpolation
  | 'SYNTHETIC'         // Procedurally generated for simulation/testing; no real-world electrical counterpart claimed
  | 'USER_DEFINED';     // Injected by operator during simulation scenario

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DataProvenance {
  sourceType: DataProvenanceType;
  confidence: ConfidenceLevel;
  sourceReference: string;
  lastUpdated: string;
  isVerifiedRealWorld: boolean;
  methodologyNotes?: string;
}

// ─── Geographic Scale Hierarchy ─────────────────────────────────────
// Hierarchical spatial resolution from globe down to single transformer or room.

export type GeoScaleLevel =
  | 'WORLD'
  | 'COUNTRY'
  | 'STATE_REGION'
  | 'CITY'
  | 'DISTRICT_LOCALITY'
  | 'SITE'
  | 'BUILDING_INFRASTRUCTURE';

// ─── Geographic Entity Types ────────────────────────────────────────

export type GeoEntityType =
  | 'CITY'
  | 'REGION'
  | 'DISTRICT'
  | 'BUILDING'
  | 'CRITICAL_INFRASTRUCTURE'
  | 'POWER_STATION'
  | 'SUBSTATION'
  | 'TRANSMISSION_TOWER'
  | 'LINE_CORRIDOR'
  | 'EV_STATION'
  | 'ZONE';

export interface GeoEntity {
  id: string;
  name: string;
  entityType: GeoEntityType;
  scaleLevel: GeoScaleLevel;
  coordinates: GeoCoordinate;
  boundingBox?: GeoBoundingBox;
  parentId?: string; // Enforces geographic containment hierarchy
  provenance: DataProvenance;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
}

// ─── City & Administrative Region ───────────────────────────────────

export interface City extends GeoEntity {
  entityType: 'CITY';
  scaleLevel: 'CITY';
  countryCode: string;
  stateOrProvince: string;
  adminCode?: string;
  population?: number;
  centerCoordinates: GeoCoordinate;
  boundingBox: GeoBoundingBox;
  /** Boundary polygon coordinates for rendering city perimeter */
  boundaryPolygon?: GeoCoordinate[];
  regionalGridInterconnect: string; // e.g., "Northern Regional Grid (NR)", "Western Grid (WR)"
}

export interface Region extends GeoEntity {
  entityType: 'REGION';
  scaleLevel: 'STATE_REGION';
  countryCode: string;
  substationsCount?: number;
  totalGenerationCapacityMW?: number;
}

// ─── Building & Structure ───────────────────────────────────────────

export type BuildingUsageType =
  | 'RESIDENTIAL'
  | 'COMMERCIAL'
  | 'INDUSTRIAL'
  | 'HEALTHCARE'
  | 'GOVERNMENT'
  | 'EDUCATIONAL'
  | 'DATA_CENTER'
  | 'MIXED_USE';

export interface Building extends GeoEntity {
  entityType: 'BUILDING';
  scaleLevel: 'BUILDING_INFRASTRUCTURE';
  usageType: BuildingUsageType;
  footprintPolygon?: GeoCoordinate[];
  heightMeters?: number;
  floorCount?: number;
  estimatedPeakDemandMW: number;
  /** Inferred electrical connection (not guaranteed verified ground truth) */
  inferredFeederSubstationId?: string;
  isCriticalPowerCustomer: boolean;
}

// ─── Critical Infrastructure ────────────────────────────────────────

export type CriticalInfrastructureType =
  | 'HOSPITAL'
  | 'WATER_TREATMENT'
  | 'AIRPORT'
  | 'METRO_TRANSIT'
  | 'EMERGENCY_SERVICES'
  | 'TELECOM_EXCHANGE'
  | 'GOVERNMENT_HQ'
  | 'DEFENSE_FACILITY';

export interface CriticalInfrastructure extends GeoEntity {
  entityType: 'CRITICAL_INFRASTRUCTURE';
  scaleLevel: 'BUILDING_INFRASTRUCTURE';
  infraType: CriticalInfrastructureType;
  emergencyBackupGenerationMW: number;
  requiresDualFeed: boolean;
  priorityTier: 'TIER_1_LIFE_SAFETY' | 'TIER_2_CIVIL_OPERATIONS' | 'TIER_3_ECONOMIC';
  servedBySubstationId?: string;
}

// ─── Geo-Power Asset (Bridging Layer) ────────────────────────────────
// Associates an existing electrical simulation asset with real geographic coordinates.
// Crucial: The simulation engine owns the electrical physics; this model owns the physical location.

export type PowerAssetCategory =
  | 'GENERATOR'
  | 'TRANSMISSION_SUBSTATION'
  | 'DISTRIBUTION_SUBSTATION'
  | 'TRANSMISSION_LINE'
  | 'BATTERY_STORAGE'
  | 'EV_CHARGING_HUB'
  | 'FEEDER';

export interface GeoPowerAsset extends GeoEntity {
  /** Stable identifier matching an existing electrical asset in SimulationState.topology */
  electricalAssetId: string;
  electricalAssetType: 'generator' | 'substation' | 'transmission_line' | 'battery' | 'load';
  category: PowerAssetCategory;
  /** For transmission lines or corridor feeders: polyline path coordinates */
  pathCoordinates?: GeoCoordinate[];
  voltageKV: number;
  nominalCapacityMW: number;
  /** False if physical placement was estimated/modeled rather than surveyor verified */
  isSurveyVerified: boolean;
}

// ─── Geographic vs Electrical Relationships ─────────────────────────
// A spatial relationship (e.g. Building A is 50m from Substation B) must NEVER
// be conflated with an electrical connectivity edge (Substation B feeds Building A).

export type GeoSpatialRelationType =
  | 'CONTAINS'
  | 'WITHIN'
  | 'ADJACENT_TO'
  | 'PROXIMATE_TO'
  | 'INTERSECTS';

export interface GeoRelationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationType: GeoSpatialRelationType;
  distanceMeters?: number;
  provenance: DataProvenance;
}

export type ElectricalRelationType =
  | 'TRANSMITS_TO'
  | 'STEPS_DOWN_TO'
  | 'FEEDS_LOAD'
  | 'BACKS_UP'
  | 'DISPATCHES_TO';

export interface ElectricalRelationship {
  id: string;
  fromElectricalAssetId: string;
  toElectricalAssetId: string;
  relationType: ElectricalRelationType;
  voltageLevelKV: number;
  provenance: DataProvenance;
  /** Whether this connection is verified from utility SLDs or algorithmically inferred */
  isTopologicallyVerified: boolean;
}

// ─── Geo Layers ─────────────────────────────────────────────────────

export type GeoLayerId =
  | 'BASE_MAP'
  | 'BUILDINGS'
  | 'ROADS'
  | 'POWER_GENERATION'
  | 'SUBSTATIONS'
  | 'TRANSMISSION'
  | 'DISTRIBUTION'
  | 'TRANSFORMERS'
  | 'LOAD_ZONES'
  | 'CRITICAL_INFRASTRUCTURE'
  | 'EV_INFRASTRUCTURE'
  | 'GRID_HEALTH'
  | 'FAILURES'
  | 'CASCADE_PROPAGATION'
  | 'SERVICE_REGIONS'
  | 'LOAD_CLUSTERS'
  | 'POWER_FLOW';

export interface GeoLayerConfig {
  id: GeoLayerId;
  name: string;
  description: string;
  visible: boolean;
  opacity: number; // 0..1
  category: 'BASE' | 'INFRASTRUCTURE' | 'ELECTRICAL' | 'SIMULATION_OVERLAY';
}

// ─── Geographic ↔ Electrical Mapping Models (Task 16) ───────────────

export type AssetMappingClassification =
  | 'VERIFIED_MAPPING'
  | 'HIGH_CONFIDENCE_MATCH'
  | 'INFERRED_MATCH'
  | 'UNMATCHED';

export type MappingType =
  | 'VERIFIED'
  | 'SOURCE_MATCHED'
  | 'SPATIAL_INFERENCE'
  | 'SYNTHETIC';

export interface ElectricalGeoReference {
  electricalAssetId: string;
  geoEntityId: string;
  coordinates: GeoCoordinate;
  pathCoordinates?: GeoCoordinate[];
  mappingType?: MappingType;
  classification?: AssetMappingClassification;
  confidence?: ConfidenceLevel;
  source?: string;
  provenance: DataProvenance;
  lastUpdated?: string;
  isVerified: boolean;
}

export interface SpatialLoadZone extends GeoEntity {
  entityType: 'ZONE';
  scaleLevel: 'DISTRICT_LOCALITY' | 'SITE';
  associatedElectricalAssetIds: string[];
  associatedSubstationId?: string;
  estimatedDemandMW: number;
  criticality: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  boundaryPolygon?: GeoCoordinate[];
  loadCategory: 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL' | 'CRITICAL' | 'EV' | 'MIXED';
  mappingType: MappingType;
  confidence: ConfidenceLevel;
}

/**
 * Spatial service region generated via Voronoi geometric partition around substations.
 * Scientific Invariant: Nearest-neighbor spatial proximity does NOT prove electrical connectivity.
 * This is an ESTIMATED SERVICE REGION, not an actual utility feeder territory.
 */
export interface EstimatedServiceRegion {
  id: string;
  substationId: string;
  substationName: string;
  centerCoordinates: GeoCoordinate;
  boundaryPolygon: GeoCoordinate[];
  areaSqKm: number;
  associatedLoadIds: string[];
  totalEstimatedDemandMW: number;
  determinationMethod: 'VORONOI_PROXIMITY' | 'BOUNDED_PERIMETER';
  isVerifiedFeederTerritory: false;
  provenance: DataProvenance;
  disclaimer: string;
}

export interface SpatialLoadCluster {
  id: string;
  name: string;
  centroid: GeoCoordinate;
  radiusMeters: number;
  totalDemandMW: number;
  loadCategory: 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL' | 'CRITICAL' | 'EV' | 'MIXED';
  containsCriticalLoad: boolean;
  memberLoadIds: string[];
  assignedSubstationId?: string;
  clusteringMetric: string;
}

// ─── Geo Viewport / Camera ──────────────────────────────────────────

export interface GeoViewport {
  center: GeoCoordinate;
  zoom: number; // Web mercator zoom (0..22)
  pitchDegrees: number;
  bearingDegrees: number;
  boundingBox?: GeoBoundingBox;
}

// ─── City Search & Resolution ───────────────────────────────────────

export interface CitySearchResult {
  cityId: string;
  displayName: string;
  stateOrProvince: string;
  countryCode: string;
  centerCoordinates: GeoCoordinate;
  boundingBox: GeoBoundingBox;
  availableEntityCount: number;
  provenanceType: DataProvenanceType;
}

// ─── Geo-Twin Authoritative State ───────────────────────────────────

export type MapEngineStatus = 'UNINITIALIZED' | 'INITIALIZING' | 'READY' | 'ERROR' | 'FALLBACK';
export type LocationResolutionStatus = 'IDLE' | 'RESOLVING' | 'SUCCESS' | 'ERROR';

export interface GeoTwinState {
  isGeoViewActive: boolean;
  selectedCity: City | null;
  selectedRegion: Region | null;
  selectedEntityId: string | null;
  selectedFeatureIdentity?: import('./geoFeatureIdentity').GeoFeatureIdentity | null;
  viewport: GeoViewport;
  visibleLayers: Record<GeoLayerId, boolean>;
  searchQuery: string;
  searchResults: CitySearchResult[];
  loadedEntitiesCount: number;
  provenanceSummary: {
    verifiedCount: number;
    modeledCount: number;
    syntheticCount: number;
  };
  /** Status of the underlying MapLibre GL map engine */
  mapEngineStatus: MapEngineStatus;
  /** Status of active location geocoding / resolution */
  locationResolutionStatus: LocationResolutionStatus;
  /** User-friendly error message if resolution or map loading fails */
  errorMessage: string | null;
  /** Monotonic token counter protecting against stale async request overwrites */
  requestGenerationToken: number;
  /** Mandatory OpenStreetMap / Carto attribution string */
  attribution: string;
  /** Task 16: Voronoi estimated nearest-substation service regions */
  serviceRegions: EstimatedServiceRegion[];
  /** Task 16: Spatial load clusters */
  loadClusters: SpatialLoadCluster[];
  /** Task 16: Spatial load zones (district locality areas) */
  loadZones?: SpatialLoadZone[];
  /** Task 16: Electrical to geographic asset mappings */
  electricalGeoMappings: ElectricalGeoReference[];
  /** Task 17: Live dynamic geo-simulation impact state */
  simulationImpact?: GeoSimulationImpact;
  /** Task 17: Spatial cascade progression steps */
  activeGeoCascadeSteps?: GeoCascadeSpatialStep[];
  /** Critical civic facilities loaded for active city */
  criticalInfrastructure?: CriticalInfrastructure[];
}

// ─── Geo-Simulation Integration Models (Task 17) ────────────────────

export interface ServiceRegionSimulationImpact {
  regionId: string;
  substationId: string;
  substationName: string;
  substationStatus: import('./index').AssetStatus;
  servedDemandMW: number;
  unservedDemandMW: number;
  totalDemandMW: number;
  /** 0.0 = fully powered, 1.0 = total blackout */
  blackoutFraction: number;
  blackoutState: 'NORMAL' | 'PARTIAL_CURTAILMENT' | 'TOTAL_BLACKOUT';
  affectedConsumerCount: number;
  criticalFacilitiesAffectedCount: number;
  powerQualityIndex: number; // 0..1
}

export type CriticalInfraPowerState = 'NORMAL_GRID' | 'BACKUP_ACTIVE' | 'ISOLATED_BLACKOUT';

export interface CriticalInfraSimulationStatus {
  infraId: string;
  infraName: string;
  infraType: CriticalInfrastructureType;
  priorityTier: 'TIER_1_LIFE_SAFETY' | 'TIER_2_CIVIL_OPERATIONS' | 'TIER_3_ECONOMIC';
  powerSupplyState: CriticalInfraPowerState;
  backupGenerationMW: number;
  backupCoveragePercent: number;
  feedSubstationId?: string;
  coordinates: GeoCoordinate;
}

export interface TransmissionCorridorImpact {
  lineId: string;
  lineName: string;
  fromSubstationId: string;
  toSubstationId: string;
  status: import('./index').AssetStatus;
  currentFlowMW: number;
  capacityMW: number;
  loadingPercent: number;
  isOverloaded: boolean;
  isTripped: boolean;
  pathCoordinates?: GeoCoordinate[];
}

export interface GeoCascadeSpatialStep {
  stepIndex: number;
  timestamp: string;
  action: string;
  triggerAssetId: string;
  triggerAssetName: string;
  triggerCoordinates?: GeoCoordinate;
  affectedAssetId: string;
  affectedAssetName: string;
  affectedCoordinates?: GeoCoordinate;
  affectedRegionId?: string;
  unservedLoadMW: number;
  affectedConsumers: number;
  criticalFacilitiesAffected: string[];
}

export interface GeoSimulationImpact {
  tick: number;
  timestamp: string;
  totalCityDemandMW: number;
  totalCityServedMW: number;
  totalCityUnservedMW: number;
  /** Fraction of city demand successfully served 0..1 */
  cityServiceFraction: number;
  blackoutZoneCount: number;
  criticalFacilitiesAtRisk: number;
  serviceRegionImpacts: Record<string, ServiceRegionSimulationImpact>;
  criticalInfraStatus: Record<string, CriticalInfraSimulationStatus>;
  corridorImpacts: Record<string, TransmissionCorridorImpact>;
  latestCascadeSteps: GeoCascadeSpatialStep[];
}

// ─── Task 19: 3D Visualization & Dynamic Blackout Types ─────────────

export type BuildingHeightProvenance =
  | 'VERIFIED_SURVEY'
  | 'REAL_METADATA'
  | 'FLOOR_COUNT_ESTIMATE'
  | 'USAGE_TYPE_FALLBACK'
  | 'SYNTHETIC';

export type BlackoutVisualCategory =
  | 'ILLUMINATED'
  | 'GRID_STRESS'
  | 'ESTIMATED_OUTAGE'
  | 'SEVERE_BLACKOUT'
  | 'RECOVERING';

export interface Building3DVisual {
  buildingId: string;
  name: string;
  usageType: BuildingUsageType;
  heightMeters: number;
  baseMeters: number;
  provenance: BuildingHeightProvenance;
  isHeightEstimated: boolean;
  blackoutCategory: BlackoutVisualCategory;
  /** Visual dimming factor from 0.0 (fully lit) to 1.0 (unlit blackout) */
  dimmingFactor: number;
  colorHex: string;
  opacity: number;
  serviceRegionId?: string;
  substationId?: string;
  criticalBackupActive: boolean;
  uncertaintyLabel: string;
}

export interface City3DVisualState {
  cityId: string;
  cityName: string;
  nightModeEnabled: boolean;
  reducedMotion: boolean;
  totalBuildings: number;
  illuminatedCount: number;
  stressedCount: number;
  outageCount: number;
  blackoutCount: number;
  recoveringCount: number;
  averageDimming: number;
}

