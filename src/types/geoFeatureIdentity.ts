// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Geographic Feature Identity & Unified Data Model
// ═══════════════════════════════════════════════════════════════════════

import type { GeoCoordinate } from './geo';

export type GeoFeatureClassification =
  | 'VERIFIED_EXTERNAL'
  | 'CURRENT_PUBLIC'
  | 'DERIVED'
  | 'MODELED'
  | 'SIMULATED'
  | 'UNKNOWN';

export type GeoFeatureCategory =
  | 'SUBSTATION'
  | 'TRANSMISSION_LINE'
  | 'GENERATOR'
  | 'BUILDING'
  | 'CRITICAL_INFRASTRUCTURE'
  | 'LOAD_REGION'
  | 'LOAD_CLUSTER'
  | 'ROAD'
  | 'RAILWAY'
  | 'OTHER';

export interface GeoFeatureIdentity {
  featureId: string;
  externalId: string | null;
  source: string;
  sourceLayer?: string;
  name: string;
  featureType: string;
  category: GeoFeatureCategory;
  cityId: string;
  cityName: string;
  latitude: number;
  longitude: number;
  coordinates: GeoCoordinate;
  properties: Record<string, any>;
  provenance: {
    sourceType: GeoFeatureClassification;
    sourceReference: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    lastUpdated?: string;
    isVerifiedRealWorld: boolean;
    methodologyNotes: string;
  };
  classification: GeoFeatureClassification;
  
  // Building specific attributes (MODELED ONLY — never utility telemetry)
  buildingDetails?: {
    usageType: string;
    areaSqMeters?: number;
    heightMeters?: number;
    floorCount?: number;
    modeledDemandMW: number;
    demandMethodology: string;
    isCriticalCustomer: boolean;
    isTelemetry?: boolean;
    disclaimer?: string;
  };

  // Electrical attributes (if connected or power asset)
  electricalDetails?: {
    assetType?: 'SUBSTATION' | 'TRANSMISSION_LINE' | 'GENERATOR';
    voltageKV?: number;
    capacityMW?: number;
    flowMW?: number;
    signedFlowMW?: number;
    flowDirection?: 'A_TO_B' | 'B_TO_A' | 'ZERO';
    directionDescription?: string;
    fromName?: string;
    toName?: string;
    loadingPercent?: number;
    status?: 'ONLINE' | 'OVERLOADED' | 'TRIPPED' | 'FAILED' | 'DEGRADED';
    connectedSubstations?: string[];
    upstreamInflows?: Array<{ id: string; name: string; flowMW: number }>;
    downstreamOutflows?: Array<{ id: string; name: string; flowMW: number }>;
    suppliedRegions?: string[];
    geometryTypeDescription?: string;
  };

  // Load Region attributes
  loadRegionDetails?: {
    modeledDemandMW: number;
    servedDemandMW: number;
    unservedDemandMW: number;
    criticalDemandMW: number;
    status: 'SUPPLIED' | 'PARTIALLY_UNSERVED' | 'TOTAL_BLACKOUT';
    supplyingSubstations: Array<{ id: string; name: string; flowMW: number }>;
  };
}

export interface ElectricalFlowEdge {
  id: string;
  fromAssetId: string;
  toAssetId: string;
  fromAssetName: string;
  toAssetName: string;
  fromCoordinates: GeoCoordinate;
  toCoordinates: GeoCoordinate;
  voltageKV: number;
  powerFlowMW: number;
  loadingPercent: number;
  direction: 'A_TO_B' | 'B_TO_A' | 'ZERO';
  status: 'ONLINE' | 'OVERLOADED' | 'FAILED';
  provenance: string;
  sourceType: GeoFeatureClassification;
  isSimulated: boolean;
}

export interface LoadRegion {
  id: string;
  cityId: string;
  name: string;
  geometry: GeoCoordinate[];
  centroid: GeoCoordinate;
  modeledDemandMW: number;
  servedDemandMW: number;
  unservedDemandMW: number;
  criticalDemandMW: number;
  loadingPercent: number;
  status: 'NORMAL' | 'WARNING' | 'OVERLOADED' | 'UNSERVED';
  provenance: string;
  classification: 'MODELED' | 'SPATIAL_INFERENCE';
}

export interface GeoTwinCityState {
  cityId: string;
  cityName: string;
  features: GeoFeatureIdentity[];
  buildingsCount: number;
  infrastructureCount: number;
  powerAssetsCount: number;
  flowEdgesCount: number;
  loadRegionsCount: number;
  selectedFeatureId: string | null;
  selectedFeatureIdentity: GeoFeatureIdentity | null;
  simulationTick: number;
  provenanceSummary: {
    verifiedCount: number;
    modeledCount: number;
    syntheticCount: number;
  };
}
