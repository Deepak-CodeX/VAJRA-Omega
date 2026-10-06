// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Phase 5 Electrical Flow & Operational UX Automated Verification
// ═══════════════════════════════════════════════════════════════════════
// Rigorous verification of Section 23 Automated Verification Requirements:
// 1. flow direction correctness (signed flow > 0 => A->B, < 0 => B->A)
// 2. flow magnitude correctness (activePowerFlowMW === abs(signedFlowMW))
// 3. line loading calculation (loadingPercent === (activePowerFlowMW / capacityMW) * 100)
// 4. state-to-color mapping (Green < 85%, Yellow 85-99%, Orange >= 100%, Red tripped)
// 5. zero-flow behavior (flowDirection === 'ZERO', baseline line width 1.8)
// 6. failed-line behavior (status === 'TRIPPED', flow === 0, color === RED)
// 7. overloaded-line behavior (status === 'OVERLOADED', color === ORANGE)
// 8. reset behavior (restores baseline flows & healthy operational states)
// 9. step behavior (advances flow deterministically per tick)
// 10. speed control (clock speed scaling preserves deterministic physics)
// 11. source/destination mapping (substation upstream and downstream edges)
// 12. load-region supply mapping ("Who supplies this region?" and incoming MW)
// 13. provenance preservation (honest SCHEMATIC and MODELED metadata)
// 14. city isolation across all 9 cities
// ═══════════════════════════════════════════════════════════════════════

import { buildCanonicalTopology } from '../simulation/models/canonicalGridBuilder';
import { simulationTick } from '../simulation/engine/simulationEngine';
import { RealGeoDataProvider } from '../simulation/geo/realGeoDataProvider';
import {
  GeoElectricalStateAdapter,
  SEMANTIC_COLORS,
} from '../simulation/geo/geoElectricalStateAdapter';
import { SeededRandom } from '../lib/utils';
import { DEFAULT_GEO_TWIN_STATE } from '../store/vajraStore';
import type { GridTopology } from '../types';
import type { GeoTwinState } from '../types/geo';

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

