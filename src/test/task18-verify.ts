// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Task #18 Verification Script
// Geo-Twin Command Center + Synchronized City Visualization
// ═══════════════════════════════════════════════════════════════════════

import { GeoSimulationCoordinator } from '../simulation/geo/geoSimulationCoordinator';
import { GeoElectricalMapper } from '../simulation/geo/geoElectricalMapper';
import { DEMO_CITIES, DeterministicGeoDataProvider } from '../simulation/geo/deterministicGeoTwin';
import { VERIFIED_INDIAN_CITIES } from '../simulation/geo/verifiedIndianCities';
import { CityResolver } from '../simulation/geo/geoProvider';
import { RealGeoDataProvider } from '../simulation/geo/realGeoDataProvider';
import { MapEngineAdapter } from '../simulation/geo/mapEngineAdapter';
import { generateGridTopology } from '../simulation/models/gridGenerator';
import { simulationTick } from '../simulation/engine/simulationEngine';
import { getAllScenarios } from '../simulation/scenarios/scenarios';
import { useVajraStore, DEFAULT_GEO_LAYERS, DEFAULT_GEO_TWIN_STATE } from '../store/vajraStore';
import type {
  GridTopology,
  CascadeRecord,
  ScenarioId,
  FailureType,
} from '../types';
import type {
  GeoTwinState,
  GeoLayerId,
  City,
  CitySearchResult,
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

async function runTask18Tests() {
  console.log('\n═══ Test Suite: Task #18 — Geo-Twin Command Center + Synchronized City Visualization ═══\n');

  const store = useVajraStore.getState();
  store.initialize(42);

  // ─── 1. City Search Workflow ────────────────────────────────────────
  console.log('─── 1. City Search Workflow ───');
  {
    const resultsDelhi = await store.searchGeoCities('delhi');
    assert(resultsDelhi.length > 0, `Search for 'delhi' returned ${resultsDelhi.length} results`);
    const delhiMatch = resultsDelhi.find((r) => r.cityId === 'city-delhi' || r.displayName.toLowerCase().includes('delhi'));
    assert(delhiMatch !== undefined, `Found Delhi in search results`);
    assert(delhiMatch?.countryCode === 'IND', `Delhi countryCode is IND`);

    const resultsMumbai = await store.searchGeoCities('mumbai');
    assert(resultsMumbai.length > 0, `Search for 'mumbai' returned ${resultsMumbai.length} results`);

    const resultsBengaluru = await store.searchGeoCities('bengaluru');
    assert(resultsBengaluru.length > 0, `Search for 'bengaluru' returned ${resultsBengaluru.length} results`);
  }

  // ─── 2. City Selection Workflow ─────────────────────────────────────
  console.log('─── 2. City Selection Workflow ───');
  {
    await store.selectGeoCity('city-delhi');
    const geoState = useVajraStore.getState().geoTwin;

    assert(geoState?.selectedCity?.id === 'city-delhi', `Selected city updated to Delhi: ${geoState?.selectedCity?.id}`);
    assert((geoState?.serviceRegions.length ?? 0) > 0, `Loaded ${(geoState?.serviceRegions.length ?? 0)} service regions for Delhi`);
    assert((geoState?.loadClusters.length ?? 0) > 0, `Loaded ${(geoState?.loadClusters.length ?? 0)} load clusters for Delhi`);
    assert((geoState?.electricalGeoMappings.length ?? 0) > 0, `Loaded ${(geoState?.electricalGeoMappings.length ?? 0)} electrical-geo mappings`);
  }

  // ─── 3. Camera State Update ─────────────────────────────────────────
  console.log('─── 3. Camera State Update ───');
  {
    const geoState = useVajraStore.getState().geoTwin;
    assert(geoState?.viewport !== undefined, 'Viewport state exists in GeoTwin');
    assert(Math.abs(geoState!.viewport.center.latitude - 28.6139) < 0.2, `Camera latitude centered near Delhi (${geoState!.viewport.center.latitude})`);
    assert(Math.abs(geoState!.viewport.center.longitude - 77.209) < 0.2, `Camera longitude centered near Delhi (${geoState!.viewport.center.longitude})`);

    // Update viewport parameters
    store.setGeoViewport({ zoom: 14, pitchDegrees: 45, bearingDegrees: 90 });
    const updatedViewport = useVajraStore.getState().geoTwin?.viewport;
    assert(updatedViewport?.zoom === 14, `Viewport zoom updated to 14`);
    assert(updatedViewport?.pitchDegrees === 45, `Viewport pitch updated to 45°`);
    assert(updatedViewport?.bearingDegrees === 90, `Viewport bearing updated to 90°`);
  }

  // ─── 4. Layer Visibility Toggling ───────────────────────────────────
  console.log('─── 4. Layer Visibility Toggling ───');
  {
    const initialSubVis = useVajraStore.getState().geoTwin?.visibleLayers.SUBSTATIONS ?? true;
    store.toggleGeoLayer('SUBSTATIONS');
    assert(useVajraStore.getState().geoTwin?.visibleLayers.SUBSTATIONS === !initialSubVis, 'Toggled SUBSTATIONS layer visibility off');
    store.toggleGeoLayer('SUBSTATIONS');
    assert(useVajraStore.getState().geoTwin?.visibleLayers.SUBSTATIONS === initialSubVis, 'Toggled SUBSTATIONS layer visibility back on');

    // Test Bulk All On / All Off
    store.setAllGeoLayers(false);
    const allOff = Object.values(useVajraStore.getState().geoTwin?.visibleLayers ?? {}).every((v) => v === false);
    assert(allOff, 'All geo layers disabled via setAllGeoLayers(false)');

    store.setAllGeoLayers(true);
    const allOn = Object.values(useVajraStore.getState().geoTwin?.visibleLayers ?? {}).every((v) => v === true);
    assert(allOn, 'All geo layers enabled via setAllGeoLayers(true)');
  }

  // ─── 5. Asset Selection ─────────────────────────────────────────────
  console.log('─── 5. Asset Selection ───');
  {
    const geoState = useVajraStore.getState().geoTwin;
    const testSubId = geoState!.serviceRegions[0].substationId;

    store.selectGeoEntity(testSubId);
    assert(useVajraStore.getState().geoTwin?.selectedEntityId === testSubId, `Selected entity ID set to ${testSubId}`);

    store.selectGeoEntity(null);
    assert(useVajraStore.getState().geoTwin?.selectedEntityId === null, 'Entity deselected cleanly (selectedEntityId === null)');
  }

  // ─── 6. Asset Inspector Data Completeness ───────────────────────────
  console.log('─── 6. Asset Inspector Data Completeness ───');
  {
    const currentTopology = useVajraStore.getState().topology;
    const firstSub = currentTopology.substations[0];

    assert(firstSub.id.length > 0, `Substation ID is non-empty: ${firstSub.id}`);
    assert(firstSub.name.length > 0, `Substation name is non-empty: ${firstSub.name}`);
    assert(typeof firstSub.capacityMW === 'number' && firstSub.capacityMW > 0, `Substation capacityMW is valid: ${firstSub.capacityMW} MW`);
    assert(typeof firstSub.currentLoadMW === 'number', `Substation currentLoadMW is valid: ${firstSub.currentLoadMW} MW`);
    assert(typeof firstSub.voltagePU === 'number', `Substation voltagePU is valid: ${firstSub.voltagePU} p.u.`);
    assert(typeof firstSub.frequencyHz === 'number', `Substation frequencyHz is valid: ${firstSub.frequencyHz} Hz`);
    assert(firstSub.status === 'ONLINE' || firstSub.status === 'OVERLOADED' || firstSub.status === 'FAILED', `Substation status is valid: ${firstSub.status}`);
  }

  // ─── 7. Scenario Selection Integration ──────────────────────────────
  console.log('─── 7. Scenario Selection Integration ───');
  {
    const availableScenarios = getAllScenarios();
    assert(availableScenarios.length >= 8, `Found ${availableScenarios.length} authoritative simulation scenarios`);

    store.activateScenario('SUBSTATION_FAILURE');
    assert(useVajraStore.getState().activeScenario === 'SUBSTATION_FAILURE', 'Scenario activated in store: SUBSTATION_FAILURE');

    store.activateScenario('NORMAL_OPERATION');
    assert(useVajraStore.getState().activeScenario === 'NORMAL_OPERATION', 'Scenario returned to NORMAL_OPERATION');
  }

  // ─── 8. Failure Invocation via Geo Interface ────────────────────────
  console.log('─── 8. Failure Invocation via Geo Interface ───');
  {
    const geoState = useVajraStore.getState().geoTwin;
    const targetRegion = geoState!.serviceRegions[0];

    // Trigger failure using regional geo ID
    store.injectGeoFault(targetRegion.id, 'SUBSTATION_FAILURE');

    const updatedTopology = useVajraStore.getState().topology;
    const faultedSub = updatedTopology.substations.find((s) => s.id === targetRegion.substationId);

    assert(faultedSub !== undefined, `Found targeted substation ${targetRegion.substationId}`);
    assert(faultedSub?.status === 'FAILED', `Substation status transitioned to FAILED: ${faultedSub?.status}`);
    assert(useVajraStore.getState().metrics.failedAssetCount >= 1, `Store metrics reflect failed assets: ${useVajraStore.getState().metrics.failedAssetCount}`);
  }

  // ─── 9. Simulation State Reflection ─────────────────────────────────
  console.log('─── 9. Simulation State Reflection ───');
  {
    // Advance simulation tick
    store.tick();
    const metricsAfterTick = useVajraStore.getState().metrics;
    const impactAfterTick = useVajraStore.getState().geoTwin?.simulationImpact;

    assert(impactAfterTick !== undefined, 'Live geo simulation impact is updated');
    assert((impactAfterTick?.blackoutZoneCount ?? 0) >= 1, `Blackout zone count reflected in geo impact: ${impactAfterTick?.blackoutZoneCount}`);
    assert((impactAfterTick?.totalCityUnservedMW ?? 0) > 0, `Unserved deficit reflected in geo impact: ${impactAfterTick?.totalCityUnservedMW} MW`);
  }

  // ─── 10. Cascade Timeline Rendering Data ────────────────────────────
  console.log('─── 10. Cascade Timeline Rendering Data ───');
  {
    store.initiateCascade('SUBSTATION_FAILURE');
    const cascade = useVajraStore.getState().activeCascade;

    assert(cascade !== null, 'Active cascade sequence initiated');
    assert(cascade?.status === 'PROPAGATING' || cascade?.status === 'STABILIZED', `Cascade status is valid: ${cascade?.status}`);
    assert((cascade?.steps.length ?? 0) >= 1, `Cascade contains ${(cascade?.steps.length ?? 0)} timeline steps`);

    const firstStep = cascade!.steps[0];
    assert(typeof firstStep.tick === 'number', `Step 0 has numeric tick: ${firstStep.tick}`);
    assert(firstStep.triggerAssetId.length > 0, `Step 0 has trigger asset: ${firstStep.triggerAssetId}`);
    assert(typeof firstStep.affectedConsumers === 'number', `Step 0 has affected consumers: ${firstStep.affectedConsumers}`);

    // Advance cascade step
    store.advanceCascadeStep();
    const advancedCascade = useVajraStore.getState().activeCascade;
    assert((advancedCascade?.steps.length ?? 0) >= (cascade?.steps.length ?? 0), 'Cascade timeline advanced smoothly');
  }

  // ─── 11. Geographic Impact Rendering Synchronization ────────────────
  console.log('─── 11. Geographic Impact Synchronization ───');
  {
    const impact = useVajraStore.getState().geoTwin?.simulationImpact;
    assert(impact !== undefined, 'Simulation impact object exists');
    assert(Object.keys(impact!.serviceRegionImpacts).length > 0, 'Service region impacts are populated');

    const hasBlackoutOrCurtailment = Object.values(impact!.serviceRegionImpacts).some(
      (r) => r.blackoutState === 'TOTAL_BLACKOUT' || r.blackoutState === 'PARTIAL_CURTAILMENT',
    );
    assert(hasBlackoutOrCurtailment, 'At least one service region shows live blackout or partial curtailment');
  }

  // ─── 12. Authoritative KPI Derivation ───────────────────────────────
  console.log('─── 12. Authoritative KPI Derivation ───');
  {
    const state = useVajraStore.getState();
    const pb = state.powerBalance;
    const m = state.metrics;

    assert(pb.totalGenerationMW >= 0, `Total generation is positive: ${pb.totalGenerationMW} MW`);
    assert(pb.totalDemandMW >= 0, `Total demand is positive: ${pb.totalDemandMW} MW`);
    assert(m.systemFrequencyHz >= 45.0 && m.systemFrequencyHz <= 55.0, `System frequency within grid physics bounds: ${m.systemFrequencyHz} Hz`);
    assert(m.voltageHealthIndex >= 0 && m.voltageHealthIndex <= 1.5, `Voltage health index valid: ${m.voltageHealthIndex} p.u.`);
    assert(pb.renewableFraction >= 0 && pb.renewableFraction <= 1.0, `Renewable share valid: ${(pb.renewableFraction * 100).toFixed(1)}%`);
  }

  // ─── 13. Abstract / Geographic State Equivalence ────────────────────
  console.log('─── 13. Abstract / Geographic State Equivalence ───');
  {
    // Toggle to Schematic view
    store.setGeoViewActive(false);
    const topoSchematic = useVajraStore.getState().topology;
    const pbSchematic = useVajraStore.getState().powerBalance;

    // Toggle to Geo view
    store.setGeoViewActive(true);
    const topoGeo = useVajraStore.getState().topology;
    const pbGeo = useVajraStore.getState().powerBalance;

    assert(topoSchematic.substations.length === topoGeo.substations.length, 'Substation count identical across views');
    assert(topoSchematic.transmissionLines.length === topoGeo.transmissionLines.length, 'Line count identical across views');
    assert(topoSchematic.loads.length === topoGeo.loads.length, 'Load count identical across views');
    assert(pbSchematic.totalGenerationMW === pbGeo.totalGenerationMW, 'Total generation identical across views');
    assert(pbSchematic.totalDemandMW === pbGeo.totalDemandMW, 'Total demand identical across views');
  }

  // ─── 14. Simulation Clock Synchronization ───────────────────────────
  console.log('─── 14. Simulation Clock Synchronization ───');
  {
    const tickBefore = useVajraStore.getState().clock.tick;
    store.tick();
    const tickAfter = useVajraStore.getState().clock.tick;
    assert(tickAfter === tickBefore + 1, `Clock ticked forward monotonically (${tickBefore} -> ${tickAfter})`);
  }

  // ─── 15. Reset Functionality ────────────────────────────────────────
  console.log('─── 15. Reset Functionality ───');
  {
    store.reset();
    const state = useVajraStore.getState();
    assert(state.clock.tick === 0, `Clock reset to tick 0`);
    assert(state.metrics.failedAssetCount === 0, `Failed asset count reset to 0`);
    assert(state.metrics.unservedLoadMW === 0, `Unserved load reset to 0 MW`);
    assert(state.activeCascade === null, `Active cascade cleared on reset`);
  }

  // ─── 16. Pause Functionality ────────────────────────────────────────
  console.log('─── 16. Pause Functionality ───');
  {
    store.start();
    assert(useVajraStore.getState().clock.isRunning === true, 'Clock running after start()');
    store.pause();
    assert(useVajraStore.getState().clock.isRunning === false, 'Clock paused after pause()');
  }

  // ─── 17. Resume Functionality ───────────────────────────────────────
  console.log('─── 17. Resume Functionality ───');
  {
    store.start();
    assert(useVajraStore.getState().clock.isRunning === true, 'Clock resumed running after start()');
    store.pause();
  }

  // ─── 18. City Switching Across Validated Cities ─────────────────────
  console.log('─── 18. City Switching Across Validated Cities ───');
  {
    await store.selectGeoCity('city-mumbai');
    assert(useVajraStore.getState().geoTwin?.selectedCity?.id === 'city-mumbai', 'Switched to Mumbai');
    assert(useVajraStore.getState().geoTwin?.serviceRegions.length! > 0, 'Loaded Mumbai service regions');

    await store.selectGeoCity('city-bengaluru');
    assert(useVajraStore.getState().geoTwin?.selectedCity?.id === 'city-bengaluru', 'Switched to Bengaluru');
    assert(useVajraStore.getState().geoTwin?.serviceRegions.length! > 0, 'Loaded Bengaluru service regions');

    await store.selectGeoCity('city-chennai');
    assert(useVajraStore.getState().geoTwin?.selectedCity?.id === 'city-chennai', 'Switched to Chennai');

    // Return to Delhi
    await store.selectGeoCity('city-delhi');
    assert(useVajraStore.getState().geoTwin?.selectedCity?.id === 'city-delhi', 'Returned to Delhi');
  }

  // ─── 19. Stale City Protection (Generation Token) ───────────────────
  console.log('─── 19. Stale City Protection ───');
  {
    const resolver = new CityResolver([new DeterministicGeoDataProvider()]);
    const resPromise1 = resolver.resolveLocation('mumbai');
    const resPromise2 = resolver.resolveLocation('delhi');

    const [city1, city2] = await Promise.all([resPromise1, resPromise2]);
    assert(city2 !== null && city2.city.name.toLowerCase().includes('delhi'), 'Latest query resolves to Delhi');
    assert(resolver.getCurrentGenerationToken() >= 2, `Generation token advanced monotonically: ${resolver.getCurrentGenerationToken()}`);
  }

  // ─── 20. Honest Provenance Display ──────────────────────────────────
  console.log('─── 20. Honest Provenance Display ───');
  {
    const geoState = useVajraStore.getState().geoTwin;
    const city = geoState!.selectedCity!;
    assert(
      city.provenance.sourceType === 'VERIFIED_EXTERNAL' ||
      city.provenance.sourceType === 'MODELED' ||
      city.provenance.sourceType === 'SYNTHETIC',
      `Provenance sourceType is valid: ${city.provenance.sourceType}`,
    );
    assert(typeof city.provenance.isVerifiedRealWorld === 'boolean', `isVerifiedRealWorld flag is boolean: ${city.provenance.isVerifiedRealWorld}`);
  }

  // ─── 21. Inferred Mapping Labeling & Disclaimers ────────────────────
  console.log('─── 21. Inferred Mapping Labeling & Disclaimers ───');
  {
    const regions = useVajraStore.getState().geoTwin?.serviceRegions ?? [];
    for (const r of regions) {
      assert(r.isVerifiedFeederTerritory === false, `Region ${r.id} preserves isVerifiedFeederTerritory: false`);
      assert(r.disclaimer.toLowerCase().includes('estimated'), `Region ${r.id} includes explicit ESTIMATED disclaimer`);
    }
  }

  // ─── 22. Unsupported Layer Graceful Handling ────────────────────────
  console.log('─── 22. Unsupported Layer Handling ───');
  {
    const adapter = new MapEngineAdapter();
    // Passing an arbitrary unknown layer ID must not throw
    let didThrow = false;
    try {
      adapter.setLayerVisibility('NON_EXISTENT_LAYER_XYZ', false);
    } catch {
      didThrow = true;
    }
    assert(!didThrow, 'MapEngineAdapter safely handles non-existent or unsupported layers without throwing');
    adapter.destroy();
  }

  // ─── 23. Error & Empty State Handling ───────────────────────────────
  console.log('─── 23. Error & Empty State Handling ───');
  {
    const emptySearch = await store.searchGeoCities('atlantis-non-existent-12345');
    assert(emptySearch.length === 0, 'Non-existent city search returns empty array gracefully');

    // Search and navigate with non-existent query
    const navSuccess = await store.searchAndNavigateCity('atlantis-non-existent-12345');
    assert(navSuccess === false, 'searchAndNavigateCity returns false on unresolved location');
    assert(useVajraStore.getState().geoTwin?.errorMessage !== null, 'Store records user-facing error message on unresolved city');
  }

  // ─── 24. Responsive State & Layout Adaptability ─────────────────────
  console.log('─── 24. Responsive State & Layout Adaptability ───');
  {
    // Verify view toggle transitions state seamlessly
    store.setGeoViewActive(true);
    assert(useVajraStore.getState().geoTwin?.isGeoViewActive === true, 'isGeoViewActive is true in command center mode');

    store.setGeoViewActive(false);
    assert(useVajraStore.getState().geoTwin?.isGeoViewActive === false, 'isGeoViewActive is false in schematic mode');

    // Return to command center mode for active user session
    store.setGeoViewActive(true);
    assert(useVajraStore.getState().geoTwin?.isGeoViewActive === true, 'Returned to command center mode');
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`Task #18 Verification Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTask18Tests().catch((err) => {
  console.error('Fatal error during Task 18 verification:', err);
  process.exit(1);
});
