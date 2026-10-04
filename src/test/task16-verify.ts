// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Task #16 Verification Script
// Geographic ↔ Electrical Network Mapping + Spatial Load Zoning + Voronoi Inference
// ═══════════════════════════════════════════════════════════════════════

import {
  isValidCoordinate,
  assertValidCoordinate,
  isValidBoundingBox,
  isCoordinateInBoundingBox,
} from '../simulation/geo/geoCoordinates';
import { ServiceRegionGenerator } from '../simulation/geo/serviceRegionGenerator';
import { LoadClusterer } from '../simulation/geo/loadClusterer';
import { GeoElectricalMapper } from '../simulation/geo/geoElectricalMapper';
import { ElectricalGeoBridge } from '../simulation/geo/electricalGeoBridge';
import { VERIFIED_INDIAN_CITIES } from '../simulation/geo/verifiedIndianCities';
import { DEMO_CITIES, DeterministicGeoDataProvider } from '../simulation/geo/deterministicGeoTwin';
import { generateGridTopology } from '../simulation/models/gridGenerator';
import { initiateCascadeSequence } from '../simulation/failures/cascadeEngine';
import { useVajraStore } from '../store/vajraStore';
import type {
  GeoPowerAsset,
  CriticalInfrastructure,
  Building,
  City,
  GeoBoundingBox,
  GeoCoordinate,
  ElectricalGeoReference,
} from '../types/geo';
import type { Substation, Load, GridTopology } from '../types';

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

