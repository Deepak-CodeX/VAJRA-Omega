// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Deterministic Geo-Twin Development Provider
// ═══════════════════════════════════════════════════════════════════════
// Fully offline, zero-network-dependency development dataset.
//
// STRICT DATA POLICY:
// Every entity in this dataset is explicitly marked as SYNTHETIC or MODELED.
// This dataset validates the architecture and coordinates. It does NOT claim
// to represent verified real-world utility single-line diagrams (SLDs).
// ═══════════════════════════════════════════════════════════════════════

import type {
  City,
  Building,
  CriticalInfrastructure,
  GeoPowerAsset,
  GeoRelationship,
  ElectricalRelationship,
  GeoBoundingBox,
  CitySearchResult,
  DataProvenance,
} from '@/types/geo';
import type { IGeoDataProvider, CityTwinPackage } from './geoProvider';
import { isCoordinateInBoundingBox } from './geoCoordinates';

const DEMO_PROVENANCE_SYNTHETIC: DataProvenance = {
  sourceType: 'SYNTHETIC',
  confidence: 'MEDIUM',
  sourceReference: 'VAJRA_OMEGA_OFFLINE_DEMO_DATASET_V1',
  lastUpdated: '2026-10-04T00:00:00Z',
  isVerifiedRealWorld: false,
  methodologyNotes:
    'Synthetically modeled demonstration entity for architecture validation and offline development. Not surveyed ground truth.',
};

const DEMO_PROVENANCE_MODELED: DataProvenance = {
  sourceType: 'MODELED',
  confidence: 'MEDIUM',
  sourceReference: 'OPEN_GEOSPATIAL_APPROXIMATION',
  lastUpdated: '2026-10-04T00:00:00Z',
  isVerifiedRealWorld: false,
  methodologyNotes:
    'Approximate geographic landmark center coordinates combined with modeled electrical attributes for simulation testing.',
};

// ─── Deterministic Cities ───────────────────────────────────────────

export const DEMO_CITIES: Record<string, City> = {
  'city-delhi': {
    id: 'city-delhi',
    name: 'Delhi National Capital Region',
    entityType: 'CITY',
    scaleLevel: 'CITY',
    countryCode: 'IND',
    stateOrProvince: 'Delhi NCR',
    adminCode: 'DL',
    population: 33000000,
    centerCoordinates: { latitude: 28.6139, longitude: 77.209, elevationMeters: 216 },
    boundingBox: {
      minLatitude: 28.4,
      maxLatitude: 28.88,
      minLongitude: 76.85,
      maxLongitude: 77.45,
    },
    coordinates: { latitude: 28.6139, longitude: 77.209, elevationMeters: 216 },
    regionalGridInterconnect: 'Northern Regional Grid (NR-GRID)',
    provenance: DEMO_PROVENANCE_MODELED,
  },
  'city-mumbai': {
    id: 'city-mumbai',
    name: 'Mumbai Metropolitan Region',
    entityType: 'CITY',
    scaleLevel: 'CITY',
    countryCode: 'IND',
    stateOrProvince: 'Maharashtra',
    adminCode: 'MH',
    population: 21000000,
    centerCoordinates: { latitude: 19.076, longitude: 72.8777, elevationMeters: 14 },
    boundingBox: {
      minLatitude: 18.89,
      maxLatitude: 19.3,
      minLongitude: 72.75,
      maxLongitude: 73.05,
    },
    coordinates: { latitude: 19.076, longitude: 72.8777, elevationMeters: 14 },
    regionalGridInterconnect: 'Western Regional Grid (WR-GRID)',
    provenance: DEMO_PROVENANCE_MODELED,
  },
  'city-bengaluru': {
    id: 'city-bengaluru',
    name: 'Bengaluru Urban',
    entityType: 'CITY',
    scaleLevel: 'CITY',
    countryCode: 'IND',
    stateOrProvince: 'Karnataka',
    adminCode: 'KA',
    population: 13500000,
    centerCoordinates: { latitude: 12.9716, longitude: 77.5946, elevationMeters: 920 },
    boundingBox: {
      minLatitude: 12.8,
      maxLatitude: 13.15,
      minLongitude: 77.45,
      maxLongitude: 77.75,
    },
    coordinates: { latitude: 12.9716, longitude: 77.5946, elevationMeters: 920 },
    regionalGridInterconnect: 'Southern Regional Grid (SR-GRID)',
    provenance: DEMO_PROVENANCE_MODELED,
  },
  'city-bhopal': {
    id: 'city-bhopal',
    name: 'Bhopal City',
    entityType: 'CITY',
    scaleLevel: 'CITY',
    countryCode: 'IND',
    stateOrProvince: 'Madhya Pradesh',
    adminCode: 'MP',
    population: 2400000,
    centerCoordinates: { latitude: 23.2599, longitude: 77.4126, elevationMeters: 527 },
    boundingBox: {
      minLatitude: 23.1,
      maxLatitude: 23.38,
      minLongitude: 77.3,
      maxLongitude: 77.55,
    },
    coordinates: { latitude: 23.2599, longitude: 77.4126, elevationMeters: 527 },
    regionalGridInterconnect: 'Western Regional Grid (WR-MP-TRANSMISSION)',
    provenance: DEMO_PROVENANCE_MODELED,
  },
};