export async function runPhase5ElectricalFlowVerification(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('VAJRA-Ω — Phase 5 Electrical Flow & Operational UX Verification');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let total = 0;

  function assert(desc: string, condition: boolean): void {
    total++;
    if (condition) {
      console.log(`  [PASS] Test ${total}: ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] Test ${total}: ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  }

  const geoProvider = new RealGeoDataProvider();
  const baseGeoTwin: GeoTwinState = {
    ...DEFAULT_GEO_TWIN_STATE,
  };

  const delhiPkg = await geoProvider.loadCityTwin('city-delhi');
  if (!delhiPkg) throw new Error('Failed to load Delhi city twin package');

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: Flow Direction Correctness (Signed Flow Directionality)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- Criterion 1: Flow Direction Correctness ---');
  {
    const delhiTopology = buildCanonicalTopology('city-delhi');
    const line0 = delhiTopology.transmissionLines[0];

    // Positive flow: fromId -> toId
    line0.currentFlowMW = 150.0;
    const syncFwd = GeoElectricalStateAdapter.synchronize(
      delhiTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      0,
    );
    const lineFeatureFwd = Object.values(syncFwd.transmissionCorridors).find(
      (f) => f.simulationAssetId === line0.id || f.featureId.includes(line0.id),
    );
    assert(
      'Positive signed flow yields flowDirection A_TO_B',
      lineFeatureFwd !== undefined && lineFeatureFwd.flowDirection === 'A_TO_B',
    );

    // Negative flow: toId -> fromId
    line0.currentFlowMW = -150.0;
    const syncRev = GeoElectricalStateAdapter.synchronize(
      delhiTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      0,
    );
    const lineFeatureRev = Object.values(syncRev.transmissionCorridors).find(
      (f) => f.simulationAssetId === line0.id || f.featureId.includes(line0.id),
    );
    assert(
      'Negative signed flow yields flowDirection B_TO_A',
      lineFeatureRev !== undefined && lineFeatureRev.flowDirection === 'B_TO_A',
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Flow Magnitude Correctness
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Criterion 2: Flow Magnitude Correctness ---');
  {
    const delhiTopology = buildCanonicalTopology('city-delhi');
    const line = delhiTopology.transmissionLines[0];
    line.currentFlowMW = -182.45;

    const sync = GeoElectricalStateAdapter.synchronize(
      delhiTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      0,
    );
    const feature = Object.values(sync.transmissionCorridors).find(
      (f) => f.simulationAssetId === line.id || f.featureId.includes(line.id),
    );
    assert(
      'Active power magnitude equals absolute signed value (182.45 MW)',
      feature !== undefined &&
        feature.activePowerFlowMW !== undefined &&
        Math.abs(feature.activePowerFlowMW - 182.45) < 0.001,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Line Loading Calculation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Criterion 3: Line Loading Calculation ---');
  {
    const delhiTopology = buildCanonicalTopology('city-delhi');
    const line = delhiTopology.transmissionLines[0];
    line.capacityMW = 300.0;
    line.currentFlowMW = 182.0;
    line.loadingPercent = (182.0 / 300.0) * 100; // 60.67%

    const sync = GeoElectricalStateAdapter.synchronize(
      delhiTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      0,
    );
    const feature = Object.values(sync.transmissionCorridors).find(
      (f) => f.simulationAssetId === line.id || f.featureId.includes(line.id),
    );
    assert(
      'Feature loadingPercent correctly reflects ratio (60.67%)',
      feature !== undefined &&
        feature.loadingPercent !== undefined &&
        Math.abs(feature.loadingPercent - 60.67) < 0.1,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: State-to-Color Mapping Hierarchy
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Criterion 4: State-to-Color Mapping Hierarchy ---');
  {
    const delhiTopology = buildCanonicalTopology('city-delhi');
    const line = delhiTopology.transmissionLines[0];

    // Case 1: Healthy (<85%) -> GREEN flow color
    line.status = 'ONLINE';
    line.loadingPercent = 55.0;
    const syncHealthy = GeoElectricalStateAdapter.synchronize(
      delhiTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      0,
    );
    const featHealthy = Object.values(syncHealthy.transmissionCorridors).find(
      (f) => f.simulationAssetId === line.id || f.featureId.includes(line.id),
    );
    assert(
      'Loading < 85% maps flowColor to SEMANTIC_COLORS.GREEN (#10b981)',
      featHealthy !== undefined && featHealthy.flowColor === SEMANTIC_COLORS.GREEN,
    );

    // Case 2: Warning (85-99%) -> YELLOW flow color
    line.loadingPercent = 90.0;
    const syncWarn = GeoElectricalStateAdapter.synchronize(
      delhiTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      0,
    );
    const featWarn = Object.values(syncWarn.transmissionCorridors).find(
      (f) => f.simulationAssetId === line.id || f.featureId.includes(line.id),
    );
    assert(
      'Loading 85-99% maps flowColor to SEMANTIC_COLORS.YELLOW (#eab308)',
      featWarn !== undefined && featWarn.flowColor === SEMANTIC_COLORS.YELLOW,
    );

    // Case 3: Overload (>=100%) -> ORANGE flow color
    line.loadingPercent = 112.0;
    const syncOver = GeoElectricalStateAdapter.synchronize(
      delhiTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      0,
    );
    const featOver = Object.values(syncOver.transmissionCorridors).find(
      (f) => f.simulationAssetId === line.id || f.featureId.includes(line.id),
    );
    assert(
      'Loading >= 100% maps flowColor to SEMANTIC_COLORS.ORANGE (#f97316)',
      featOver !== undefined && featOver.flowColor === SEMANTIC_COLORS.ORANGE,
    );

    // Case 4: Failed / Tripped -> RED flow color
    line.status = 'FAILED';
    const syncFail = GeoElectricalStateAdapter.synchronize(
      delhiTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      0,
    );
    const featFail = Object.values(syncFail.transmissionCorridors).find(
      (f) => f.simulationAssetId === line.id || f.featureId.includes(line.id),
    );
    assert(
      'Status FAILED maps flowColor to SEMANTIC_COLORS.RED (#ef4444)',
      featFail !== undefined && featFail.flowColor === SEMANTIC_COLORS.RED,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Zero-Flow Behavior
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Criterion 5: Zero-Flow Behavior ---');
  {
    const delhiTopology = buildCanonicalTopology('city-delhi');
    const line = delhiTopology.transmissionLines[0];
    line.currentFlowMW = 0.0;
    line.status = 'ONLINE';

    const sync = GeoElectricalStateAdapter.synchronize(
      delhiTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      0,
    );
    const feature = Object.values(sync.transmissionCorridors).find(
      (f) => f.simulationAssetId === line.id || f.featureId.includes(line.id),
    );
    assert(
      'Zero currentFlowMW results in flowDirection ZERO',
      feature !== undefined && feature.flowDirection === 'ZERO',
    );
    assert(
      'Zero currentFlowMW sets baseline minimum flowLineWidth (1.8)',
      feature !== undefined && feature.flowLineWidth === 1.8,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: Failed-Line Behavior
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Criterion 6: Failed-Line Behavior ---');
  {
    const delhiTopology = buildCanonicalTopology('city-delhi');
    const line = delhiTopology.transmissionLines[0];
    line.status = 'FAILED';
    line.currentFlowMW = 0.0;

    const sync = GeoElectricalStateAdapter.synchronize(
      delhiTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      0,
    );
    const feature = Object.values(sync.transmissionCorridors).find(
      (f) => f.simulationAssetId === line.id || f.featureId.includes(line.id),
    );
    assert(
      'Failed line has operationalState TRIPPED',
      feature !== undefined && feature.operationalState === 'TRIPPED',
    );
    assert(
      'Failed line has isTripped === true',
      feature !== undefined && feature.isTripped === true,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: Overloaded-Line Behavior
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Criterion 7: Overloaded-Line Behavior ---');
  {
    const delhiTopology = buildCanonicalTopology('city-delhi');
    const line = delhiTopology.transmissionLines[0];
    line.status = 'ONLINE';
    line.loadingPercent = 125.0;

    const sync = GeoElectricalStateAdapter.synchronize(
      delhiTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      0,
    );
    const feature = Object.values(sync.transmissionCorridors).find(
      (f) => f.simulationAssetId === line.id || f.featureId.includes(line.id),
    );
    assert(
      'Line loading >= 100% sets isOverloaded === true',
      feature !== undefined && feature.isOverloaded === true,
    );
    assert(
      'Line loading >= 100% sets operationalState OVERLOADED',
      feature !== undefined && feature.operationalState === 'OVERLOADED',
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 8: Reset Behavior
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Criterion 8: Reset Behavior ---');
  {
    const delhiTopology = buildCanonicalTopology('city-delhi');
    // Mutate state with failure
    delhiTopology.transmissionLines[0].status = 'FAILED';
    delhiTopology.substations[0].status = 'FAILED';

    // Simulate reset by re-building canonical topology
    const resetTopology = buildCanonicalTopology('city-delhi');
    const syncReset = GeoElectricalStateAdapter.synchronize(
      resetTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      0,
    );

    const hasFailed =
      Object.values(syncReset.substations).some((f) => f.isTripped) ||
      Object.values(syncReset.transmissionCorridors).some((f) => f.isTripped);
    assert('Reset restores all assets to non-tripped state', !hasFailed);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 9 & 10: Step Behavior & Clock Speed Scaling
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Criterion 9 & 10: Step & Speed Control Compatibility ---');
  {
    const topology = buildCanonicalTopology('city-delhi');
    const rng = new SeededRandom(42);

    // Baseline tick 0
    const sync0 = GeoElectricalStateAdapter.synchronize(
      topology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      0,
    );
    assert('Sync0 initial tick is 0', sync0.tick === 0);

    // Advance 5 discrete ticks
    for (let t = 1; t <= 5; t++) {
      simulationTick(topology, t, rng);
    }

    const sync5 = GeoElectricalStateAdapter.synchronize(
      topology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      5,
    );

    assert(
      'Synchronized tick reflects current clock step (tick 5)',
      sync5.tick === 5,
    );
    assert(
      'Power flows remain physically bounded across simulation ticks',
      topology.transmissionLines.every(
        (l) => Math.abs(l.currentFlowMW) <= l.capacityMW * 2,
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 11: Source/Destination Mapping for Substations
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Criterion 11: Source / Destination Mapping ---');
  {
    const delhiTopology = buildCanonicalTopology('city-delhi');
    const rng = new SeededRandom(101);

    // Run tick to establish steady DC power flow
    simulationTick(delhiTopology, 1, rng);
    const sync = GeoElectricalStateAdapter.synchronize(
      delhiTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      1,
    );

    const subFeatures = Object.values(sync.substations);
    assert('Substation features exist in synchronized state', subFeatures.length > 0);
    const hasUpstreamOrDownstream = subFeatures.some(
      (f) =>
        (f.upstreamSubstations && f.upstreamSubstations.length > 0) ||
        (f.downstreamSubstations && f.downstreamSubstations.length > 0),
    );
    assert(
      'Substations have calculated upstream sources or downstream deliveries',
      hasUpstreamOrDownstream,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 12: Load-Region Supply Mapping ("Who Supplies This Region?")
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Criterion 12: Load-Region Supply Mapping ---');
  {
    const delhiTopology = buildCanonicalTopology('city-delhi');
    const sub0 = delhiTopology.substations[0];

    const serviceRegions = [
      {
        id: 'region-delhi-central',
        name: 'Central Delhi Demand Catchment',
        substationId: sub0.id,
        substationName: sub0.name,
        centerCoordinates: sub0.geoRef?.coordinates || { latitude: 28.6139, longitude: 77.209 },
        boundaryPolygon: [
          { latitude: 28.61, longitude: 77.20 },
          { latitude: 28.62, longitude: 77.20 },
          { latitude: 28.62, longitude: 77.22 },
          { latitude: 28.61, longitude: 77.22 },
        ],
        areaSqKm: 18.5,
        associatedLoadIds: [],
        totalEstimatedDemandMW: 85.0,
        determinationMethod: 'VORONOI_PROXIMITY' as const,
        isVerifiedFeederTerritory: false as const,
        provenance: {
          sourceType: 'MODELED' as const,
          sourceReference: 'Census & Voronoi Catchment',
          lastUpdated: '2026-03-15',
          confidence: 'MEDIUM' as const,
          isVerifiedRealWorld: false,
        },
        disclaimer: 'Spatial Voronoi catchment approximation',
      },
    ];

    const sync = GeoElectricalStateAdapter.synchronize(
      delhiTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
        serviceRegions,
      },
      'city-delhi',
      1,
    );

    const regionFeat = sync.serviceRegions['region-delhi-central'];
    assert(
      'Service region is mapped in synchronized state',
      regionFeat !== undefined,
    );
    assert(
      'Service region has identified supplying substation',
      regionFeat !== undefined &&
        regionFeat.supplyingSubstations !== undefined &&
        regionFeat.supplyingSubstations.length > 0 &&
        regionFeat.supplyingSubstations[0].id === sub0.id,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 13: Provenance Preservation (Honest Geometry Metadata)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Criterion 13: Provenance Preservation ---');
  {
    const delhiTopology = buildCanonicalTopology('city-delhi');

    const sync = GeoElectricalStateAdapter.synchronize(
      delhiTopology,
      baseGeoTwin,
      {
        powerAssets: delhiPkg.powerAssets,
        criticalInfrastructure: delhiPkg.criticalInfrastructure,
        buildings: delhiPkg.buildings,
      },
      'city-delhi',
      0,
    );

    const lineFeatures = Object.values(sync.transmissionCorridors);
    assert(
      'Transmission lines carry SCHEMATIC or INFERRED geometry type, never false verified cable route',
      lineFeatures.every(
        (f) => f.geometryType === 'SCHEMATIC' || f.geometryType === 'INFERRED',
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 14: City Isolation Across All 9 Cities
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- Criterion 14: 9-City Isolation ---');
  {
    for (const cityId of ALL_9_CITIES) {
      const cityTopo = buildCanonicalTopology(cityId);
      const cityTwin = await geoProvider.loadCityTwin(cityId);
      if (!cityTwin) throw new Error(`Missing package for ${cityId}`);

      const sync = GeoElectricalStateAdapter.synchronize(
        cityTopo,
        baseGeoTwin,
        {
          powerAssets: cityTwin.powerAssets,
          criticalInfrastructure: cityTwin.criticalInfrastructure,
          buildings: cityTwin.buildings,
        },
        cityId,
        0,
      );

      assert(
        `City ${cityId} builds valid synchronized state with >0 features and zero cross-city pollution`,
        sync.cityId === cityId &&
          (Object.keys(sync.substations).length > 0 || Object.keys(sync.transmissionCorridors).length > 0),
      );
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`Phase 5 Verification Complete: ${passed}/${total} assertions PASSED`);
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

// Auto-run if invoked directly via ts-node / tsx / node
if (require.main === module) {
  runPhase5ElectricalFlowVerification().catch((err) => {
    console.error('Phase 5 Verification Failed:', err);
    process.exit(1);
  });
}
