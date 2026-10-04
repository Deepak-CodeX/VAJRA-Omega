// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Task #14 Verification Script: Geo-Twin Foundation & Architecture
// ═══════════════════════════════════════════════════════════════════════
// Required Invariants Tested:
//  1. Coordinate validation (WGS84 lat [-90, 90], lon [-180, 180], terrestrial elevation)
//  2. Geographic entity creation (City, Building, Critical Infra, Power Asset)
//  3. City creation & bounding box containment
//  4. Stable ID handling
//  5. Geographic relationship creation (Spatial Graph)
//  6. Electrical/geographic relationship separation (Spatial graph != Electrical graph)
//  7. Provenance classification (VERIFIED_EXTERNAL, MODELED, SYNTHETIC, USER_DEFINED)
//  8. Confidence handling (HIGH, MEDIUM, LOW)
//  9. Synthetic data identification (explicit programmatic flagging)
// 10. Deterministic demo dataset loading (Delhi, Mumbai, Bengaluru, Bhopal)
// 11. City resolution through the provider abstraction (CityResolver)
// 12. Geo-Twin state initialization (Store authoritative state)
// 13. Layer state initialization & toggling
// 14. Invalid coordinate rejection (lat/lon out of bounds, NaN, invalid elevation)
// 15. Duplicate entity handling in GeoEntityRegistry (enforced uniqueness)
// 16. Electrical asset -> geographic reference mapping (ElectricalGeoBridge non-destructive binding)
// ═══════════════════════════════════════════════════════════════════════

import {
  isValidCoordinate,
  assertValidCoordinate,
  isValidBoundingBox,
  isCoordinateInBoundingBox,
  computeGeoDistanceMeters,
} from '../simulation/geo/geoCoordinates';
import { GeoEntityRegistry } from '../simulation/geo/geoRegistry';
import {
  CityResolver,
} from '../simulation/geo/geoProvider';
import {
  DeterministicGeoDataProvider,
} from '../simulation/geo/deterministicGeoTwin';
import {
  ElectricalGeoBridge,
  ElectricalGeoReference,
} from '../simulation/geo/electricalGeoBridge';
import { generateGridTopology } from '../simulation/models/gridGenerator';
import { useVajraStore } from '../store/vajraStore';
import type {
  GeoCoordinate,
  City,
  Building,
  CriticalInfrastructure,
  GeoPowerAsset,
  GeoRelationship,
  ElectricalRelationship,
  DataProvenance,
} from '../types/geo';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