// ─── Delhi Demonstration Package ────────────────────────────────────

const DELHI_BUILDINGS: Building[] = [
  {
    id: 'bldg-del-cp-01',
    name: 'Connaught Place Financial Circle (Modeled)',
    entityType: 'BUILDING',
    scaleLevel: 'BUILDING_INFRASTRUCTURE',
    usageType: 'COMMERCIAL',
    coordinates: { latitude: 28.6315, longitude: 77.2167, elevationMeters: 216 },
    estimatedPeakDemandMW: 32.5,
    inferredFeederSubstationId: 'geo-power-sub-del-02',
    isCriticalPowerCustomer: false,
    heightMeters: 24,
    floorCount: 6,
    parentId: 'city-delhi',
    provenance: DEMO_PROVENANCE_SYNTHETIC,
  },
  {
    id: 'bldg-del-sec-02',
    name: 'Delhi State Secretariat Complex (Modeled)',
    entityType: 'BUILDING',
    scaleLevel: 'BUILDING_INFRASTRUCTURE',
    usageType: 'GOVERNMENT',
    coordinates: { latitude: 28.6271, longitude: 77.2475, elevationMeters: 215 },
    estimatedPeakDemandMW: 14.8,
    inferredFeederSubstationId: 'geo-power-sub-del-02',
    isCriticalPowerCustomer: true,
    heightMeters: 42,
    floorCount: 10,
    parentId: 'city-delhi',
    provenance: DEMO_PROVENANCE_SYNTHETIC,
  },
  {
    id: 'bldg-del-pragati-03',
    name: 'Pragati Maidan Convention Center (Modeled)',
    entityType: 'BUILDING',
    scaleLevel: 'BUILDING_INFRASTRUCTURE',
    usageType: 'COMMERCIAL',
    coordinates: { latitude: 28.6186, longitude: 77.2427, elevationMeters: 214 },
    estimatedPeakDemandMW: 26.0,
    inferredFeederSubstationId: 'geo-power-sub-del-02',
    isCriticalPowerCustomer: false,
    heightMeters: 35,
    floorCount: 7,
    parentId: 'city-delhi',
    provenance: DEMO_PROVENANCE_SYNTHETIC,
  },
  {
    id: 'bldg-del-nehru-04',
    name: 'Nehru Place Commercial IT Hub (Modeled)',
    entityType: 'BUILDING',
    scaleLevel: 'BUILDING_INFRASTRUCTURE',
    usageType: 'COMMERCIAL',
    coordinates: { latitude: 28.5492, longitude: 77.2525, elevationMeters: 220 },
    estimatedPeakDemandMW: 28.4,
    inferredFeederSubstationId: 'geo-power-sub-del-03',
    isCriticalPowerCustomer: false,
    heightMeters: 55,
    floorCount: 14,
    parentId: 'city-delhi',
    provenance: DEMO_PROVENANCE_SYNTHETIC,
  },
  {
    id: 'bldg-del-dwarka-05',
    name: 'Dwarka Residential Sector 10 Cluster (Modeled)',
    entityType: 'BUILDING',
    scaleLevel: 'BUILDING_INFRASTRUCTURE',
    usageType: 'RESIDENTIAL',
    coordinates: { latitude: 28.5823, longitude: 77.0504, elevationMeters: 218 },
    estimatedPeakDemandMW: 18.2,
    inferredFeederSubstationId: 'geo-power-sub-del-03',
    isCriticalPowerCustomer: false,
    heightMeters: 30,
    floorCount: 10,
    parentId: 'city-delhi',
    provenance: DEMO_PROVENANCE_SYNTHETIC,
  },
];

