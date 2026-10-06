// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Phase 4.6 Geo-Twin Reality & Visual Fidelity Verification
// ═══════════════════════════════════════════════════════════════════════

import * as fs from 'fs';
import * as path from 'path';
import { VERIFIED_INDIAN_CITIES } from '../simulation/geo/verifiedIndianCities';
import { VERIFIED_CITY_BUILDINGS } from '../simulation/geo/verifiedCityBuildings';
import { RealGeoDataProvider } from '../simulation/geo/realGeoDataProvider';
import { Building3DExtruder } from '../simulation/geo/building3DExtruder';
import type { Building, DataProvenance, GeoPowerAsset } from '../types/geo';

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

export async function runPhase46RealityVerification(): Promise<void> {
  console.log('\n═══ Test Suite: Phase 4.6 — Geo-Twin Reality & Visual Fidelity Upgrade ═══\n');

  const TARGET_CITIES = [
    'city-delhi',
    'city-mumbai',
    'city-bengaluru',
    'city-chennai',
    'city-kolkata',
    'city-pune',
    'city-surat',
    'city-bhopal',
    'city-indore',
  ];

  const defaultTestProv: DataProvenance = {
    sourceType: 'MODELED',
    confidence: 'MEDIUM',
    sourceReference: 'Test Registry',
    lastUpdated: '2026-10-04T00:00:00Z',
    isVerifiedRealWorld: false,
  };

  // ─── 1. Architectural Reality & Height Provenance ──────────────────
  console.log('─── 1. Architectural Reality & Honest Height Provenance ───');

  const testSurveyBldg: Building = {
    id: 'test-survey',
    name: 'Surveyed Tower',
    entityType: 'BUILDING',
    scaleLevel: 'BUILDING_INFRASTRUCTURE',
    usageType: 'COMMERCIAL',
    coordinates: { latitude: 28.61, longitude: 77.20 },
    heightMeters: 45,
    estimatedPeakDemandMW: 10,
    isCriticalPowerCustomer: false,
    provenance: {
      sourceType: 'VERIFIED_EXTERNAL',
      confidence: 'HIGH',
      sourceReference: 'Municipal LiDAR Survey',
      lastUpdated: '2026-10-04T00:00:00Z',
      isVerifiedRealWorld: true,
    },
  };

  const surveyRes = Building3DExtruder.extractHeightWithProvenance(testSurveyBldg);
  assert(surveyRes.provenance === 'VERIFIED_SURVEY', 'Verified real-world height gets VERIFIED_SURVEY');
  assert(!surveyRes.isEstimated, 'Verified real-world height has isEstimated = false');
  assert(surveyRes.heightMeters === 45, 'Surveyed height is exactly preserved');

  const testMetadataBldg: Building = {
    id: 'test-meta',
    name: 'Metadata Tower',
    entityType: 'BUILDING',
    scaleLevel: 'BUILDING_INFRASTRUCTURE',
    usageType: 'COMMERCIAL',
    coordinates: { latitude: 28.61, longitude: 77.20 },
    heightMeters: 30,
    estimatedPeakDemandMW: 5,
    isCriticalPowerCustomer: false,
    provenance: defaultTestProv,
  };

  const metaRes = Building3DExtruder.extractHeightWithProvenance(testMetadataBldg);
  assert(metaRes.provenance === 'REAL_METADATA', 'Unverified metadata height gets REAL_METADATA');
  assert(!metaRes.isEstimated, 'Metadata height has isEstimated = false');

  const testFloorBldg: Building = {
    id: 'test-floor',
    name: 'Floor Count Complex',
    entityType: 'BUILDING',
    scaleLevel: 'BUILDING_INFRASTRUCTURE',
    usageType: 'RESIDENTIAL',
    coordinates: { latitude: 28.61, longitude: 77.20 },
    floorCount: 10,
    estimatedPeakDemandMW: 2,
    isCriticalPowerCustomer: false,
    provenance: defaultTestProv,
  };

  const floorRes = Building3DExtruder.extractHeightWithProvenance(testFloorBldg);
  assert(floorRes.provenance === 'FLOOR_COUNT_ESTIMATE', 'Floor count height gets FLOOR_COUNT_ESTIMATE');
  assert(floorRes.isEstimated === true, 'Floor count height is explicitly marked isEstimated = true');
  assert(floorRes.heightMeters === 35, 'Floor count 10 * 3.5m = 35m');

  const testTypologyBldg: Building = {
    id: 'test-type',
    name: 'Gov Complex',
    entityType: 'BUILDING',
    scaleLevel: 'BUILDING_INFRASTRUCTURE',
    usageType: 'GOVERNMENT',
    coordinates: { latitude: 28.61, longitude: 77.20 },
    estimatedPeakDemandMW: 4,
    isCriticalPowerCustomer: false,
    provenance: defaultTestProv,
  };

  const typeRes = Building3DExtruder.extractHeightWithProvenance(testTypologyBldg);
  assert(typeRes.provenance === 'USAGE_TYPE_FALLBACK', 'Typology height gets USAGE_TYPE_FALLBACK');
  assert(typeRes.isEstimated === true, 'Typology height is explicitly marked isEstimated = true');
  assert(typeRes.heightMeters === 35.0, 'Government typology defaults to 35m');

  const testGenericBldg: Building = {
    id: 'test-generic',
    name: 'Generic Structure',
    entityType: 'BUILDING',
    scaleLevel: 'BUILDING_INFRASTRUCTURE',
    usageType: 'RESIDENTIAL',
    coordinates: { latitude: 28.61, longitude: 77.20 },
    estimatedPeakDemandMW: 1,
    isCriticalPowerCustomer: false,
    provenance: defaultTestProv,
  };
  delete (testGenericBldg as any).usageType;

  const genericRes = Building3DExtruder.extractHeightWithProvenance(testGenericBldg);
  assert(genericRes.provenance === 'SYNTHETIC', 'Generic fallback height gets SYNTHETIC');
  assert(genericRes.isEstimated === true, 'Generic height is explicitly marked isEstimated = true');
  assert(genericRes.heightMeters === 15.0, 'Generic fallback height is 15.0m');

  // Verify that all registered city buildings have honest provenance
  for (const [cityId, buildings] of Object.entries(VERIFIED_CITY_BUILDINGS)) {
    for (const b of buildings) {
      const res = Building3DExtruder.extractHeightWithProvenance(b);
      if (res.isEstimated) {
        assert(
          res.provenance !== 'VERIFIED_SURVEY',
          `Building ${b.id} (${b.name}) in ${cityId}: estimated height is NOT presented as VERIFIED_SURVEY`
        );
      }
    }
  }

  // ─── 2. MapEngineAdapter Code Inspection for Phase 4.6 Upgrades ────
  console.log('\n─── 2. MapEngineAdapter 3D Visual & Geospatial Hierarchy ───');

  const adapterPath = path.join(__dirname, '../../src/simulation/geo/mapEngineAdapter.ts');
  assert(fs.existsSync(adapterPath), 'mapEngineAdapter.ts exists');
  const adapterCode = fs.readFileSync(adapterPath, 'utf8');

  // Directional Lighting
  assert(adapterCode.includes("anchor: 'map'"), 'Directional light uses geographic map anchor');
  assert(adapterCode.includes('position: [1.15, 210, 42]'), 'Directional light uses realistic sun angle [1.15, 210, 42]');
  assert(adapterCode.includes("color: '#f8fafc'"), 'Directional light uses natural daylight spectrum #f8fafc');
  assert(adapterCode.includes('intensity: 0.45'), 'Directional light intensity calibrated to 0.45');

  // Streamed 3D buildings stepped architectural palette
  assert(adapterCode.includes("'#182330'"), 'Stepped building palette includes low-rise slate graphite #182330');
  assert(adapterCode.includes("'#223042'"), 'Stepped building palette includes mid-rise dark charcoal #223042');
  assert(adapterCode.includes("'#2b3d54'"), 'Stepped building palette includes high-rise slate blue #2b3d54');
  assert(adapterCode.includes("'#384e6b'"), 'Stepped building palette includes skyscraper steel granite #384e6b');

  // Semantic zoom elevation ramps
  assert(adapterCode.includes('12.5,\n            0,\n            14.0'), 'OSM buildings smoothly ramp elevation from z=12.5 to z=14.0');
  assert(adapterCode.includes('11.0,\n          0,\n          12.5'), 'Landmark buildings smoothly ramp elevation from z=11.0 to z=12.5');

  // Transmission line voltage hierarchy
  assert(
    adapterCode.includes("['case', ['>=', ['coalesce', ['get', 'voltageKV'], 0], 400], 2.8, 1.8]"),
    '400kV line core is wider than 220kV at zoom 10 (2.8px vs 1.8px)'
  );
  assert(
    adapterCode.includes("['case', ['>=', ['coalesce', ['get', 'voltageKV'], 0], 400], 3.8, 2.4]"),
    '400kV line core is wider than 220kV at zoom 14 (3.8px vs 2.4px)'
  );
  assert(
    adapterCode.includes("['case', ['>=', ['coalesce', ['get', 'voltageKV'], 0], 400], 6.0, 4.0]"),
    '400kV glow is wider than 220kV at zoom 10 (6.0px vs 4.0px)'
  );
  assert(
    adapterCode.includes("['case', ['>=', ['coalesce', ['get', 'voltageKV'], 0], 400], 8.5, 5.5]"),
    '400kV glow is wider than 220kV at zoom 14 (8.5px vs 5.5px)'
  );

  // Satellite backdrop blending
  assert(adapterCode.includes("setOpacity('water', 0.30)"), 'Satellite mode blends water opacity at 0.30');
  assert(adapterCode.includes("setOpacity('landuse_park', 0.15)"), 'Satellite mode blends park opacity at 0.15');
  assert(adapterCode.includes("setOpacity('landuse_residential', 0.0)"), 'Satellite mode sets residential landuse to 0.0');
  assert(adapterCode.includes("setExtrusionOpacity('osm-streamed-buildings-3d', 0.82)"), 'Satellite mode tunes OSM buildings opacity to 0.82');
  assert(adapterCode.includes("setExtrusionOpacity('vajra-buildings-extrusion', 0.85)"), 'Satellite mode tunes landmark buildings opacity to 0.85');

  // ─── 3. City-by-City Independence & Electrical Geo-Registration ────
  console.log('\n─── 3. All 9 Cities Independence & Electrical Geo-Registration ───');

  const provider = new RealGeoDataProvider();
  const cityAssetMap: Record<string, GeoPowerAsset[]> = {};

  for (const cityId of TARGET_CITIES) {
    const city = VERIFIED_INDIAN_CITIES[cityId];
    assert(!!city, `City ${cityId} exists in verified registry`);
    assert(
      city.centerCoordinates.latitude > 8 && city.centerCoordinates.latitude < 37,
      `City ${city.name} latitude (${city.centerCoordinates.latitude}) is within Indian geodetic bounds`
    );
    assert(
      city.centerCoordinates.longitude > 68 && city.centerCoordinates.longitude < 98,
      `City ${city.name} longitude (${city.centerCoordinates.longitude}) is within Indian geodetic bounds`
    );

    // Verify power assets
    const assets = await provider.loadPowerInfrastructure(cityId);
    cityAssetMap[cityId] = assets;
    assert(assets.length > 0, `City ${city.name} has registered power assets (count: ${assets.length})`);

    const substations = assets.filter(
      (a) => a.category === 'TRANSMISSION_SUBSTATION' || a.category === 'DISTRIBUTION_SUBSTATION'
    );
    const lines = assets.filter((a) => a.category === 'TRANSMISSION_LINE');
    assert(substations.length > 0, `City ${city.name} has verified substations (count: ${substations.length})`);
    assert(lines.length > 0, `City ${city.name} has verified transmission corridors (count: ${lines.length})`);

    for (const sub of substations) {
      assert(sub.id.length > 0, `Substation has non-empty ID`);
      assert(
        (sub.voltageKV ?? 0) >= 33,
        `Substation ${sub.name} is grid rated (>= 33kV, actual: ${sub.voltageKV}kV)`
      );
      assert(
        sub.coordinates.latitude >= city.boundingBox.minLatitude - 0.25 &&
          sub.coordinates.latitude <= city.boundingBox.maxLatitude + 0.25,
        `Substation ${sub.name} lat within metropolitan boundary envelope`
      );
    }

    for (const line of lines) {
      assert(
        !!(line.pathCoordinates && line.pathCoordinates.length >= 2),
        `Transmission corridor ${line.name} has valid line coordinates`
      );
      assert((line.voltageKV ?? 0) >= 33, `Transmission corridor ${line.name} is grid rated (>= 33kV)`);
    }

    // Verify buildings
    const buildings = VERIFIED_CITY_BUILDINGS[cityId] || [];
    assert(buildings.length > 0, `City ${city.name} has landmark buildings (count: ${buildings.length})`);
    for (const b of buildings) {
      assert(b.parentId === cityId, `Building ${b.name} parentId strictly matches ${cityId}`);
      assert(
        !!(b.footprintPolygon && b.footprintPolygon.length >= 3),
        `Building ${b.name} has geodetic footprint polygon`
      );
    }
  }

  // ─── 4. Non-Interference Check Between Cities ───────────────────────
  console.log('\n─── 4. Non-Interference Verification Across Metropolitan Datasets ───');

  for (let i = 0; i < TARGET_CITIES.length; i++) {
    for (let j = i + 1; j < TARGET_CITIES.length; j++) {
      const cityA = TARGET_CITIES[i];
      const cityB = TARGET_CITIES[j];

      const assetsA = cityAssetMap[cityA] || [];
      const assetsB = cityAssetMap[cityB] || [];
      const idsA = new Set(assetsA.map((a) => a.id));
      const overlap = assetsB.filter((b) => idsA.has(b.id));
      assert(overlap.length === 0, `Zero power asset ID overlap between ${cityA} and ${cityB}`);

      const bldgsA = VERIFIED_CITY_BUILDINGS[cityA] || [];
      const bldgsB = VERIFIED_CITY_BUILDINGS[cityB] || [];
      const bldgIdsA = new Set(bldgsA.map((b) => b.id));
      const bldgOverlap = bldgsB.filter((b) => bldgIdsA.has(b.id));
      assert(bldgOverlap.length === 0, `Zero building ID overlap between ${cityA} and ${cityB}`);
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════════════`);
  console.log(`Phase 4.6 Reality Verification: ${passed} Passed, ${failed} Failed`);
  console.log(`═══════════════════════════════════════════════════════════════════\n`);

  if (failed > 0) {
    throw new Error(`Phase 4.6 Verification failed with ${failed} failure(s)`);
  }
}

if (require.main === module) {
  runPhase46RealityVerification().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