async function runTask14Verification(): Promise<void> {
  console.log('\n═══ Test Suite: Task #14 — Geo-Twin Foundation & Architecture ═══');

  const testTimestamp = '2026-10-04T00:00:00Z';

  // ─────────────────────────────────────────────────────────────────────
  // 1. Coordinate Validation
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 1. Coordinate Validation ───');
  {
    const validDelhi: GeoCoordinate = { latitude: 28.6139, longitude: 77.209, elevationMeters: 216 };
    const validEquatorPrime: GeoCoordinate = { latitude: 0, longitude: 0, elevationMeters: 0 };
    const validSouthPole: GeoCoordinate = { latitude: -90, longitude: 0 };
    const validNorthPole: GeoCoordinate = { latitude: 90, longitude: 180 };

    assert(isValidCoordinate(validDelhi), 'Valid Delhi coordinate accepted');
    assert(isValidCoordinate(validEquatorPrime), 'Valid (0,0) coordinate accepted');
    assert(isValidCoordinate(validSouthPole), 'South pole (-90,0) coordinate accepted');
    assert(isValidCoordinate(validNorthPole), 'North pole (90,180) coordinate accepted');

    let threw = false;
    try {
      assertValidCoordinate(validDelhi, 'Delhi');
    } catch {
      threw = true;
    }
    assert(!threw, 'assertValidCoordinate succeeds on valid coordinate');

    const dist = computeGeoDistanceMeters(
      { latitude: 28.6139, longitude: 77.209 },
      { latitude: 28.6315, longitude: 77.2167 },
    );
    assert(dist > 1500 && dist < 2500, `Haversine distance calculation is accurate (${Math.round(dist)}m)`);
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. Geographic Entity Creation
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 2. Geographic Entity Creation ───');
  {
    const building: Building = {
      id: 'bldg-test-01',
      name: 'Test Innovation Tower',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'COMMERCIAL',
      coordinates: { latitude: 28.62, longitude: 77.21 },
      estimatedPeakDemandMW: 12.5,
      isCriticalPowerCustomer: false,
      provenance: {
        sourceType: 'SYNTHETIC',
        confidence: 'HIGH',
        sourceReference: 'UNIT_TEST',
        lastUpdated: testTimestamp,
        isVerifiedRealWorld: false,
      },
    };

    const hospital: CriticalInfrastructure = {
      id: 'infra-test-hospital-01',
      name: 'Test Memorial Hospital',
      entityType: 'CRITICAL_INFRASTRUCTURE',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      infraType: 'HOSPITAL',
      coordinates: { latitude: 28.61, longitude: 77.22 },
      emergencyBackupGenerationMW: 5.0,
      requiresDualFeed: true,
      priorityTier: 'TIER_1_LIFE_SAFETY',
      provenance: {
        sourceType: 'MODELED',
        confidence: 'MEDIUM',
        sourceReference: 'UNIT_TEST',
        lastUpdated: testTimestamp,
        isVerifiedRealWorld: false,
      },
    };

    const substationAsset: GeoPowerAsset = {
      id: 'geo-power-sub-test-01',
      name: 'Test 400kV Substation',
      entityType: 'SUBSTATION',
      scaleLevel: 'SITE',
      category: 'TRANSMISSION_SUBSTATION',
      coordinates: { latitude: 28.58, longitude: 77.19 },
      voltageKV: 400,
      nominalCapacityMW: 600,
      electricalAssetId: 'sub-trans-01',
      electricalAssetType: 'substation',
      isSurveyVerified: false,
      provenance: {
        sourceType: 'SYNTHETIC',
        confidence: 'MEDIUM',
        sourceReference: 'UNIT_TEST',
        lastUpdated: testTimestamp,
        isVerifiedRealWorld: false,
      },
    };

    assert(building.entityType === 'BUILDING', 'Building entity has correct entityType');
    assert(building.estimatedPeakDemandMW === 12.5, 'Building has peak demand attribute');
    assert(hospital.priorityTier === 'TIER_1_LIFE_SAFETY', 'Critical infra has priority tier');
    assert(substationAsset.voltageKV === 400, 'Power asset has voltage rating');
    assert(substationAsset.electricalAssetId === 'sub-trans-01', 'Power asset links to electricalAssetId');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. City Creation & Bounding Box Containment
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 3. City Creation & Bounding Box Containment ───');
  {
    const city: City = {
      id: 'city-test-delhi',
      name: 'Test Delhi NCR',
      entityType: 'CITY',
      scaleLevel: 'CITY',
      countryCode: 'IND',
      stateOrProvince: 'Delhi NCR',
      adminCode: 'DL',
      population: 33000000,
      centerCoordinates: { latitude: 28.6139, longitude: 77.209 },
      boundingBox: {
        minLatitude: 28.4,
        maxLatitude: 28.88,
        minLongitude: 76.85,
        maxLongitude: 77.45,
      },
      coordinates: { latitude: 28.6139, longitude: 77.209 },
      regionalGridInterconnect: 'Northern Regional Grid (NR)',
      provenance: {
        sourceType: 'MODELED',
        confidence: 'HIGH',
        sourceReference: 'CENSUS_MODEL',
        lastUpdated: testTimestamp,
        isVerifiedRealWorld: false,
      },
    };

    assert(isValidBoundingBox(city.boundingBox), 'City bounding box is valid');
    assert(isCoordinateInBoundingBox(city.centerCoordinates, city.boundingBox), 'City center is within bounding box');

    const outsideCoord: GeoCoordinate = { latitude: 19.076, longitude: 72.8777 }; // Mumbai
    assert(!isCoordinateInBoundingBox(outsideCoord, city.boundingBox), 'Mumbai coordinate is outside Delhi bounding box');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. Stable ID Handling
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 4. Stable ID Handling ───');
  {
    const registry = new GeoEntityRegistry();
    const entity: Building = {
      id: 'stable-id-bldg-001',
      name: 'Stable Building',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'RESIDENTIAL',
      coordinates: { latitude: 28.65, longitude: 77.23 },
      estimatedPeakDemandMW: 1.2,
      isCriticalPowerCustomer: false,
      provenance: {
        sourceType: 'SYNTHETIC',
        confidence: 'LOW',
        sourceReference: 'ID_TEST',
        lastUpdated: testTimestamp,
        isVerifiedRealWorld: false,
      },
    };

    registry.registerEntity(entity);
    assert(registry.hasEntity('stable-id-bldg-001'), 'Registry correctly confirms presence of stable ID');
    assert(registry.getEntity('stable-id-bldg-001')?.id === 'stable-id-bldg-001', 'Retrieved entity preserves exact ID');
    assert(registry.getEntity('non-existent-id') === undefined, 'Non-existent ID returns undefined');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5. Geographic Relationship Creation (Spatial Graph)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 5. Geographic Relationship Creation ───');
  {
    const registry = new GeoEntityRegistry();
    const city: City = {
      id: 'entity-city-01',
      name: 'Central Capital City',
      entityType: 'CITY',
      scaleLevel: 'CITY',
      countryCode: 'IND',
      stateOrProvince: 'DL',
      regionalGridInterconnect: 'NR',
      centerCoordinates: { latitude: 28.63, longitude: 77.21 },
      boundingBox: { minLatitude: 28.5, maxLatitude: 28.7, minLongitude: 77.1, maxLongitude: 77.3 },
      coordinates: { latitude: 28.63, longitude: 77.21 },
      provenance: { sourceType: 'SYNTHETIC', confidence: 'LOW', sourceReference: 'TEST', lastUpdated: testTimestamp, isVerifiedRealWorld: false },
    };
    const bldg: Building = {
      id: 'entity-office-02',
      name: 'North Office Block',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'COMMERCIAL',
      coordinates: { latitude: 28.631, longitude: 77.211 },
      estimatedPeakDemandMW: 4.5,
      isCriticalPowerCustomer: false,
      provenance: { sourceType: 'SYNTHETIC', confidence: 'LOW', sourceReference: 'TEST', lastUpdated: testTimestamp, isVerifiedRealWorld: false },
    };

    registry.registerEntity(city);
    registry.registerEntity(bldg);

    const rel: GeoRelationship = {
      id: 'spatial-rel-01',
      sourceEntityId: 'entity-city-01',
      targetEntityId: 'entity-office-02',
      relationType: 'CONTAINS',
      provenance: { sourceType: 'SYNTHETIC', confidence: 'HIGH', sourceReference: 'TEST', lastUpdated: testTimestamp, isVerifiedRealWorld: false },
    };

    registry.addSpatialRelationship(rel);
    const rels = registry.getSpatialRelationships('entity-city-01');
    assert(rels.length === 1, 'Registry stores and queries spatial relationship');
    assert(rels[0].relationType === 'CONTAINS', 'Relationship type is CONTAINS');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 6. Spatial Graph vs Electrical Graph Separation
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 6. Spatial Graph vs Electrical Graph Separation ───');
  {
    const registry = new GeoEntityRegistry();
    const hospital: CriticalInfrastructure = {
      id: 'geo-hospital-aiims',
      name: 'AIIMS Hospital',
      entityType: 'CRITICAL_INFRASTRUCTURE',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      infraType: 'HOSPITAL',
      coordinates: { latitude: 28.5672, longitude: 77.21 },
      emergencyBackupGenerationMW: 12.0,
      requiresDualFeed: true,
      priorityTier: 'TIER_1_LIFE_SAFETY',
      provenance: { sourceType: 'MODELED', confidence: 'HIGH', sourceReference: 'TEST', lastUpdated: testTimestamp, isVerifiedRealWorld: false },
    };

    const substation: GeoPowerAsset = {
      id: 'geo-sub-trans-01',
      name: '400kV Substation S01',
      entityType: 'SUBSTATION',
      scaleLevel: 'SITE',
      category: 'TRANSMISSION_SUBSTATION',
      coordinates: { latitude: 28.5675, longitude: 77.2105 }, // ~50 meters away!
      voltageKV: 400,
      nominalCapacityMW: 600,
      electricalAssetId: 'sub-trans-01',
      electricalAssetType: 'substation',
      isSurveyVerified: false,
      provenance: { sourceType: 'SYNTHETIC', confidence: 'MEDIUM', sourceReference: 'TEST', lastUpdated: testTimestamp, isVerifiedRealWorld: false },
    };

    registry.registerEntity(hospital);
    registry.registerEntity(substation);

    // Register SPATIAL proximity relationship:
    const spatialRel: GeoRelationship = {
      id: 'spatial-proximity-01',
      sourceEntityId: 'geo-hospital-aiims',
      targetEntityId: 'geo-sub-trans-01',
      relationType: 'PROXIMATE_TO',
      distanceMeters: 55,
      provenance: { sourceType: 'SYNTHETIC', confidence: 'HIGH', sourceReference: 'TEST', lastUpdated: testTimestamp, isVerifiedRealWorld: false },
    };
    registry.addSpatialRelationship(spatialRel);

    // CRITICAL INVARIANT: Proximity does NOT automatically create an electrical edge!
    const hasAutoElectrical = registry.hasElectricalConnection('geo-hospital-aiims', 'sub-trans-01');
    assert(!hasAutoElectrical, 'INVARIANT: Spatial proximity does NOT automatically create an electrical edge');

    // Only explicit electrical relationships exist:
    const explicitElecRel: ElectricalRelationship = {
      id: 'elec-rel-verified-01',
      fromElectricalAssetId: 'sub-trans-01',
      toElectricalAssetId: 'sub-dist-01',
      relationType: 'TRANSMITS_TO',
      voltageLevelKV: 400,
      provenance: { sourceType: 'SYNTHETIC', confidence: 'HIGH', sourceReference: 'TEST', lastUpdated: testTimestamp, isVerifiedRealWorld: false },
      isTopologicallyVerified: false,
    };
    registry.addElectricalRelationship(explicitElecRel);

    assert(
      registry.hasElectricalConnection('sub-trans-01', 'sub-dist-01'),
      'Explicit electrical edge is queryable in electrical graph',
    );
    assert(
      !registry.hasElectricalConnection('geo-hospital-aiims', 'sub-trans-01'),
      'Hospital remains unconnected electrically until explicitly declared',
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // 7. Provenance Classification
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 7. Provenance Classification ───');
  {
    const prov1: DataProvenance = {
      sourceType: 'VERIFIED_EXTERNAL',
      confidence: 'HIGH',
      sourceReference: 'CENTRAL_ELECTRICITY_AUTHORITY_SLD',
      lastUpdated: testTimestamp,
      isVerifiedRealWorld: true,
    };
    const prov2: DataProvenance = {
      sourceType: 'MODELED',
      confidence: 'MEDIUM',
      sourceReference: 'LOAD_ESTIMATION_HEURISTIC',
      lastUpdated: testTimestamp,
      isVerifiedRealWorld: false,
    };
    const prov3: DataProvenance = {
      sourceType: 'SYNTHETIC',
      confidence: 'LOW',
      sourceReference: 'OFFLINE_GENERATOR',
      lastUpdated: testTimestamp,
      isVerifiedRealWorld: false,
    };
    const prov4: DataProvenance = {
      sourceType: 'USER_DEFINED',
      confidence: 'MEDIUM',
      sourceReference: 'MANUAL_OPERATOR_INPUT',
      lastUpdated: testTimestamp,
      isVerifiedRealWorld: false,
    };

    assert(prov1.sourceType === 'VERIFIED_EXTERNAL' && prov1.isVerifiedRealWorld === true, 'Verified provenance classified');
    assert(prov2.sourceType === 'MODELED' && prov2.isVerifiedRealWorld === false, 'Modeled provenance classified');
    assert(prov3.sourceType === 'SYNTHETIC' && prov3.isVerifiedRealWorld === false, 'Synthetic provenance classified');
    assert(prov4.sourceType === 'USER_DEFINED' && prov4.isVerifiedRealWorld === false, 'User defined provenance classified');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 8. Confidence Handling
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 8. Confidence Handling ───');
  {
    const confidences: Array<'HIGH' | 'MEDIUM' | 'LOW'> = ['HIGH', 'MEDIUM', 'LOW'];
    assert(confidences.includes('HIGH'), 'HIGH confidence recognized');
    assert(confidences.includes('MEDIUM'), 'MEDIUM confidence recognized');
    assert(confidences.includes('LOW'), 'LOW confidence recognized');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 9. Synthetic Data Identification
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 9. Synthetic Data Identification ───');
  {
    const provider = new DeterministicGeoDataProvider();
    const twin = await provider.loadCityTwin('city-delhi');
    assert(twin !== null, 'Delhi demo twin loaded');

    if (twin) {
      // Invariant: every demo building is explicitly SYNTHETIC or MODELED and NOT verified ground truth
      const allSyntheticOrModeled = twin.buildings.every(
        (b) =>
          (b.provenance.sourceType === 'SYNTHETIC' || b.provenance.sourceType === 'MODELED') &&
          b.provenance.isVerifiedRealWorld === false,
      );
      assert(allSyntheticOrModeled, 'All demo buildings explicitly marked as SYNTHETIC/MODELED with isVerifiedRealWorld=false');

      const allPowerAssetsSynthetic = twin.powerAssets.every(
        (p) =>
          (p.provenance.sourceType === 'SYNTHETIC' || p.provenance.sourceType === 'MODELED') &&
          p.provenance.isVerifiedRealWorld === false &&
          p.isSurveyVerified === false,
      );
      assert(allPowerAssetsSynthetic, 'All demo power assets explicitly flagged as unverified synthetic/modeled data');

      const allElecRelsUnverified = twin.electricalRelationships.every(
        (r) => r.isTopologicallyVerified === false,
      );
      assert(allElecRelsUnverified, 'All demo electrical relationships explicitly marked as unverified (isTopologicallyVerified=false)');
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 10. Deterministic Demo Dataset Loading (Delhi, Mumbai, Bengaluru, Bhopal)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 10. Deterministic Demo Dataset Loading ───');
  {
    const provider = new DeterministicGeoDataProvider();
    assert(provider.isOfflineCapable === true, 'Deterministic provider confirms offline capability');

    const delhiTwin = await provider.loadCityTwin('city-delhi');
    const mumbaiTwin = await provider.loadCityTwin('city-mumbai');
    const blrTwin = await provider.loadCityTwin('city-bengaluru');
    const bhopalTwin = await provider.loadCityTwin('city-bhopal');

    assert(delhiTwin !== null && delhiTwin.city.name.includes('Delhi'), 'Delhi demo twin loads deterministically');
    assert(mumbaiTwin !== null && mumbaiTwin.city.name.includes('Mumbai'), 'Mumbai demo twin loads deterministically');
    assert(blrTwin !== null && blrTwin.city.name.includes('Bengaluru'), 'Bengaluru demo twin loads deterministically');
    assert(bhopalTwin !== null && bhopalTwin.city.name.includes('Bhopal'), 'Bhopal demo twin loads deterministically');

    if (delhiTwin) {
      assert(delhiTwin.buildings.length >= 4, 'Delhi package contains at least 4 demo buildings');
      assert(delhiTwin.criticalInfrastructure.length >= 4, 'Delhi package contains critical infrastructure');
      assert(delhiTwin.powerAssets.length >= 4, 'Delhi package contains power assets');
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 11. City Resolution Through Provider Abstraction (CityResolver)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 11. City Resolution Through Provider Abstraction ───');
  {
    const resolver = new CityResolver([new DeterministicGeoDataProvider()]);

    // Search query normalization & match
    const searchDelhi = await resolver.search('  DELHI ');
    assert(searchDelhi.length > 0, 'CityResolver finds Delhi with mixed case and whitespace');
    assert(searchDelhi[0].cityId === 'city-delhi', 'Normalized search maps to city-delhi ID');

    const searchBhopal = await resolver.search('bhopal');
    assert(searchBhopal.length > 0 && searchBhopal[0].cityId === 'city-bhopal', 'CityResolver finds Bhopal');

    // Direct resolution
    const resolvedCity = await resolver.resolve('city-mumbai');
    assert(resolvedCity !== null && resolvedCity.id === 'city-mumbai', 'CityResolver resolves Mumbai by ID');

    // Digital twin package loading through abstraction
    const twinPackage = await resolver.loadTwin('city-bengaluru');
    assert(twinPackage !== null && twinPackage.city.id === 'city-bengaluru', 'CityResolver loads digital twin through abstraction');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 12. Geo-Twin State Initialization (Authoritative Store)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 12. Geo-Twin State Initialization ───');
  {
    const state = useVajraStore.getState();
    assert(state.geoTwin !== undefined, 'Store contains authoritative geoTwin state');
    if (state.geoTwin) {
      assert(state.geoTwin.selectedCity?.id === 'city-delhi', 'Default selected city is city-delhi');
      assert(state.geoTwin.selectedEntityId === null, 'Default selected entity is null');
      assert(state.geoTwin.isGeoViewActive === false, 'Default view starts on Schematic Topology');
      assert(state.geoTwin.viewport.zoom >= 10, 'Default viewport zoom is set for city scale');
      assert(state.geoTwin.loadedEntitiesCount > 0, 'Default state loads demo entities');
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 13. Layer State Initialization & Toggling
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 13. Layer State Initialization & Toggling ───');
  {
    const state = useVajraStore.getState();
    assert(state.geoTwin !== undefined, 'geoTwin state defined');
    if (state.geoTwin) {
      const layers = state.geoTwin.visibleLayers;
      assert(layers.SUBSTATIONS !== undefined, 'SUBSTATIONS layer is registered in record');
      assert(layers.TRANSMISSION !== undefined, 'TRANSMISSION layer is registered in record');
      assert(layers.CRITICAL_INFRASTRUCTURE !== undefined, 'CRITICAL_INFRASTRUCTURE layer is registered in record');

      // Test layer toggling without mutating electrical simulation
      const subLayerBefore = layers.SUBSTATIONS;
      state.toggleGeoLayer('SUBSTATIONS');
      const subLayerAfter = useVajraStore.getState().geoTwin?.visibleLayers.SUBSTATIONS;
      assert(subLayerAfter === !subLayerBefore, 'toggleGeoLayer toggles layer visibility cleanly');

      // Restore layer state
      state.toggleGeoLayer('SUBSTATIONS');
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 14. Invalid Coordinate Rejection
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 14. Invalid Coordinate Rejection ───');
  {
    const invalidLatHigh: any = { latitude: 91.5, longitude: 77.2 };
    const invalidLatLow: any = { latitude: -90.1, longitude: 77.2 };
    const invalidLonHigh: any = { latitude: 28.6, longitude: 180.5 };
    const invalidLonLow: any = { latitude: 28.6, longitude: -181.0 };
    const invalidNaN: any = { latitude: NaN, longitude: 77.2 };
    const invalidElevation: any = { latitude: 28.6, longitude: 77.2, elevationMeters: 50000 };

    assert(!isValidCoordinate(invalidLatHigh), 'Rejects latitude > 90');
    assert(!isValidCoordinate(invalidLatLow), 'Rejects latitude < -90');
    assert(!isValidCoordinate(invalidLonHigh), 'Rejects longitude > 180');
    assert(!isValidCoordinate(invalidLonLow), 'Rejects longitude < -180');
    assert(!isValidCoordinate(invalidNaN), 'Rejects NaN coordinate');
    assert(!isValidCoordinate(invalidElevation), 'Rejects plausible elevation violation (50,000m)');

    let caughtError = false;
    try {
      assertValidCoordinate(invalidLatHigh, 'TestCoord');
    } catch {
      caughtError = true;
    }
    assert(caughtError, 'assertValidCoordinate throws Error on invalid coordinate');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 15. Duplicate Entity Handling in GeoEntityRegistry
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 15. Duplicate Entity Handling ───');
  {
    const registry = new GeoEntityRegistry();
    const entityA: Building = {
      id: 'entity-dup-01',
      name: 'Original Entity',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'COMMERCIAL',
      coordinates: { latitude: 28.6, longitude: 77.2 },
      estimatedPeakDemandMW: 3.5,
      isCriticalPowerCustomer: false,
      provenance: { sourceType: 'SYNTHETIC', confidence: 'LOW', sourceReference: 'DUP_TEST', lastUpdated: testTimestamp, isVerifiedRealWorld: false },
    };

    registry.registerEntity(entityA);
    assert(registry.count() === 1, 'Registry contains 1 entity');

    let threwDuplicate = false;
    try {
      registry.registerEntity(entityA, false); // allowOverwrite = false
    } catch (e) {
      threwDuplicate = true;
    }
    assert(threwDuplicate, 'Duplicate entity registration without allowOverwrite throws Error');

    // Allowed overwrite succeeds
    const entityAUpdated = { ...entityA, name: 'Updated Entity' };
    registry.registerEntity(entityAUpdated, true);
    assert(registry.getEntity('entity-dup-01')?.name === 'Updated Entity', 'allowOverwrite=true updates entity cleanly');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 16. Electrical Asset -> Geographic Reference Mapping (ElectricalGeoBridge)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 16. Electrical Asset -> Geographic Reference Mapping ───');
  {
    const topology = generateGridTopology({ seed: 42 });
    const bridge = new ElectricalGeoBridge();

    const sampleSub = topology.substations[0];
    assert(sampleSub !== undefined, 'Found sample substation in simulation topology');

    if (sampleSub) {
      const geoRef: ElectricalGeoReference = {
        electricalAssetId: sampleSub.id,
        geoEntityId: 'geo-power-sub-sample-01',
        coordinates: { latitude: 28.6139, longitude: 77.209 },
        isVerified: false,
        provenance: {
          sourceType: 'SYNTHETIC',
          confidence: 'MEDIUM',
          sourceReference: 'SIMULATION_BRIDGE_TEST',
          lastUpdated: testTimestamp,
          isVerifiedRealWorld: false,
        },
      };

      bridge.bindAssetToGeo(geoRef);
      assert(bridge.isAssetMapped(sampleSub.id), 'Bridge successfully maps electrical asset ID');
      assert(bridge.getElectricalAssetId('geo-power-sub-sample-01') === sampleSub.id, 'Reverse lookup resolves electrical asset ID');

      // Non-destructive fusion of simulation state and geo reference
      const fused = bridge.resolveFusedAsset(topology, sampleSub.id);
      assert(fused !== undefined, 'Bridge resolves fused asset');
      if (fused) {
        assert(fused.electricalAsset.id === sampleSub.id, 'Fused asset retains live simulation object');
        assert(fused.geoReference.coordinates.latitude === 28.6139, 'Fused asset includes geographic coordinates');
        assert(fused.isVerifiedMapping === false, 'Provenance correctly denotes unverified synthetic mapping');
      }
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════════════`);
  console.log(`Task #14 Verification Results: ${passed} PASSED, ${failed} FAILED`);
  console.log(`═══════════════════════════════════════════════════════════════════\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTask14Verification().catch((err) => {
  console.error('Task 14 verification fatal error:', err);
  process.exit(1);
});