const DELHI_CRITICAL_INFRA: CriticalInfrastructure[] = [
  {
    id: 'infra-del-aiims',
    name: 'AIIMS Apex Healthcare Institute (Modeled)',
    entityType: 'CRITICAL_INFRASTRUCTURE',
    scaleLevel: 'BUILDING_INFRASTRUCTURE',
    infraType: 'HOSPITAL',
    coordinates: { latitude: 28.5672, longitude: 77.21, elevationMeters: 222 },
    emergencyBackupGenerationMW: 12.0,
    requiresDualFeed: true,
    priorityTier: 'TIER_1_LIFE_SAFETY',
    servedBySubstationId: 'geo-power-sub-del-02',
    parentId: 'city-delhi',
    provenance: DEMO_PROVENANCE_SYNTHETIC,
  },
  {
    id: 'infra-del-igi',
    name: 'Indira Gandhi International Airport T3 (Modeled)',
    entityType: 'CRITICAL_INFRASTRUCTURE',
    scaleLevel: 'BUILDING_INFRASTRUCTURE',
    infraType: 'AIRPORT',
    coordinates: { latitude: 28.5562, longitude: 77.1, elevationMeters: 237 },
    emergencyBackupGenerationMW: 25.0,
    requiresDualFeed: true,
    priorityTier: 'TIER_2_CIVIL_OPERATIONS',
    servedBySubstationId: 'geo-power-sub-del-03',
    parentId: 'city-delhi',
    provenance: DEMO_PROVENANCE_SYNTHETIC,
  },
  {
    id: 'infra-del-wazirabad',
    name: 'Wazirabad Primary Water Treatment Plant (Modeled)',
    entityType: 'CRITICAL_INFRASTRUCTURE',
    scaleLevel: 'BUILDING_INFRASTRUCTURE',
    infraType: 'WATER_TREATMENT',
    coordinates: { latitude: 28.7128, longitude: 77.2289, elevationMeters: 208 },
    emergencyBackupGenerationMW: 8.5,
    requiresDualFeed: true,
    priorityTier: 'TIER_1_LIFE_SAFETY',
    servedBySubstationId: 'geo-power-sub-del-01',
    parentId: 'city-delhi',
    provenance: DEMO_PROVENANCE_SYNTHETIC,
  },
  {
    id: 'infra-del-metro-hub',
    name: 'Delhi Metro Central Operations Center (Modeled)',
    entityType: 'CRITICAL_INFRASTRUCTURE',
    scaleLevel: 'BUILDING_INFRASTRUCTURE',
    infraType: 'METRO_TRANSIT',
    coordinates: { latitude: 28.6258, longitude: 77.2185, elevationMeters: 216 },
    emergencyBackupGenerationMW: 15.0,
    requiresDualFeed: true,
    priorityTier: 'TIER_2_CIVIL_OPERATIONS',
    servedBySubstationId: 'geo-power-sub-del-02',
    parentId: 'city-delhi',
    provenance: DEMO_PROVENANCE_SYNTHETIC,
  },
];