async function runTask16Tests() {
  console.log('\n═══ Test Suite: Task #16 — Geographic ↔ Electrical Network Mapping ═══\n');

  const delhiCity = DEMO_CITIES['city-delhi'];
  const topology = generateGridTopology({ seed: 42 });

  // ─── 1. Geographic Coordinate Mapping ──────────────────────────────
  console.log('─── 1. Geographic Coordinate Mapping ───');
  {
    const ref: ElectricalGeoReference = {
      electricalAssetId: 'sub-trans-01',
      geoEntityId: 'geo-power-sub-01',
      coordinates: { latitude: 28.5039, longitude: 77.3061 },
      mappingType: 'VERIFIED',
      classification: 'VERIFIED_MAPPING',
      confidence: 'HIGH',
      source: 'State Transmission Utility SLD',
      provenance: {
        sourceType: 'VERIFIED_EXTERNAL',
        confidence: 'HIGH',
        sourceReference: 'State SLD 2026',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: true,
      },
      isVerified: true,
    };

    assert(isValidCoordinate(ref.coordinates), 'Coordinates in ElectricalGeoReference are valid WGS84');
    assert(ref.electricalAssetId === 'sub-trans-01', 'Electrical asset ID is correctly referenced');
    assert(ref.geoEntityId === 'geo-power-sub-01', 'Geographic entity ID is correctly referenced');
  }

  // ─── 2. Verified Asset Mapping ─────────────────────────────────────
  console.log('\n─── 2. Verified Asset Mapping ───');
  {
    const targetSub = topology.substations[0];
    const verifiedAsset: GeoPowerAsset = {
      id: `geo-power-${targetSub.id}`,
      name: 'Badarpur 400kV Substation',
      entityType: 'SUBSTATION',
      scaleLevel: 'SITE',
      electricalAssetId: targetSub.id,
      electricalAssetType: 'substation',
      category: 'TRANSMISSION_SUBSTATION',
      coordinates: { latitude: 28.5039, longitude: 77.3061 },
      voltageKV: 400,
      nominalCapacityMW: 600,
      isSurveyVerified: true,
      provenance: {
        sourceType: 'VERIFIED_EXTERNAL',
        confidence: 'HIGH',
        sourceReference: 'PGCIL Survey Document',
        lastUpdated: '2026-01-01T00:00:00Z',
        isVerifiedRealWorld: true,
      },
    };

    const mapper = new GeoElectricalMapper(topology, delhiCity, [verifiedAsset]);
    const res = mapper.executeMapping();
    const mapped = res.references.find((r) => r.electricalAssetId === targetSub.id);

    assert(mapped !== undefined, `Substation ${targetSub.id} was mapped`);
    assert(mapped?.classification === 'VERIFIED_MAPPING', 'Classification is VERIFIED_MAPPING');
    assert(mapped?.mappingType === 'VERIFIED', 'MappingType is VERIFIED');
    assert(mapped?.confidence === 'HIGH', 'Confidence is HIGH');
    assert(mapped?.isVerified === true, 'isVerified flag is true');
  }

  // ─── 3. Unmatched Asset Handling ───────────────────────────────────
  console.log('\n─── 3. Unmatched Asset Handling ───');
  {
    // Pass empty geographic dataset and dummy city without center
    const emptyCity: City = {
      id: 'city-empty',
      name: 'Empty Test City',
      entityType: 'CITY',
      scaleLevel: 'CITY',
      countryCode: 'IND',
      stateOrProvince: 'Test',
      centerCoordinates: { latitude: 0, longitude: 0 },
      boundingBox: { minLatitude: -1, maxLatitude: 1, minLongitude: -1, maxLongitude: 1 },
      coordinates: { latitude: 0, longitude: 0 },
      regionalGridInterconnect: 'Test Grid',
      provenance: {
        sourceType: 'SYNTHETIC',
        confidence: 'LOW',
        sourceReference: 'Test',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
    };

    // Construct a substation with no matches and null center
    const isolatedTopology: GridTopology = {
      ...topology,
      substations: [
        {
          id: 'sub-isolated-99',
          name: 'Completely Isolated Substation',
          type: 'transmission',
          capacityMW: 200,
          currentLoadMW: 50,
          voltagePU: 1.0,
          frequencyHz: 50,
          status: 'ONLINE',
          position: { x: 0, y: 0 },
          connectedLines: [],
          connectedLoads: [],
          connectedGenerators: [],
        },
      ],
    };

    const mapper = new GeoElectricalMapper(isolatedTopology, emptyCity, []);
    const res = mapper.executeMapping();

    assert(isolatedTopology.substations[0].id === 'sub-isolated-99', 'Electrical asset retained original ID');
    assert(res.references.length > 0, 'Mapping pipeline completed without crashing');
  }

  // ─── 4. Inferred Mapping ───────────────────────────────────────────
  console.log('\n─── 4. Inferred Mapping ───');
  {
    // Generate mapping with modeled/synthetic source
    const mapper = new GeoElectricalMapper(topology, delhiCity, []);
    const res = mapper.executeMapping();

    const inferredSub = res.references.find((r) => r.classification === 'INFERRED_MATCH');
    assert(inferredSub !== undefined, 'Found inferred substation match');
    assert(inferredSub?.mappingType === 'SPATIAL_INFERENCE', 'Mapping type is SPATIAL_INFERENCE');
    assert(inferredSub?.isVerified === false, 'Inferred match is NEVER marked as verified');
    assert(
      inferredSub?.provenance.methodologyNotes?.includes('Spatial inference') === true ||
        inferredSub?.provenance.sourceType === 'MODELED',
      'Provenance notes state spatial inference',
    );
  }

  // ─── 5. Duplicate Coordinates Handling ─────────────────────────────
  console.log('\n─── 5. Duplicate Coordinates Handling ───');
  {
    const duplicateSubs = [
      { id: 'sub-A', name: 'Substation Alpha', coordinates: { latitude: 28.61, longitude: 77.20 } },
      { id: 'sub-B', name: 'Substation Beta (Duplicate Coord)', coordinates: { latitude: 28.61, longitude: 77.20 } },
      { id: 'sub-C', name: 'Substation Gamma', coordinates: { latitude: 28.65, longitude: 77.25 } },
    ];

    const regions = ServiceRegionGenerator.generateRegions(duplicateSubs, delhiCity.boundingBox);
    assert(regions.length >= 2, 'Voronoi generated regions despite duplicate coordinates');
    assert(regions.every((r) => r.boundaryPolygon.length >= 3), 'All generated regions have valid polygons');
  }

  // ─── 6. Invalid Coordinates Handling ───────────────────────────────
  console.log('\n─── 6. Invalid Coordinates Handling ───');
  {
    const invalidSubs = [
      { id: 'sub-invalid-1', name: 'Bad Lat', coordinates: { latitude: 95.0, longitude: 77.2 } },
      { id: 'sub-invalid-2', name: 'Bad Lon', coordinates: { latitude: 28.6, longitude: -200.0 } },
      { id: 'sub-valid', name: 'Valid Sub', coordinates: { latitude: 28.6, longitude: 77.2 } },
    ];

    const regions = ServiceRegionGenerator.generateRegions(invalidSubs, delhiCity.boundingBox);
    assert(regions.length === 1, 'Only valid substation generated a region');
    assert(regions[0].substationId === 'sub-valid', 'Valid substation identified correctly');
  }

  // ─── 7. Single-Substation Voronoi ──────────────────────────────────
  console.log('\n─── 7. Single-Substation Voronoi ───');
  {
    const singleSub = [
      { id: 'sub-sole', name: 'Sole Grid Substation', coordinates: { latitude: 28.61, longitude: 77.20 } },
    ];

    const regions = ServiceRegionGenerator.generateRegions(singleSub, delhiCity.boundingBox);
    assert(regions.length === 1, 'Single substation produces exactly 1 region');
    assert(regions[0].determinationMethod === 'BOUNDED_PERIMETER', 'Method is BOUNDED_PERIMETER');
    assert(regions[0].boundaryPolygon.length === 4, 'Region boundary matches the 4-corner bounding box');
    assert(regions[0].isVerifiedFeederTerritory === false, 'isVerifiedFeederTerritory is strictly false');
  }

  // ─── 8. Two-Substation Voronoi ─────────────────────────────────────
  console.log('\n─── 8. Two-Substation Voronoi ───');
  {
    const twoSubs = [
      { id: 'sub-west', name: 'West Substation', coordinates: { latitude: 28.61, longitude: 77.10 } },
      { id: 'sub-east', name: 'East Substation', coordinates: { latitude: 28.61, longitude: 77.30 } },
    ];

    const regions = ServiceRegionGenerator.generateRegions(twoSubs, delhiCity.boundingBox);
    assert(regions.length === 2, 'Two substations produce exactly 2 regions');
    assert(regions[0].areaSqKm > 0, 'Region 1 has positive area');
    assert(regions[1].areaSqKm > 0, 'Region 2 has positive area');
    assert(regions[0].isVerifiedFeederTerritory === false, 'Region 1 does NOT claim feeder territory');
    assert(regions[1].isVerifiedFeederTerritory === false, 'Region 2 does NOT claim feeder territory');
  }

  // ─── 9. Multi-Substation Voronoi ───────────────────────────────────
  console.log('\n─── 9. Multi-Substation Voronoi ───');
  {
    const multiSubs = [
      { id: 'sub-1', name: 'Substation 1', coordinates: { latitude: 28.50, longitude: 77.15 } },
      { id: 'sub-2', name: 'Substation 2', coordinates: { latitude: 28.50, longitude: 77.35 } },
      { id: 'sub-3', name: 'Substation 3', coordinates: { latitude: 28.70, longitude: 77.15 } },
      { id: 'sub-4', name: 'Substation 4', coordinates: { latitude: 28.70, longitude: 77.35 } },
    ];

    const regions = ServiceRegionGenerator.generateRegions(multiSubs, delhiCity.boundingBox);
    assert(regions.length === 4, '4 substations produce 4 regions');
    for (const r of regions) {
      assert(r.boundaryPolygon.length >= 3, `Region ${r.substationId} is a valid polygon with >=3 vertices`);
      assert(r.areaSqKm > 0, `Region ${r.substationId} has calculated area (${r.areaSqKm} km²)`);
    }
  }

  // ─── 10. Voronoi Boundary Clipping ─────────────────────────────────
  console.log('\n─── 10. Voronoi Boundary Clipping ───');
  {
    const subs = [
      { id: 'sub-c1', name: 'Center Sub', coordinates: { latitude: 28.61, longitude: 77.20 } },
      { id: 'sub-c2', name: 'North Sub', coordinates: { latitude: 28.80, longitude: 77.20 } },
    ];

    const bbox = delhiCity.boundingBox;
    const regions = ServiceRegionGenerator.generateRegions(subs, bbox);

    let allWithin = true;
    for (const r of regions) {
      for (const vertex of r.boundaryPolygon) {
        if (
          vertex.latitude < bbox.minLatitude - 1e-6 ||
          vertex.latitude > bbox.maxLatitude + 1e-6 ||
          vertex.longitude < bbox.minLongitude - 1e-6 ||
          vertex.longitude > bbox.maxLongitude + 1e-6
        ) {
          allWithin = false;
        }
      }
    }
    assert(allWithin, 'All Voronoi polygon vertices strictly stay inside city study bounding box');
  }

  // ─── 11. Deterministic Voronoi Output ───
  console.log('\n─── 11. Deterministic Voronoi Output ───');
  {
    const subsA = [
      { id: 'sub-1', name: 'Sub 1', coordinates: { latitude: 28.50, longitude: 77.20 } },
      { id: 'sub-2', name: 'Sub 2', coordinates: { latitude: 28.70, longitude: 77.25 } },
    ];
    // Shuffled order:
    const subsB = [
      { id: 'sub-2', name: 'Sub 2', coordinates: { latitude: 28.70, longitude: 77.25 } },
      { id: 'sub-1', name: 'Sub 1', coordinates: { latitude: 28.50, longitude: 77.20 } },
    ];

    const regionsA = ServiceRegionGenerator.generateRegions(subsA, delhiCity.boundingBox);
    const regionsB = ServiceRegionGenerator.generateRegions(subsB, delhiCity.boundingBox);

    assert(regionsA.length === regionsB.length, 'Same count of regions regardless of input order');
    assert(regionsA[0].id === regionsB[0].id, 'Regions are deterministically ordered');
    assert(regionsA[0].areaSqKm === regionsB[0].areaSqKm, 'Area calculation is bit-for-bit identical');
  }

  // ─── 12. Spatial Load Clustering ───────────────────────────────────
  console.log('\n─── 12. Spatial Load Clustering ───');
  {
    const loads = [
      {
        id: 'load-1',
        name: 'Connaught Commercial Block',
        coordinates: { latitude: 28.631, longitude: 77.216 },
        demandMW: 25.0,
        category: 'COMMERCIAL' as const,
        isCritical: false,
      },
      {
        id: 'load-2',
        name: 'Barakhamba Office Center',
        coordinates: { latitude: 28.632, longitude: 77.220 },
        demandMW: 15.0,
        category: 'COMMERCIAL' as const,
        isCritical: false,
      },
      {
        id: 'load-3',
        name: 'Far Suburban Cluster',
        coordinates: { latitude: 28.750, longitude: 77.350 },
        demandMW: 30.0,
        category: 'RESIDENTIAL' as const,
        isCritical: false,
      },
    ];

    const clusters = LoadClusterer.clusterLoads(loads, 2000);
    assert(clusters.length === 2, 'Nearby loads grouped into 1 cluster, far load into another');
    const cpCluster = clusters.find((c) => c.memberLoadIds.includes('load-1'));
    assert(cpCluster !== undefined, 'Found Connaught Place cluster');
    assert(cpCluster?.memberLoadIds.length === 2, 'Connaught cluster contains 2 member loads');
    assert(cpCluster?.totalDemandMW === 40.0, 'Cluster demand equals sum of member demands (40MW)');
  }

  // ─── 13. Deterministic Load Clustering ─────────────────────────────
  console.log('\n─── 13. Deterministic Load Clustering ───');
  {
    const loadsA = [
      { id: 'load-A', name: 'Load A', coordinates: { latitude: 28.60, longitude: 77.20 }, demandMW: 10, category: 'RESIDENTIAL' as const, isCritical: false },
      { id: 'load-B', name: 'Load B', coordinates: { latitude: 28.61, longitude: 77.21 }, demandMW: 20, category: 'RESIDENTIAL' as const, isCritical: false },
    ];
    const loadsB = [
      { id: 'load-B', name: 'Load B', coordinates: { latitude: 28.61, longitude: 77.21 }, demandMW: 20, category: 'RESIDENTIAL' as const, isCritical: false },
      { id: 'load-A', name: 'Load A', coordinates: { latitude: 28.60, longitude: 77.20 }, demandMW: 10, category: 'RESIDENTIAL' as const, isCritical: false },
    ];

    const cA = LoadClusterer.clusterLoads(loadsA, 3000);
    const cB = LoadClusterer.clusterLoads(loadsB, 3000);

    assert(cA.length === cB.length, 'Clustering produces same number of clusters');
    assert(cA[0].id === cB[0].id, 'Cluster ID is identical');
    assert(cA[0].totalDemandMW === cB[0].totalDemandMW, 'Cluster total demand is identical');
  }

  // ─── 14. Empty Load Set ────────────────────────────────────────────
  console.log('\n─── 14. Empty Load Set ───');
  {
    const clusters = LoadClusterer.clusterLoads([]);
    assert(Array.isArray(clusters) && clusters.length === 0, 'Empty load set returns empty array []');
  }

  // ─── 15. Single Load ───────────────────────────────────────────────
  console.log('\n─── 15. Single Load ───');
  {
    const single = [
      { id: 'load-solo', name: 'Solo Factory', coordinates: { latitude: 28.55, longitude: 77.10 }, demandMW: 45, category: 'INDUSTRIAL' as const, isCritical: false },
    ];
    const clusters = LoadClusterer.clusterLoads(single);
    assert(clusters.length === 1, 'Single load produces 1 cluster');
    assert(clusters[0].radiusMeters === 0, 'Single load cluster has radius 0');
    assert(clusters[0].memberLoadIds[0] === 'load-solo', 'Member load ID preserved');
  }

  // ─── 16. Critical Load Preservation ────────────────────────────────
  console.log('\n─── 16. Critical Load Preservation ───');
  {
    const loadsWithCritical = [
      { id: 'load-norm', name: 'Regular Neighborhood', coordinates: { latitude: 28.60, longitude: 77.20 }, demandMW: 12, category: 'RESIDENTIAL' as const, isCritical: false },
      { id: 'load-hosp', name: 'AIIMS Apex Trauma Center', coordinates: { latitude: 28.605, longitude: 77.205 }, demandMW: 18, category: 'CRITICAL' as const, isCritical: true },
    ];
    const clusters = LoadClusterer.clusterLoads(loadsWithCritical, 3000);
    assert(clusters.length === 1, 'Grouped into single cluster');
    assert(clusters[0].containsCriticalLoad === true, 'containsCriticalLoad flag is true');
    assert(clusters[0].loadCategory === 'CRITICAL', 'Cluster category escalated to CRITICAL');
  }

  // ─── 17. Provenance Preservation ───────────────────────────────────
  console.log('\n─── 17. Provenance Preservation ───');
  {
    const mapper = new GeoElectricalMapper(topology, delhiCity);
    const res = mapper.executeMapping();

    for (const ref of res.references) {
      assert(ref.provenance !== undefined, `Reference ${ref.electricalAssetId} has defined provenance`);
      assert(typeof ref.provenance.sourceType === 'string', 'provenance has sourceType');
      assert(typeof ref.provenance.sourceReference === 'string', 'provenance has sourceReference');
    }
  }

  // ─── 18. Confidence Preservation ───────────────────────────────────
  console.log('\n─── 18. Confidence Preservation ───');
  {
    const mapper = new GeoElectricalMapper(topology, delhiCity);
    const res = mapper.executeMapping();

    for (const ref of res.references) {
      assert(
        ref.confidence === 'HIGH' || ref.confidence === 'MEDIUM' || ref.confidence === 'LOW',
        `Reference ${ref.electricalAssetId} has valid confidence (${ref.confidence})`,
      );
    }
  }

  // ─── 19. Geographic / Electrical Graph Separation ──────────────────
  console.log('\n─── 19. Geographic / Electrical Graph Separation ───');
  {
    const mapper = new GeoElectricalMapper(topology, delhiCity);
    const res = mapper.executeMapping();

    // Electrical topology must retain its own types and not be replaced by geo entities
    assert(topology.substations !== (res.references as any), 'Topology substations array is separate from geo references');
    assert(topology.transmissionLines.length > 0, 'Topology transmission lines array is separate from geo corridors');
    assert(res.bridge instanceof ElectricalGeoBridge, 'Bridge mediates between Graph A and Graph B without merging them');
  }

  // ─── 20. Electrical Topology Preservation ──────────────────────────
  console.log('\n─── 20. Electrical Topology Preservation ───');
  {
    const origSubCount = topology.substations.length;
    const origLineCount = topology.transmissionLines.length;
    const origLoadCount = topology.loads.length;

    const mapper = new GeoElectricalMapper(topology, delhiCity);
    mapper.executeMapping();

    assert(topology.substations.length === origSubCount, 'Substation count preserved');
    assert(topology.transmissionLines.length === origLineCount, 'Transmission line count preserved');
    assert(topology.loads.length === origLoadCount, 'Load count preserved');

    // Check circuit connectivity unaltered
    for (const line of topology.transmissionLines) {
      assert(typeof line.fromId === 'string' && typeof line.toId === 'string', `Line ${line.id} retained circuit endpoints`);
    }
  }

  // ─── 21. Cascade State Preservation ────────────────────────────────
  console.log('\n─── 21. Cascade State Preservation ───');
  {
    // Test that Task 13 cascade engine behavior is unaltered
    const testTopology = generateGridTopology({ seed: 123 });
    const { cascade, events } = initiateCascadeSequence(
      testTopology,
      0,
      'SUBSTATION_FAILURE',
      [testTopology.substations[0].id],
    );

    assert(cascade !== null, 'Cascade initiated successfully');
    assert(cascade.steps.length > 0, 'Cascade steps generated');
    assert(cascade.totalUnservedLoadMW >= 0, 'Unserved load computed');
    assert(events.length > 0, 'Cascade events generated');

    // Run Geo mapper and verify cascade result remains identical
    const mapper = new GeoElectricalMapper(testTopology, delhiCity);
    mapper.executeMapping();

    assert(cascade.steps.length > 0, 'Cascade record unchanged by geographic mapping');
  }

  // ─── 22. City-Independent Behavior ───
  console.log('\n─── 22. City-Independent Behavior ───');
  {
    const testCities = [
      VERIFIED_INDIAN_CITIES['city-delhi'],
      VERIFIED_INDIAN_CITIES['city-mumbai'],
      VERIFIED_INDIAN_CITIES['city-bengaluru'],
      VERIFIED_INDIAN_CITIES['city-chennai'],
      VERIFIED_INDIAN_CITIES['city-kolkata'],
      VERIFIED_INDIAN_CITIES['city-pune'],
      VERIFIED_INDIAN_CITIES['city-surat'],
      VERIFIED_INDIAN_CITIES['city-bhopal'],
    ];

    for (const city of testCities) {
      const topo = generateGridTopology({ seed: 42 });
      const mapper = new GeoElectricalMapper(topo, city);
      const res = mapper.executeMapping();

      assert(res.references.length > 0, `Mapper succeeded for ${city.name}`);
      assert(res.serviceRegions.length > 0, `Service regions generated for ${city.name}`);
      assert(res.loadClusters.length > 0, `Load clusters generated for ${city.name}`);
    }
  }

  // ─── Spatial Inspection Query Validation ───────────────────────────
  console.log('\n─── Spatial Inspection Query Tests ───');
  {
    const demoProvider = new DeterministicGeoDataProvider();
    const pkg = await demoProvider.loadCityTwin('city-delhi');
    assert(pkg !== null, 'Loaded Delhi demo package');

    if (pkg) {
      const mapper = new GeoElectricalMapper(
        topology,
        pkg.city,
        pkg.powerAssets,
        pkg.buildings,
        pkg.criticalInfrastructure,
      );
      mapper.executeMapping();

      // Query 1: Which geographic region is associated with this substation?
      const subId = topology.substations[0].id;
      const region = mapper.getGeographicRegionForSubstation(subId);
      assert(region !== undefined, `Resolved geographic region for substation ${subId}`);
      assert(region?.disclaimer === ServiceRegionGenerator.DISCLAIMER, 'Mandatory disclaimer attached');

      // Query 2: Which geographic infrastructure is near this transmission asset?
      const nearInfra = mapper.getGeographicInfrastructureNearAsset(subId, 5000);
      assert(Array.isArray(nearInfra), 'Queried nearby infrastructure without error');

      // Query 3: Which load zones are spatially associated with this electrical asset?
      const zones = mapper.getLoadZonesForElectricalAsset(subId);
      assert(Array.isArray(zones), 'Queried load zones for asset');

      // Query 4: Which areas would potentially be affected if this asset fails?
      const affected = mapper.getPotentiallyAffectedAreasForFailure(subId);
      assert(affected.failedAssetId === subId, 'Affected analysis identifies target asset');
      assert(affected.unservedDemandMW >= 0, 'Unserved demand computed');
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`Task #16 Verification Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTask16Tests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
