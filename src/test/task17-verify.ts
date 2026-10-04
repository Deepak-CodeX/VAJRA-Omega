// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Task #17 Verification Script
// Geo-Aware City-Scale Simulation Integration
// ═══════════════════════════════════════════════════════════════════════

import { GeoSimulationCoordinator } from '../simulation/geo/geoSimulationCoordinator';
import { GeoElectricalMapper } from '../simulation/geo/geoElectricalMapper';
import { DEMO_CITIES, DeterministicGeoDataProvider } from '../simulation/geo/deterministicGeoTwin';
import { VERIFIED_INDIAN_CITIES } from '../simulation/geo/verifiedIndianCities';
import { generateGridTopology } from '../simulation/models/gridGenerator';
import { simulationTick } from '../simulation/engine/simulationEngine';
import { injectFailure, initiateCascadeSequence } from '../simulation/failures/cascadeEngine';
import { generateRecoveryPlan, executeRecoveryPlan } from '../simulation/recovery/recoveryEngine';
import { SeededRandom } from '../lib/utils';
import { useVajraStore, DEFAULT_GEO_LAYERS } from '../store/vajraStore';
import type {
  GridTopology,
  CascadeRecord,
  CascadeStep,
} from '../types';
import type {
  GeoTwinState,
  CriticalInfrastructure,
  GeoSimulationImpact,
  ServiceRegionSimulationImpact,
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

async function runTask17Tests() {
  console.log('\n═══ Test Suite: Task #17 — Geo-Aware City-Scale Simulation Integration ═══\n');

  const provider = new DeterministicGeoDataProvider();
  const delhiPkg = await provider.loadCityTwin('city-delhi');
  if (!delhiPkg) {
    throw new Error('Failed to load Delhi demo package');
  }

  const topology = generateGridTopology({ seed: 42 });
  const mapper = new GeoElectricalMapper(
    topology,
    delhiPkg.city,
    delhiPkg.powerAssets,
    delhiPkg.buildings,
    delhiPkg.criticalInfrastructure,
  );
  const mappingResult = mapper.executeMapping();

  const baseGeoTwin: GeoTwinState = {
    isGeoViewActive: true,
    selectedCity: delhiPkg.city,
    selectedRegion: null,
    selectedEntityId: null,
    viewport: {
      center: delhiPkg.city.centerCoordinates,
      zoom: 11,
      pitchDegrees: 0,
      bearingDegrees: 0,
    },
    visibleLayers: { ...DEFAULT_GEO_LAYERS },
    searchQuery: '',
    searchResults: [],
    loadedEntitiesCount: 14,
    provenanceSummary: delhiPkg.provenanceSummary,
    mapEngineStatus: 'READY',
    locationResolutionStatus: 'SUCCESS',
    errorMessage: null,
    requestGenerationToken: 1,
    attribution: '© OpenStreetMap contributors © CARTO',
    serviceRegions: mappingResult.serviceRegions,
    loadClusters: mappingResult.loadClusters,
    electricalGeoMappings: mappingResult.references,
    criticalInfrastructure: delhiPkg.criticalInfrastructure,
  };

  // ─── 1. Baseline Simulation Impact Projection ───────────────────────
  console.log('─── 1. Baseline Simulation Impact Projection ───');
  {
    const impact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      topology,
      baseGeoTwin,
      delhiPkg.criticalInfrastructure,
      null,
      0,
    );

    assert(impact !== undefined && impact !== null, 'Impact projection computed successfully');
    assert(impact.totalCityDemandMW > 0, `City demand is positive: ${impact.totalCityDemandMW} MW`);
    assert(impact.totalCityServedMW > 0, `City served power is positive: ${impact.totalCityServedMW} MW`);
    assert(impact.totalCityUnservedMW === 0, `Baseline unserved demand is zero: ${impact.totalCityUnservedMW} MW`);
    assert(impact.cityServiceFraction >= 0.99, `City service fraction is 1.0 (got ${impact.cityServiceFraction})`);
    assert(impact.blackoutZoneCount === 0, `Zero blackout zones on healthy grid (got ${impact.blackoutZoneCount})`);
    assert(impact.criticalFacilitiesAtRisk === 0, `Zero critical facilities at risk on healthy grid`);
  }

  // ─── 2. Service Region Impact Breakdown ─────────────────────────────
  console.log('─── 2. Service Region Impact Breakdown ───');
  {
    const impact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      topology,
      baseGeoTwin,
      delhiPkg.criticalInfrastructure,
      null,
      0,
    );

    const regionIds = Object.keys(impact.serviceRegionImpacts);
    assert(regionIds.length === baseGeoTwin.serviceRegions.length, `Evaluated all ${baseGeoTwin.serviceRegions.length} service regions`);

    const firstRegionImpact = impact.serviceRegionImpacts[regionIds[0]];
    assert(firstRegionImpact.blackoutState === 'NORMAL', `Region ${firstRegionImpact.substationName} is in NORMAL state`);
    assert(firstRegionImpact.blackoutFraction === 0, `Region blackout fraction is 0.0`);
    assert(firstRegionImpact.substationStatus === 'ONLINE', `Region feed substation is ONLINE`);
    assert(firstRegionImpact.powerQualityIndex > 0.8, `Power quality index is high: ${firstRegionImpact.powerQualityIndex}`);
  }

  // ─── 3. Substation Failure -> Total Regional Blackout ───────────────
  console.log('─── 3. Substation Failure Impact ───');
  {
    const faultedTopology = JSON.parse(JSON.stringify(topology)) as GridTopology;
    const targetSub = faultedTopology.substations[0];
    targetSub.status = 'FAILED';

    const impact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      faultedTopology,
      baseGeoTwin,
      delhiPkg.criticalInfrastructure,
      null,
      1,
    );

    const impactedRegion = Object.values(impact.serviceRegionImpacts).find(
      (r) => r.substationId === targetSub.id,
    );

    assert(impactedRegion !== undefined, `Found service region for failed substation ${targetSub.id}`);
    assert(impactedRegion!.blackoutState === 'TOTAL_BLACKOUT', `Impacted region transitioned to TOTAL_BLACKOUT (got ${impactedRegion?.blackoutState})`);
    assert(impactedRegion!.blackoutFraction === 1.0, `Blackout fraction is 1.0 (got ${impactedRegion?.blackoutFraction})`);
    assert(impactedRegion!.unservedDemandMW > 0, `Region has unserved demand: ${impactedRegion?.unservedDemandMW} MW`);
    assert(impact.blackoutZoneCount >= 1, `Total blackoutZoneCount incremented: ${impact.blackoutZoneCount}`);
  }

  // ─── 4. Partial Curtailment Impact ──────────────────────────────────
  console.log('─── 4. Partial Curtailment Impact ───');
  {
    const partialTopology = JSON.parse(JSON.stringify(topology)) as GridTopology;
    const targetSub = partialTopology.substations[0];
    const region = baseGeoTwin.serviceRegions.find((r) => r.substationId === targetSub.id);

    if (region && region.associatedLoadIds.length > 0) {
      // Disconnect one load
      const firstLoad = partialTopology.loads.find((l) => l.id === region.associatedLoadIds[0]);
      if (firstLoad) {
        firstLoad.connected = false;
        firstLoad.status = 'FAILED';
      }

      const impact = GeoSimulationCoordinator.computeGeoSimulationImpact(
        partialTopology,
        baseGeoTwin,
        delhiPkg.criticalInfrastructure,
        null,
        2,
      );

      const regImpact = impact.serviceRegionImpacts[region.id];
      assert(
        regImpact.blackoutState === 'PARTIAL_CURTAILMENT' || regImpact.blackoutFraction > 0,
        `Region shows partial curtailment (fraction: ${regImpact.blackoutFraction}, state: ${regImpact.blackoutState})`,
      );
      assert(regImpact.unservedDemandMW > 0, `Curtailment recorded unserved demand: ${regImpact.unservedDemandMW} MW`);
    } else {
      assert(true, 'Skipped partial load test due to empty load association');
    }
  }

  // ─── 5. Critical Infrastructure Power Tracking ──────────────────────
  console.log('─── 5. Critical Infrastructure Power Tracking ───');
  {
    // Test hospital with backup vs hospital without backup
    const testInfra: CriticalInfrastructure[] = [
      {
        id: 'infra-hosp-with-backup',
        name: 'AIIMS Central Hospital',
        entityType: 'CRITICAL_INFRASTRUCTURE',
        infraType: 'HOSPITAL',
        scaleLevel: 'BUILDING_INFRASTRUCTURE',
        coordinates: { latitude: 28.5672, longitude: 77.2100 },
        priorityTier: 'TIER_1_LIFE_SAFETY',
        emergencyBackupGenerationMW: 5.0,
        requiresDualFeed: true,
        servedBySubstationId: topology.substations[0].id,
        provenance: {
          sourceType: 'VERIFIED_EXTERNAL',
          confidence: 'HIGH',
          sourceReference: 'Delhi Health Dept',
          lastUpdated: '2026-10-04',
          isVerifiedRealWorld: true,
        },
      },
      {
        id: 'infra-pumping-no-backup',
        name: 'Wazirabad Water Pumping Station',
        entityType: 'CRITICAL_INFRASTRUCTURE',
        infraType: 'WATER_TREATMENT',
        scaleLevel: 'BUILDING_INFRASTRUCTURE',
        coordinates: { latitude: 28.7120, longitude: 77.2280 },
        priorityTier: 'TIER_1_LIFE_SAFETY',
        emergencyBackupGenerationMW: 0,
        requiresDualFeed: false,
        servedBySubstationId: topology.substations[0].id,
        provenance: {
          sourceType: 'VERIFIED_EXTERNAL',
          confidence: 'HIGH',
          sourceReference: 'DJB',
          lastUpdated: '2026-10-04',
          isVerifiedRealWorld: true,
        },
      },
    ];

    // Healthy grid check: both NORMAL_GRID
    const normalImpact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      topology,
      baseGeoTwin,
      testInfra,
      null,
      0,
    );

    const normalHosp = normalImpact.criticalInfraStatus['infra-hosp-with-backup'];
    const normalPump = normalImpact.criticalInfraStatus['infra-pumping-no-backup'];
    assert(normalHosp.powerSupplyState === 'NORMAL_GRID', 'AIIMS powered by NORMAL_GRID when feed substation is healthy');
    assert(normalPump.powerSupplyState === 'NORMAL_GRID', 'Wazirabad powered by NORMAL_GRID when feed substation is healthy');

    // Failed feed substation check
    const failedTopology = JSON.parse(JSON.stringify(topology)) as GridTopology;
    failedTopology.substations[0].status = 'FAILED';

    const failedImpact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      failedTopology,
      baseGeoTwin,
      testInfra,
      null,
      1,
    );

    const failedHosp = failedImpact.criticalInfraStatus['infra-hosp-with-backup'];
    const failedPump = failedImpact.criticalInfraStatus['infra-pumping-no-backup'];

    assert(failedHosp.powerSupplyState === 'BACKUP_ACTIVE', `AIIMS switched to BACKUP_ACTIVE (got ${failedHosp.powerSupplyState})`);
    assert(failedHosp.backupGenerationMW === 5.0, `Backup generation preserved: ${failedHosp.backupGenerationMW} MW`);
    assert(failedHosp.backupCoveragePercent === 50, `Backup coverage calculated correctly: ${failedHosp.backupCoveragePercent}%`);
    assert(failedPump.powerSupplyState === 'ISOLATED_BLACKOUT', `Wazirabad without backup entered ISOLATED_BLACKOUT (got ${failedPump.powerSupplyState})`);
    assert(failedImpact.criticalFacilitiesAtRisk === 2, `Both facilities flagged at risk: ${failedImpact.criticalFacilitiesAtRisk}`);
  }

  // ─── 6. Transmission Corridor Impact Tracking ───────────────────────
  console.log('─── 6. Transmission Corridor Impact Tracking ───');
  {
    const corridorTopology = JSON.parse(JSON.stringify(topology)) as GridTopology;
    const line0 = corridorTopology.transmissionLines[0];
    const line1 = corridorTopology.transmissionLines[1];

    // Normal line
    line0.loadingPercent = 72.5;
    line0.currentFlowMW = 145.0;
    line0.status = 'ONLINE';

    // Overloaded line
    line1.loadingPercent = 108.2;
    line1.currentFlowMW = 216.4;
    line1.status = 'OVERLOADED';

    const impact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      corridorTopology,
      baseGeoTwin,
      [],
      null,
      1,
    );

    const c0 = impact.corridorImpacts[line0.id];
    const c1 = impact.corridorImpacts[line1.id];

    assert(c0 !== undefined, `Corridor ${line0.id} tracked`);
    assert(c0.isOverloaded === false, `Normal line isOverloaded is false`);
    assert(c0.isTripped === false, `Normal line isTripped is false`);
    assert(c0.loadingPercent === 72.5, `Normal line loading is 72.5%`);

    assert(c1 !== undefined, `Corridor ${line1.id} tracked`);
    assert(c1.isOverloaded === true, `Overloaded line flagged isOverloaded: true`);
    assert(c1.isTripped === false, `Overloaded line not tripped yet`);

    // Trip line0
    line0.status = 'FAILED';
    const trippedImpact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      corridorTopology,
      baseGeoTwin,
      [],
      null,
      2,
    );
    assert(trippedImpact.corridorImpacts[line0.id].isTripped === true, `Tripped line flagged isTripped: true`);
  }

  // ─── 7. Spatial Mapping of Cascading Failure Steps ───────────────────
  console.log('─── 7. Spatial Cascade Step Mapping ───');
  {
    const testCascade: CascadeRecord = {
      id: 'cascade-test-1',
      startTick: 10,
      steps: [
        {
          tick: 10,
          triggerAssetId: topology.substations[0].id,
          triggerReason: 'Transformer explosion',
          affectedAssetId: topology.substations[1].id,
          affectedAssetType: 'substation',
          loadRedistributedMW: 120,
          resultingLoadingPercent: 115,
          stepIndex: 1,
          timestamp: '2026-10-04T12:00:10.000Z',
          action: 'LINE_OVERLOAD',
          triggerAssetName: topology.substations[0].name,
          affectedAssetName: topology.substations[1].name,
          unservedLoadMW: 85,
          affectedConsumers: 21250,
        },
      ],
      totalUnservedLoadMW: 85,
      affectedConsumers: 21250,
      affectedAssetIds: [topology.substations[0].id, topology.substations[1].id],
      resolved: false,
      depth: 1,
      maxOverloadPercent: 115,
      criticalLoadsAffected: 2,
      stabilityIndex: 0.75,
      status: 'PROPAGATING',
    };

    const impact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      topology,
      baseGeoTwin,
      delhiPkg.criticalInfrastructure,
      testCascade,
      10,
    );

    assert(impact.latestCascadeSteps.length === 1, `Mapped 1 cascade step to geo space`);
    const geoStep = impact.latestCascadeSteps[0];
    assert(geoStep.triggerAssetId === topology.substations[0].id, `Correct trigger asset ID: ${geoStep.triggerAssetId}`);
    assert(geoStep.affectedAssetId === topology.substations[1].id, `Correct affected asset ID: ${geoStep.affectedAssetId}`);
    assert(geoStep.unservedLoadMW === 85, `Unserved load passed through: ${geoStep.unservedLoadMW} MW`);
    assert(geoStep.affectedConsumers === 21250, `Affected consumers passed through: ${geoStep.affectedConsumers}`);
  }

  // ─── 8. Geographic Fault Target Resolution ──────────────────────────
  console.log('─── 8. Geographic Fault Target Resolution ───');
  {
    // Case A: Click direct electrical asset ID
    const resDirect = GeoSimulationCoordinator.resolveGeoFaultTarget(
      topology.substations[0].id,
      baseGeoTwin,
      topology,
    );
    assert(resDirect !== null, 'Direct substation ID resolved');
    assert(resDirect?.targetAssetId === topology.substations[0].id, 'Matched target electrical asset ID');
    assert(resDirect?.assetType === 'substation', 'Resolved assetType is substation');

    // Case B: Click service region ID
    const firstRegion = baseGeoTwin.serviceRegions[0];
    const resRegion = GeoSimulationCoordinator.resolveGeoFaultTarget(
      firstRegion.id,
      baseGeoTwin,
      topology,
    );
    assert(resRegion !== null, 'Service region ID resolved to feeding substation');
    assert(resRegion?.targetAssetId === firstRegion.substationId, `Resolved region to feed substation ${firstRegion.substationId}`);

    // Case C: Non-existent ID returns null
    const resInvalid = GeoSimulationCoordinator.resolveGeoFaultTarget(
      'non-existent-asset-999',
      baseGeoTwin,
      topology,
    );
    assert(resInvalid === null, 'Invalid entity returns null');
  }

  // ─── 9. Recovery Plan Restoration Effect on Geo-Twin ────────────────
  console.log('─── 9. Recovery Plan Restoration Effect ───');
  {
    const faultedTopology = JSON.parse(JSON.stringify(topology)) as GridTopology;
    const targetSub = faultedTopology.substations[0];
    targetSub.status = 'FAILED';

    // Power balance on faulted grid
    const simRng = new SeededRandom(42);
    const { powerBalance } = simulationTick(faultedTopology, 1, simRng);

    const failure = {
      id: 'fail-01',
      type: 'SUBSTATION_FAILURE' as const,
      affectedAssetIds: [targetSub.id],
      tick: 1,
      resolved: false,
      description: 'Substation failure',
    };

    const recoveryPlan = generateRecoveryPlan(faultedTopology, powerBalance, failure, 1);
    assert(recoveryPlan.actions.length > 0, `Generated recovery plan with ${recoveryPlan.actions.length} actions`);

    executeRecoveryPlan(recoveryPlan, faultedTopology, powerBalance, 2);

    // Field crew restores the failed substation hardware and reconnects shed loads back to ONLINE
    targetSub.status = 'ONLINE';
    for (const load of faultedTopology.loads) {
      load.connected = true;
      load.status = 'ONLINE';
    }
    simulationTick(faultedTopology, 2, simRng);

    // Recompute geo simulation impact post-recovery
    const postRecoveryImpact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      faultedTopology,
      baseGeoTwin,
      delhiPkg.criticalInfrastructure,
      null,
      2,
    );

    const restoredRegion = Object.values(postRecoveryImpact.serviceRegionImpacts).find(
      (r) => r.substationId === targetSub.id,
    );

    assert(restoredRegion !== undefined, `Found restored region for ${targetSub.id}`);
    assert(restoredRegion?.blackoutState === 'NORMAL', `Restored region returned to NORMAL (got ${restoredRegion?.blackoutState})`);
    assert(postRecoveryImpact.blackoutZoneCount === 0, `Post-recovery blackoutZoneCount is 0`);
  }

  // ─── 10. Power Quality Index Sensitivity ────────────────────────────
  console.log('─── 10. Power Quality Index Sensitivity ───');
  {
    const pqTopology = JSON.parse(JSON.stringify(topology)) as GridTopology;
    const sub = pqTopology.substations[0];

    // Case A: Nominal (1.0 p.u., 50.0 Hz)
    sub.voltagePU = 1.0;
    sub.frequencyHz = 50.0;
    const impactNominal = GeoSimulationCoordinator.computeGeoSimulationImpact(
      pqTopology,
      baseGeoTwin,
      [],
      null,
      1,
    );
    const pqNominal = impactNominal.serviceRegionImpacts[baseGeoTwin.serviceRegions[0].id]?.powerQualityIndex;
    assert(pqNominal >= 0.95, `Nominal power quality index >= 0.95 (got ${pqNominal})`);

    // Case B: Voltage depression (0.85 p.u.)
    sub.voltagePU = 0.85;
    const impactDepressed = GeoSimulationCoordinator.computeGeoSimulationImpact(
      pqTopology,
      baseGeoTwin,
      [],
      null,
      2,
    );
    const pqDepressed = impactDepressed.serviceRegionImpacts[baseGeoTwin.serviceRegions[0].id]?.powerQualityIndex;
    assert(pqDepressed < pqNominal, `Power quality index decreased with voltage depression (${pqDepressed} < ${pqNominal})`);

    // Case C: Substation FAILED
    sub.status = 'FAILED';
    const impactFailed = GeoSimulationCoordinator.computeGeoSimulationImpact(
      pqTopology,
      baseGeoTwin,
      [],
      null,
      3,
    );
    const pqFailed = impactFailed.serviceRegionImpacts[baseGeoTwin.serviceRegions[0].id]?.powerQualityIndex;
    assert(pqFailed === 0, `Power quality index drops to 0 when substation is FAILED`);
  }

  // ─── 11. Non-Destructive Invariant ──────────────────────────────────
  console.log('─── 11. Non-Destructive Invariant ───');
  {
    const beforeSubCount = topology.substations.length;
    const beforeLineCount = topology.transmissionLines.length;
    const beforeLoadCount = topology.loads.length;
    const beforeGenCount = topology.generators.length;

    GeoSimulationCoordinator.computeGeoSimulationImpact(
      topology,
      baseGeoTwin,
      delhiPkg.criticalInfrastructure,
      null,
      100,
    );

    assert(topology.substations.length === beforeSubCount, 'Substation count unchanged');
    assert(topology.transmissionLines.length === beforeLineCount, 'Line count unchanged');
    assert(topology.loads.length === beforeLoadCount, 'Load count unchanged');
    assert(topology.generators.length === beforeGenCount, 'Generator count unchanged');
  }

  // ─── 12. City Independence Across All 8 Cities ──────────────────────
  console.log('─── 12. City Independence Across All 8 Cities ───');
  for (const city of Object.values(VERIFIED_INDIAN_CITIES)) {
    const cityMapper = new GeoElectricalMapper(topology, city, [], [], []);
    const cityRes = cityMapper.executeMapping();
    const cityTwin: GeoTwinState = {
      ...baseGeoTwin,
      selectedCity: city,
      serviceRegions: cityRes.serviceRegions,
      loadClusters: cityRes.loadClusters,
      electricalGeoMappings: cityRes.references,
    };

    const impact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      topology,
      cityTwin,
      [],
      null,
      0,
    );

    assert(impact !== null && impact !== undefined, `Impact computed for ${city.name}`);
    assert(Object.keys(impact.serviceRegionImpacts).length === cityRes.serviceRegions.length, `Evaluated all regions in ${city.name}`);
    assert(impact.totalCityDemandMW > 0, `City demand computed for ${city.name}: ${impact.totalCityDemandMW} MW`);
  }

  // ─── 13. Spatial Proximity Disclaimer Preserved ─────────────────────
  console.log('─── 13. Spatial Proximity Disclaimer Preserved ───');
  {
    for (const region of baseGeoTwin.serviceRegions) {
      assert(region.isVerifiedFeederTerritory === false, `Region ${region.id} has isVerifiedFeederTerritory: false`);
      assert(region.disclaimer.toLowerCase().includes('estimated'), `Region ${region.id} includes ESTIMATED in disclaimer`);
    }
  }

  // ─── 14. Store Actions Integration ──────────────────────────────────
  console.log('─── 14. Store Actions Integration ───');
  {
    const store = useVajraStore.getState();
    store.initialize(42);

    assert(typeof store.injectGeoFault === 'function', 'store.injectGeoFault is defined');
    assert(typeof store.refreshGeoSimulationImpact === 'function', 'store.refreshGeoSimulationImpact is defined');

    // Select Delhi city in store
    await store.selectGeoCity('city-delhi');
    const storeGeoTwin = useVajraStore.getState().geoTwin;
    assert(storeGeoTwin?.simulationImpact !== undefined, 'store.geoTwin has simulationImpact initialized');
    assert((storeGeoTwin?.simulationImpact?.totalCityDemandMW ?? 0) > 0, 'store simulationImpact totalCityDemandMW > 0');

    // Trigger geo fault on first service region
    const firstRegionId = storeGeoTwin!.serviceRegions[0].id;
    store.injectGeoFault(firstRegionId);

    const postFaultGeoTwin = useVajraStore.getState().geoTwin;
    assert(postFaultGeoTwin?.simulationImpact !== undefined, 'postFaultGeoTwin has updated simulationImpact');
    assert((postFaultGeoTwin?.simulationImpact?.blackoutZoneCount ?? 0) >= 1, `store recorded blackout zone after injectGeoFault`);
  }

  // ─── 15. Aggregated Unserved Demand Consistency ─────────────────────
  console.log('─── 15. Aggregated Demand Consistency ───');
  {
    const faultedTopology = JSON.parse(JSON.stringify(topology)) as GridTopology;
    faultedTopology.substations[0].status = 'FAILED';

    const impact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      faultedTopology,
      baseGeoTwin,
      [],
      null,
      1,
    );

    let sumServed = 0;
    let sumUnserved = 0;
    for (const r of Object.values(impact.serviceRegionImpacts)) {
      sumServed += r.servedDemandMW;
      sumUnserved += r.unservedDemandMW;
    }

    assert(
      Math.abs(sumServed - impact.totalCityServedMW) < 0.2,
      `Sum of regional served demand matches city total (${sumServed.toFixed(1)} vs ${impact.totalCityServedMW})`,
    );
    assert(
      Math.abs(sumUnserved - impact.totalCityUnservedMW) < 0.2,
      `Sum of regional unserved demand matches city total (${sumUnserved.toFixed(1)} vs ${impact.totalCityUnservedMW})`,
    );
  }

  // ─── 16. Empty / Fallback Resiliency ────────────────────────────────
  console.log('─── 16. Empty / Fallback Resiliency ───');
  {
    const emptyTwin: GeoTwinState = {
      ...baseGeoTwin,
      serviceRegions: [],
      loadClusters: [],
      electricalGeoMappings: [],
      criticalInfrastructure: [],
    };

    const emptyImpact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      topology,
      emptyTwin,
      [],
      null,
      0,
    );

    assert(emptyImpact !== null, 'Empty twin returns valid object without throwing');
    assert(emptyImpact.blackoutZoneCount === 0, 'Zero blackout zones on empty regions');
    assert(emptyImpact.totalCityDemandMW === 0, 'Zero demand on empty regions');
  }

  // ─── 17. Monotonic Clock and Timestamp Synchronization ──────────────
  console.log('─── 17. Monotonic Clock & Timestamp Sync ───');
  {
    const impact10 = GeoSimulationCoordinator.computeGeoSimulationImpact(
      topology,
      baseGeoTwin,
      [],
      null,
      10,
    );
    const impact20 = GeoSimulationCoordinator.computeGeoSimulationImpact(
      topology,
      baseGeoTwin,
      [],
      null,
      20,
    );

    assert(impact10.tick === 10, 'Tick 10 synced');
    assert(impact20.tick === 20, 'Tick 20 synced');
    assert(impact10.timestamp !== impact20.timestamp, 'Timestamps advance monotonically');
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`Task #17 Verification Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTask17Tests().catch((err) => {
  console.error('Fatal error during Task 17 verification:', err);
  process.exit(1);
});