const DELHI_POWER_ASSETS: GeoPowerAsset[] = [
  {
    id: 'geo-power-sub-del-01',
    name: 'Badarpur 400kV Grid Substation (Modeled)',
    entityType: 'SUBSTATION',
    scaleLevel: 'SITE',
    electricalAssetId: 'sub-trans-01',
    electricalAssetType: 'substation',
    category: 'TRANSMISSION_SUBSTATION',
    coordinates: { latitude: 28.5039, longitude: 77.3061, elevationMeters: 210 },
    voltageKV: 400,
    nominalCapacityMW: 600,
    provenance: DEMO_PROVENANCE_SYNTHETIC,
    isSurveyVerified: false,
  },
  {
    id: 'geo-power-sub-del-02',
    name: 'Indraprastha 66kV Distribution Substation (Modeled)',
    entityType: 'SUBSTATION',
    scaleLevel: 'SITE',
    electricalAssetId: 'sub-dist-01',
    electricalAssetType: 'substation',
    category: 'DISTRIBUTION_SUBSTATION',
    coordinates: { latitude: 28.6186, longitude: 77.251, elevationMeters: 213 },
    voltageKV: 66,
    nominalCapacityMW: 120,
    provenance: DEMO_PROVENANCE_SYNTHETIC,
    isSurveyVerified: false,
  },
  {
    id: 'geo-power-sub-del-03',
    name: 'Palam 66kV Distribution Substation (Modeled)',
    entityType: 'SUBSTATION',
    scaleLevel: 'SITE',
    electricalAssetId: 'sub-dist-02',
    electricalAssetType: 'substation',
    category: 'DISTRIBUTION_SUBSTATION',
    coordinates: { latitude: 28.5843, longitude: 77.0818, elevationMeters: 225 },
    voltageKV: 66,
    nominalCapacityMW: 100,
    provenance: DEMO_PROVENANCE_SYNTHETIC,
    isSurveyVerified: false,
  },
  {
    id: 'geo-power-gen-del-01',
    name: 'Pragati Combined Cycle Power Hub (Modeled)',
    entityType: 'POWER_STATION',
    scaleLevel: 'SITE',
    electricalAssetId: 'gen-thermal-01',
    electricalAssetType: 'generator',
    category: 'GENERATOR',
    coordinates: { latitude: 28.6145, longitude: 77.258, elevationMeters: 212 },
    voltageKV: 220,
    nominalCapacityMW: 330,
    provenance: DEMO_PROVENANCE_SYNTHETIC,
    isSurveyVerified: false,
  },
  {
    id: 'geo-power-line-del-01',
    name: 'Badarpur — Indraprastha 220kV Ring Line (Modeled)',
    entityType: 'LINE_CORRIDOR',
    scaleLevel: 'SITE',
    electricalAssetId: 'line-01',
    electricalAssetType: 'transmission_line',
    category: 'TRANSMISSION_LINE',
    coordinates: { latitude: 28.5612, longitude: 77.2785, elevationMeters: 211 },
    pathCoordinates: [
      { latitude: 28.5039, longitude: 77.3061 },
      { latitude: 28.5612, longitude: 77.2785 },
      { latitude: 28.6186, longitude: 77.251 },
    ],
    voltageKV: 220,
    nominalCapacityMW: 250,
    provenance: DEMO_PROVENANCE_SYNTHETIC,
    isSurveyVerified: false,
  },
];

const DELHI_SPATIAL_RELATIONSHIPS: GeoRelationship[] = [
  {
    id: 'rel-geo-del-01',
    sourceEntityId: 'city-delhi',
    targetEntityId: 'bldg-del-cp-01',
    relationType: 'CONTAINS',
    provenance: DEMO_PROVENANCE_SYNTHETIC,
  },
  {
    id: 'rel-geo-del-02',
    sourceEntityId: 'city-delhi',
    targetEntityId: 'infra-del-aiims',
    relationType: 'CONTAINS',
    provenance: DEMO_PROVENANCE_SYNTHETIC,
  },
  {
    id: 'rel-geo-del-03',
    sourceEntityId: 'bldg-del-cp-01',
    targetEntityId: 'infra-del-metro-hub',
    relationType: 'PROXIMATE_TO',
    distanceMeters: 650,
    provenance: DEMO_PROVENANCE_SYNTHETIC,
  },
];

