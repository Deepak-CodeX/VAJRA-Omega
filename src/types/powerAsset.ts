// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Canonical Power Asset Domain Model & Dual-Provenance System
// ═══════════════════════════════════════════════════════════════════════
// ONE ASSET. TWO VIEWS (Geo & Schematic). ONE SOURCE OF TRUTH.
// Absolute Rule: DO NOT FAKE REALITY. Every entity must carry provenance.
// Geographic proximity must NEVER be treated as verified electrical connectivity.
// ═══════════════════════════════════════════════════════════════════════

export type PowerAssetType =
  | 'GENERATOR'
  | 'POWER_PLANT'
  | 'SUBSTATION'
  | 'TRANSMISSION_LINE'
  | 'TRANSMISSION_TOWER'
  | 'BATTERY'
  | 'DISTRIBUTION_ASSET'
  | 'LOAD_ZONE'
  | 'CRITICAL_INFRASTRUCTURE';

export type DataClassification =
  | 'VERIFIED_REAL'    // 🟢 Ground-truthed public or utility surveyed data
  | 'CURRENT_PUBLIC'   // 🔵 Verified official published dataset (CEA, OpenStreetMap, OpenInfraMap)
  | 'HISTORICAL'       // ⚪ Officially archived record, not guaranteed active
  | 'INFERRED'         // 🟡 Engineering estimation / spatial proximity / Voronoi service region
  | 'SIMULATED';       // 🟣 Hypothetical scenario entity for contingency testing

export type GeometryProvenanceType =
  | 'SURVEY_GROUND_TRUTH'  // Geodetic survey / official utility coordinate record
  | 'OSM_VERIFIED_NODE'    // OpenStreetMap surveyed node/way footprint (EPSG:4326)
  | 'APPROXIMATE_BOUNDS'   // Municipal boundary envelope or regional parcel approximation
  | 'ESTIMATED_COORDINATE';// Centroid derivation where exact switchyard boundary is unmapped

export type TopologyProvenanceType =
  | 'VERIFIED_UTILITY_SLD' // Sourced directly from published State Transco / CEA Single Line Diagram
  | 'REGIONAL_PLAN_MAP'    // Sourced from CEA Inter-Regional Planning Studies (400kV/220kV corridors)
  | 'INFERRED_SPATIAL_TIE' // Algorithmically inferred connection (explicitly tagged INFERRED)
  | 'UNVERIFIED_OPEN_DATA' // OSM line tag without confirmed phase or bus connection
  | 'SIMULATED_SCENARIO'  // Synthetic line corridor injected for contingency testing
  | 'INFERRED'            // General inferred topological relationship
  | 'UNKNOWN';            // Topology not verifiable from public records

export type BuildingProvenanceType =
  | 'OFFICIAL_GIS'         // Municipal development authority GIS dataset
  | 'SURVEY_VERIFIED'      // Ground-truthed physical survey with field-verified height
  | 'OSM_MAPPED'           // OpenStreetMap building footprint polygon with tagged height/levels
  | 'ESTIMATED'            // Footprint present in public data, but height derived from heuristics
  | 'UNKNOWN';             // Building geometry exists, but height/usage undocumented

export type AssetOperationalStatus =
  | 'ONLINE'
  | 'DEGRADED'
  | 'TRIPPED'
  | 'MAINTENANCE'
  | 'UNKNOWN';

export interface PowerAsset {
  id: string;                                    // Canonical identifier (e.g. "sub-del-badarpur-400kv")
  assetType: PowerAssetType;
  name: string;                                  // Canonical name (e.g. "Badarpur 400kV Grid Substation")
  operator?: string;                             // e.g. "Delhi Transco Limited (DTL)" / "PGCIL"
  coordinates: {
    latitude: number;
    longitude: number;
    elevationMeters?: number;
  };
  geometry?: {
    type: 'Point' | 'LineString' | 'Polygon';
    coordinates: any;
  };
  voltageKV: number | null;                      // null if unknown ("DATA NOT PUBLICLY AVAILABLE")
  nominalCapacityMVA: number | null;             // null if unknown
  status: AssetOperationalStatus;
  loadingPercent?: number;                       // 0 to 100+% of thermal capacity

  // Provenance & Freshness Metadata
  source: string;                                // e.g. "Central Electricity Authority / OpenInfraMap"
  sourceUrl: string;                             // Verifiable link or official document reference
  retrievedAt: string;                           // ISO 8601 timestamp
  publishedAt?: string;                          // When published by authority
  updateFrequency: 'REALTIME' | 'HOURLY' | 'DAILY' | 'MONTHLY' | 'STATIC_ARCHIVE';
  freshness: string;                             // e.g. "Updated: 2026-03-15 (Monthly CEA Review)"
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  classification: DataClassification;

  // Dual-Provenance Rigor (MANDATORY GATE)
  geometryProvenance: GeometryProvenanceType;
  topologyProvenance: TopologyProvenanceType;

  // Engineering & Topology Attributes
  substationType?: 'GIS' | 'AIS' | 'HYBRID';
  feedersCount?: number;
  connectedAssetIds: string[];                   // Verified topological links ONLY
  inferredAssetIds?: string[];                   // Proximity-based links (explicitly INFERRED)

  // Phase 5: Dynamic Electrical Flow & Topological Inspection
  activePowerFlowMW?: number;
  signedFlowMW?: number;
  flowDirection?: 'A_TO_B' | 'B_TO_A' | 'ZERO';
  directionDescription?: string;
  fromSubstationId?: string;
  toSubstationId?: string;
  fromSubstationName?: string;
  toSubstationName?: string;
  geometryTypeDescription?: string;
  demandMW?: number;
  suppliedMW?: number;
  unservedMW?: number;
  supplyingSubstations?: { id: string; name: string; flowMW: number }[];
  upstreamSubstations?: { id: string; name: string; flowMW: number }[];
  downstreamSubstations?: { id: string; name: string; flowMW: number }[];
  suppliedLoadRegions?: string[];
}

export interface CityRegistryEntry {
  cityId: string;                                // e.g. "city-delhi", "city-mumbai"
  canonicalName: string;                         // "Delhi NCR", "Mumbai Metropolitan Region"
  state: string;                                 // "Delhi NCR", "Maharashtra", "West Bengal", etc.
  countryCode: 'IND';
  latitude: number;
  longitude: number;
  elevationMeters: number;
  boundingRegion: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
  };
  supportedZoomLevels: {
    min: number;                                 // e.g. 5
    max: number;                                 // e.g. 19
    default: number;                             // e.g. 11.5
  };
  geographicDataSources: {
    baseMap: string;
    buildingFootprints: string;
    terrain: string;
  };
  electricalDataSources: {
    transmissionGrid: string;
    distributionGrid: string;
  };
  dataFreshness: string;
  coverageStatus: 'FULL_METRO' | 'URBAN_CORE' | 'PARTIAL_PUBLIC' | 'PARTIAL_PUBLIC_TRANSMISSION';
  utilityFeederStatus: string;                   // Explicit status statement
  liveTelemetryStatus: string;                   // Explicit status statement
  regionalGridInterconnect: string;
}
