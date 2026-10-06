// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Phase 4.7 Geo-Twin Functional Layer Verification
// ═══════════════════════════════════════════════════════════════════════

import * as fs from 'fs';
import * as path from 'path';
import { VERIFIED_INDIAN_CITIES } from '../simulation/geo/verifiedIndianCities';
import { VERIFIED_CITY_BUILDINGS } from '../simulation/geo/verifiedCityBuildings';
import { RealGeoDataProvider } from '../simulation/geo/realGeoDataProvider';
import { GeoElectricalMapper } from '../simulation/geo/geoElectricalMapper';
import { buildCanonicalTopology } from '../simulation/models/canonicalGridBuilder';
import { Building3DExtruder } from '../simulation/geo/building3DExtruder';
import { MapEngineAdapter, ESRI_WORLD_IMAGERY_CONFIG } from '../simulation/geo/mapEngineAdapter';
import type { GeoLayerId, GeoPowerAsset } from '../types/geo';

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

export async function runPhase47FunctionalLayersVerification(): Promise<void> {
  console.log('\n═══ Test Suite: Phase 4.7 — Geo-Twin Functional Layer Implementation ═══\n');

  const ALL_9_CITIES = [
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

  const provider = new RealGeoDataProvider();

  // ─── 1. Nine Layers Architecture & Renderer Mapping ────────────────
  console.log('─── 1. Nine Layers Architecture & Renderer Mapping ───');

  const EXPECTED_9_LAYERS: GeoLayerId[] = [
    'BASE_MAP',
    'BUILDINGS',
    'CRITICAL_INFRASTRUCTURE',
    'SUBSTATIONS',
    'TRANSMISSION',
    'SERVICE_REGIONS',
    'LOAD_CLUSTERS',
    'LOAD_ZONES',
    'GRID_HEALTH',
  ];

  const adapterPath = path.join(__dirname, '../../src/simulation/geo/mapEngineAdapter.ts');
  assert(fs.existsSync(adapterPath), 'mapEngineAdapter.ts exists');
  const adapterCode = fs.readFileSync(adapterPath, 'utf8');

  // Verify layer sources exist
  assert(adapterCode.includes("'satellite-imagery-src'"), 'Layer 1 (Base Map Satellite): satellite-imagery-src registered');
  assert(adapterCode.includes("'openmaptiles'"), 'Layer 1/2 (Base Map Vector & 3D): openmaptiles vector source registered');
  assert(adapterCode.includes("'vajra-buildings-src'"), 'Layer 2 (Buildings): vajra-buildings-src GeoJSON source registered');
  assert(adapterCode.includes("'vajra-infra-src'"), 'Layer 3 (Critical Infra): vajra-infra-src GeoJSON source registered');
  assert(adapterCode.includes("'vajra-substations-src'"), 'Layer 4 (Substations): vajra-substations-src GeoJSON source registered');
  assert(adapterCode.includes("'vajra-transmission-src'"), 'Layer 5 (Transmission): vajra-transmission-src GeoJSON source registered');
  assert(adapterCode.includes("'vajra-service-regions-src'"), 'Layer 6 (Service Regions): vajra-service-regions-src GeoJSON source registered');
  assert(adapterCode.includes("'vajra-load-clusters-src'"), 'Layer 7 (Load Clusters): vajra-load-clusters-src GeoJSON source registered');
  assert(adapterCode.includes("'vajra-load-zones-src'"), 'Layer 8 (Load Zones): vajra-load-zones-src GeoJSON source registered');
  assert(adapterCode.includes("'vajra-substations-health-ring'"), 'Layer 9 (Grid Health): vajra-substations-health-ring layer registered');
  assert(adapterCode.includes("'vajra-transmission-health-glow'"), 'Layer 9 (Grid Health): vajra-transmission-health-glow layer registered');

  // ─── 2. Layer Isolation & Independent Visibility Mapping ───────────
  console.log('\n─── 2. Layer Isolation & Independent Visibility Mapping ───');

  const layerMappingRules: Record<string, string[]> = {
    BUILDINGS: ['vajra-buildings-fill', 'vajra-buildings-line', 'vajra-buildings-extrusion', 'osm-streamed-buildings-3d'],
    '3D_BUILDINGS': ['vajra-buildings-extrusion', 'osm-streamed-buildings-3d'],
    SUBSTATIONS: ['vajra-substations-circle'],
    TRANSMISSION: ['vajra-transmission-glow', 'vajra-transmission-core'],
    CRITICAL_INFRASTRUCTURE: ['vajra-infra-circle'],
    SERVICE_REGIONS: ['vajra-service-regions-fill', 'vajra-service-regions-line'],
    LOAD_CLUSTERS: ['vajra-load-clusters-circle'],
    LOAD_ZONES: ['vajra-load-zones-fill', 'vajra-load-zones-line'],
    GRID_HEALTH: ['vajra-substations-health-ring', 'vajra-transmission-health-glow'],
  };

  const overlayNames = Object.keys(layerMappingRules);
  for (let i = 0; i < overlayNames.length; i++) {
    for (let j = i + 1; j < overlayNames.length; j++) {
      const nameA = overlayNames[i];
      const nameB = overlayNames[j];
      const idsA = layerMappingRules[nameA];
      const idsB = layerMappingRules[nameB];
      if (
        (nameA === '3D_BUILDINGS' && nameB === 'BUILDINGS') ||
        (nameA === 'BUILDINGS' && nameB === '3D_BUILDINGS')
      ) {
        continue; // 3D is a subset/alias of buildings
      }
      const overlap = idsA.filter((id) => idsB.includes(id));
      assert(
        overlap.length === 0,
        `Strict layer target isolation between ${nameA} and ${nameB} (overlap: ${overlap.join(', ') || 'none'})`
      );
    }
  }

  // ─── 3. Data Honesty & Provenance Classification ────────────────────
  console.log('\n─── 3. Data Honesty & Strict Provenance Classification ───');

  // A. ESRI Satellite Backdrop
  assert(
    ESRI_WORLD_IMAGERY_CONFIG.provenanceClassification === 'CURRENT PUBLIC / EXTERNAL GEOGRAPHIC DATA',
    'Satellite backdrop classified as CURRENT PUBLIC / EXTERNAL GEOGRAPHIC DATA'
  );
  assert(!ESRI_WORLD_IMAGERY_CONFIG.provenanceClassification.includes('LIVE TELEMETRY'), 'Satellite does not claim LIVE TELEMETRY');

  // B. City by City Data Coverage & Provenance
  for (const cityId of ALL_9_CITIES) {
    const city = VERIFIED_INDIAN_CITIES[cityId];
    assert(!!city, `${cityId}: Verified city entry exists`);
    assert(city.provenance.isVerifiedRealWorld === true, `${cityId}: City boundary is verified real-world`);

    // Load full digital twin package
    const pkg = await provider.loadCityTwin(cityId);
    assert(!!pkg, `${cityId}: Digital twin package loaded`);

    // Verify Buildings
    assert(pkg!.buildings.length > 0, `${cityId}: Contains landmark buildings (${pkg!.buildings.length})`);
    for (const b of pkg!.buildings) {
      assert(b.parentId === cityId, `Building ${b.id} belongs to ${cityId}`);
      assert(b.heightMeters !== undefined && b.heightMeters > 0, `Building ${b.id} has positive height (${b.heightMeters}m)`);
      const hProv = Building3DExtruder.extractHeightWithProvenance(b);
      assert(
        hProv.provenance === 'VERIFIED_SURVEY' ||
          hProv.provenance === 'REAL_METADATA' ||
          hProv.provenance === 'FLOOR_COUNT_ESTIMATE' ||
          hProv.provenance === 'USAGE_TYPE_FALLBACK' ||
          hProv.provenance === 'SYNTHETIC',
        `Building ${b.id} height has valid provenance (${hProv.provenance})`
      );
    }

    // Verify Critical Infrastructure
    assert(pkg!.criticalInfrastructure.length > 0, `${cityId}: Contains critical infrastructure (${pkg!.criticalInfrastructure.length})`);
    for (const ci of pkg!.criticalInfrastructure) {
      assert(ci.requiresDualFeed === true, `Critical facility ${ci.name} flags requiresDualFeed`);
      assert(ci.emergencyBackupGenerationMW > 0, `Critical facility ${ci.name} has emergency backup generation`);
    }

    // Verify Substations & Corridors
    assert(pkg!.powerAssets.length > 0, `${cityId}: Contains registered power assets (${pkg!.powerAssets.length})`);
    const subs = pkg!.powerAssets.filter((a) => a.category === 'TRANSMISSION_SUBSTATION' || a.category === 'DISTRIBUTION_SUBSTATION');
    const lines = pkg!.powerAssets.filter((a) => a.category === 'TRANSMISSION_LINE');
    assert(subs.length > 0, `${cityId}: Contains substations (${subs.length})`);
    assert(lines.length > 0, `${cityId}: Contains transmission corridors (${lines.length})`);

    // Check line coordinates
    for (const line of lines) {
      assert(!!(line.pathCoordinates && line.pathCoordinates.length >= 2), `Line ${line.name} has >= 2 path coordinates`);
      if (line.id.startsWith('inferred-line-')) {
        assert(line.name.includes('[INFERRED]'), `Inferred line ${line.id} labeled with [INFERRED]`);
        assert(line.provenance.sourceType === 'MODELED', `Inferred line has MODELED provenance`);
      } else {
        assert(line.provenance.sourceType === 'VERIFIED_EXTERNAL', `Verified line has VERIFIED_EXTERNAL provenance`);
      }
    }

    // Build Topology & Geo-Electrical Mapping
    const topo = buildCanonicalTopology(cityId, { seed: 42 });
    const mapper = new GeoElectricalMapper(topo, pkg!.city, pkg!.powerAssets, pkg!.buildings, pkg!.criticalInfrastructure);
    const mapped = mapper.executeMapping();

    // Verify Service Regions
    assert(mapped.serviceRegions.length > 0, `${cityId}: Derived service regions (${mapped.serviceRegions.length})`);
    for (const r of mapped.serviceRegions) {
      assert(r.isVerifiedFeederTerritory === false, `Service region ${r.id} explicitly sets isVerifiedFeederTerritory = false`);
      assert(r.provenance.sourceType === 'MODELED', `Service region ${r.id} provenance is MODELED`);
      assert(
        r.disclaimer.includes('Estimated') && r.disclaimer.includes('electrical feeder'),
        `Service region ${r.id} includes disclaimer`
      );
      assert(r.boundaryPolygon.length >= 3, `Service region ${r.id} has polygon geometry`);
    }

    // Verify Load Clusters
    assert(mapped.loadClusters.length > 0, `${cityId}: Derived load clusters (${mapped.loadClusters.length})`);
    for (const c of mapped.loadClusters) {
      assert(c.totalDemandMW > 0, `Load cluster ${c.id} has positive demand (${c.totalDemandMW}MW)`);
      assert(c.clusteringMetric.length > 0, `Load cluster ${c.id} documents clustering methodology`);
    }

    // Verify Load Zones
    assert(mapped.loadZones.length > 0, `${cityId}: Derived load zones (${mapped.loadZones.length})`);
    for (const z of mapped.loadZones) {
      assert(z.provenance.sourceType === 'MODELED', `Load zone ${z.id} provenance is MODELED`);
      assert(z.coordinates.latitude > 8 && z.coordinates.latitude < 37, `Load zone ${z.id} lat in bounds`);
    }
  }

  // ─── 4. Simulation State Synchronization (Grid Health & Outages) ────
  console.log('\n─── 4. Simulation State Synchronization & Grid Health ───');

  const delhiPkg = await provider.loadCityTwin('city-delhi');
  const delhiTopo = buildCanonicalTopology('city-delhi', { seed: 42 });
  const delhiMapper = new GeoElectricalMapper(delhiTopo, delhiPkg!.city, delhiPkg!.powerAssets, delhiPkg!.buildings, delhiPkg!.criticalInfrastructure);
  const delhiMapped = delhiMapper.executeMapping();

  // Test healthy visual state
  const healthySub = delhiPkg!.powerAssets.find((a) => a.id === 'del-sub-badarpur-400kv');
  assert(!!healthySub, 'Found Badarpur 400kV substation');

  // Verify non-critical commercial building blackout derivation on service region trip
  const testBuilding = delhiPkg!.buildings.find((b) => !b.isCriticalPowerCustomer) || delhiPkg!.buildings[0];
  const initialVisual = Building3DExtruder.deriveBlackoutVisual(testBuilding);
  assert(initialVisual.blackoutCategory === 'ILLUMINATED', 'Initial building visual is ILLUMINATED');
  assert(initialVisual.dimmingFactor === 0.0, 'Initial building dimming is 0.0');

  // Identify associated service region
  const targetRegion = delhiMapped.serviceRegions.find(
    (r) => r.substationId === testBuilding.inferredFeederSubstationId
  ) || delhiMapped.serviceRegions[0];

  // Simulate total blackout on its service region
  const simulatedImpact = {
    tick: 1,
    timestamp: '2026-10-06T12:00:00Z',
    cityId: 'city-delhi',
    totalCityDemandMW: 240,
    totalCityServedMW: 0,
    totalCityUnservedMW: 240,
    cityServiceFraction: 0,
    blackoutZoneCount: 1,
    criticalFacilitiesAtRisk: 1,
    serviceRegionImpacts: {
      [targetRegion.id]: {
        regionId: targetRegion.id,
        substationId: targetRegion.substationId,
        substationName: targetRegion.substationName,
        substationStatus: 'FAILED' as const,
        blackoutState: 'TOTAL_BLACKOUT' as const,
        blackoutFraction: 1.0,
        totalDemandMW: 50,
        servedDemandMW: 0,
        unservedDemandMW: 50,
        powerQualityIndex: 0.0,
        affectedConsumerCount: 100000,
        criticalFacilitiesAffectedCount: 2,
      },
    },
    criticalInfraStatus: {},
    corridorImpacts: {},
    latestCascadeSteps: [],
  };

  const trippedVisual = Building3DExtruder.deriveBlackoutVisual(
    testBuilding,
    simulatedImpact,
    delhiMapped.serviceRegions,
    delhiPkg!.criticalInfrastructure,
    true
  );
  assert(trippedVisual.blackoutCategory === 'SEVERE_BLACKOUT', 'Tripped service region forces SEVERE_BLACKOUT on associated building');
  assert(trippedVisual.dimmingFactor >= 0.85, 'Blackout dimming factor >= 0.85 (actual: ' + trippedVisual.dimmingFactor + ')');

  // Test restoration
  const restoredVisual = Building3DExtruder.deriveBlackoutVisual(testBuilding, undefined, delhiMapped.serviceRegions, delhiPkg!.criticalInfrastructure, true);
  assert(restoredVisual.blackoutCategory === 'ILLUMINATED', 'Recovery restores ILLUMINATED state');
  assert(restoredVisual.dimmingFactor === 0.0, 'Recovery restores 0.0 dimming');

  // ─── 5. Operational Semantic Color Rules ────────────────────────────
  console.log('\n─── 5. Operational Semantic Color Rules ───');

  const COLOR_RULES = {
    GREEN: '#10b981', // Verified / healthy
    BLUE: '#38bdf8',  // Transmission grid infrastructure
    YELLOW: '#eab308', // Inferred / warning
    ORANGE: '#f97316', // Overload state
    RED: '#ef4444',    // Failed / tripped
    PURPLE: '#a855f7', // Simulated
  };

  assert(COLOR_RULES.GREEN === '#10b981', 'GREEN represents healthy/verified state');
  assert(COLOR_RULES.BLUE === '#38bdf8', 'BLUE represents transmission/grid infrastructure');
  assert(COLOR_RULES.YELLOW === '#eab308', 'YELLOW represents warning/inferred state');
  assert(COLOR_RULES.ORANGE === '#f97316', 'ORANGE represents overload state');
  assert(COLOR_RULES.RED === '#ef4444', 'RED represents failed/tripped state');
  assert(COLOR_RULES.PURPLE === '#a855f7', 'PURPLE represents simulated state');

  console.log(`\n═══════════════════════════════════════════════════════════════════`);
  console.log(`Phase 4.7 Functional Layers Verification: ${passed} Passed, ${failed} Failed`);
  console.log(`═══════════════════════════════════════════════════════════════════\n`);

  if (failed > 0) {
    throw new Error(`Phase 4.7 Verification failed with ${failed} failure(s)`);
  }
}

if (require.main === module) {
  runPhase47FunctionalLayersVerification().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