const DELHI_ELECTRICAL_RELATIONSHIPS: ElectricalRelationship[] = [
  {
    id: 'rel-elec-del-01',
    fromElectricalAssetId: 'sub-trans-01',
    toElectricalAssetId: 'sub-dist-01',
    relationType: 'TRANSMITS_TO',
    voltageLevelKV: 220,
    provenance: DEMO_PROVENANCE_SYNTHETIC,
    isTopologicallyVerified: false,
  },
  {
    id: 'rel-elec-del-02',
    fromElectricalAssetId: 'sub-dist-01',
    toElectricalAssetId: 'load-01',
    relationType: 'FEEDS_LOAD',
    voltageLevelKV: 11,
    provenance: DEMO_PROVENANCE_SYNTHETIC,
    isTopologicallyVerified: false,
  },
];

// ─── Deterministic Provider Implementation ──────────────────────────

export class DeterministicGeoDataProvider implements IGeoDataProvider {
  public readonly providerId = 'deterministic-offline-provider';
  public readonly providerName = 'VAJRA Deterministic Offline Geo Provider';
  public readonly isOfflineCapable = true;

  public async searchCities(query: string): Promise<CitySearchResult[]> {
    const q = query.trim().toLowerCase();
    const matches: CitySearchResult[] = [];

    for (const city of Object.values(DEMO_CITIES)) {
      if (
        city.name.toLowerCase().includes(q) ||
        city.stateOrProvince.toLowerCase().includes(q) ||
        city.id.toLowerCase().includes(q)
      ) {
        matches.push({
          cityId: city.id,
          displayName: city.name,
          stateOrProvince: city.stateOrProvince,
          countryCode: city.countryCode,
          centerCoordinates: city.centerCoordinates,
          boundingBox: city.boundingBox,
          availableEntityCount: city.id === 'city-delhi' ? 14 : 2,
          provenanceType: city.provenance.sourceType,
        });
      }
    }

    return matches;
  }

  public async resolveCity(cityId: string): Promise<City | null> {
    return DEMO_CITIES[cityId] ?? null;
  }

  public async loadCityTwin(cityId: string): Promise<CityTwinPackage | null> {
    const city = DEMO_CITIES[cityId];
    if (!city) return null;

    if (cityId === 'city-delhi') {
      return {
        city,
        buildings: DELHI_BUILDINGS,
        criticalInfrastructure: DELHI_CRITICAL_INFRA,
        powerAssets: DELHI_POWER_ASSETS,
        spatialRelationships: DELHI_SPATIAL_RELATIONSHIPS,
        electricalRelationships: DELHI_ELECTRICAL_RELATIONSHIPS,
        provenanceSummary: {
          verifiedCount: 0,
          modeledCount: 1, // the city boundary
          syntheticCount:
            DELHI_BUILDINGS.length +
            DELHI_CRITICAL_INFRA.length +
            DELHI_POWER_ASSETS.length +
            DELHI_SPATIAL_RELATIONSHIPS.length +
            DELHI_ELECTRICAL_RELATIONSHIPS.length,
          userDefinedCount: 0,
        },
      };
    }

    // Default basic package for other demo cities
    return {
      city,
      buildings: [],
      criticalInfrastructure: [],
      powerAssets: [],
      spatialRelationships: [],
      electricalRelationships: [],
      provenanceSummary: {
        verifiedCount: 0,
        modeledCount: 1,
        syntheticCount: 0,
        userDefinedCount: 0,
      },
    };
  }

  public async loadBuildings(cityId: string, bounds?: GeoBoundingBox): Promise<Building[]> {
    if (cityId === 'city-delhi') {
      if (!bounds) return DELHI_BUILDINGS;
      return DELHI_BUILDINGS.filter((b) => isCoordinateInBoundingBox(b.coordinates, bounds));
    }
    return [];
  }

  public async loadCriticalInfrastructure(cityId: string): Promise<CriticalInfrastructure[]> {
    if (cityId === 'city-delhi') return DELHI_CRITICAL_INFRA;
    return [];
  }

  public async loadPowerInfrastructure(cityId: string): Promise<GeoPowerAsset[]> {
    if (cityId === 'city-delhi') return DELHI_POWER_ASSETS;
    return [];
  }
}
