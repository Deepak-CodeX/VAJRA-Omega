// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Phase 1 Verification Script
// Canonical Asset Graph Unification in Simulation Kernel
// ═══════════════════════════════════════════════════════════════════════

import { useVajraStore } from '../store/vajraStore';
import { CANONICAL_POWER_ASSETS, CANONICAL_CITIES_REGISTRY } from '../data/canonicalCitiesData';
import { buildCanonicalTopology } from '../simulation/models/canonicalGridBuilder';
import { generateGridTopology } from '../simulation/models/gridGenerator';
import { simulationTick } from '../simulation/engine/simulationEngine';
import { SeededRandom } from '../lib/utils';
import { DeterministicGeoDataProvider } from '../simulation/geo/deterministicGeoTwin';

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

async function runPhase1UnificationTests() {
  console.log('\n═══ Test Suite: Phase 1 — Canonical Asset Graph Unification ═══\n');

  // ─── 1. Canonical Topology Builder Verification ──────────────────────
  console.log('─── 1. Canonical Topology Builder Verification ───');
  {
    const topo = buildCanonicalTopology('city-delhi', { seed: 42 });
    assert(topo.substations.length > 0, 'Delhi canonical substations loaded into topology');
    assert(topo.generators.length > 0, 'Delhi canonical generators loaded into topology');
    assert(topo.loads.length > 0, 'Delhi distribution loads created from canonical substations');
    assert(topo.transmissionLines.length > 0, 'Delhi transmission lines built from canonical relations');

    // Verify canonical asset IDs retained
    const badarpur = topo.substations.find((s) => s.id === 'del-sub-badarpur-400kv');
    assert(badarpur !== undefined, 'Badarpur retains canonical ID del-sub-badarpur-400kv');
    assert(badarpur?.capacityMW === 900, 'Badarpur retains canonical capacity derived from 1000 MVA (900 MW)');
    assert(badarpur?.geoRef !== undefined && badarpur.geoRef.provenance.confidence === 'HIGH', 'Badarpur retains canonical geoRef provenance metadata');

    const pragati = topo.generators.find((g) => g.id === 'del-gen-pragati-ccgt');
    assert(pragati !== undefined, 'Pragati retains canonical ID del-gen-pragati-ccgt');
    assert(pragati?.capacityMW === 297, 'Pragati retains canonical capacity derived from 330 MVA (297 MW)');

    // Verify verified vs inferred line IDs
    const verifiedLine = topo.transmissionLines.find((l) => l.id.startsWith('line-'));
    assert(verifiedLine !== undefined, 'Verified transmission lines use canonical "line-" prefix');

    const inferredLine = topo.transmissionLines.find((l) => l.id.startsWith('inferred-line-'));
    assert(inferredLine !== undefined, 'Inferred transmission lines strictly use "inferred-line-" prefix');
  }

  // ─── 2. Production vajraStore Default Simulation Engine Consumption ─
  console.log('─── 2. Production vajraStore Default Consumption ───');
  {
    const store = useVajraStore.getState();
    store.initialize(42);

    const topo = useVajraStore.getState().topology;
    const hasCanonicalDelhiSub = topo.substations.some((s) => s.id === 'del-sub-badarpur-400kv');
    assert(hasCanonicalDelhiSub, 'Store default initialization consumes canonical Delhi assets');

    const hasCanonicalPragati = topo.generators.some((g) => g.id === 'del-gen-pragati-ccgt');
    assert(hasCanonicalPragati, 'Store default initialization consumes canonical Pragati generator');

    // Run tick
    store.tick();
    const updatedState = useVajraStore.getState();
    assert(updatedState.metrics.systemFrequencyHz > 49.0 && updatedState.metrics.systemFrequencyHz < 51.0, 'Default canonical simulation runs at nominal frequency');
    assert(updatedState.powerBalance.totalGenerationMW > 0, 'Canonical power balance generation > 0');
    assert(updatedState.powerBalance.totalDemandMW > 0, 'Canonical power balance demand > 0');
  }

  // ─── 3. Multi-City Canonical Switching ───────────────────────────────
  console.log('─── 3. Multi-City Canonical Switching ───');
  {
    const store = useVajraStore.getState();

    // Switch to Mumbai
    await store.selectGeoCity('city-mumbai');
    const mumTopo = useVajraStore.getState().topology;
    const hasKalwa = mumTopo.substations.some((s) => s.id === 'mum-sub-kalwa-400kv');
    assert(hasKalwa, 'Mumbai topology loaded canonical Kalwa 400kV substation');
    const hasTrombay = mumTopo.substations.some((s) => s.id === 'mum-sub-trombay-220kv');
    assert(hasTrombay, 'Mumbai topology loaded canonical Trombay 220kV substation');

    // Switch to Bengaluru
    await store.selectGeoCity('city-bengaluru');
    const blrTopo = useVajraStore.getState().topology;
    const hasHoodi = blrTopo.substations.some((s) => s.id === 'blr-sub-hoodi-400kv');
    assert(hasHoodi, 'Bengaluru topology loaded canonical Hoodi 400kV substation');

    // Switch back to Delhi
    await store.selectGeoCity('city-delhi');
    const delTopo = useVajraStore.getState().topology;
    assert(delTopo.substations.some((s) => s.id === 'del-sub-badarpur-400kv'), 'Switched cleanly back to canonical Delhi');
  }

  // ─── 4. Failure Injection on Canonical ID ────────────────────────────
  console.log('─── 4. Failure Injection on Canonical ID ───');
  {
    const store = useVajraStore.getState();
    store.initialize(42);
    await store.selectGeoCity('city-delhi');

    // Inject fault on Badarpur 400kV
    store.injectFault('SUBSTATION_FAILURE', ['del-sub-badarpur-400kv']);
    const afterFault = useVajraStore.getState();
    const badarpur = afterFault.topology.substations.find((s) => s.id === 'del-sub-badarpur-400kv');
    assert(badarpur?.status === 'FAILED', 'Badarpur status transitions to FAILED upon injection');
    assert(afterFault.failures.length > 0, 'Failure event recorded in store');
    assert(afterFault.failures[0].affectedAssetIds.includes('del-sub-badarpur-400kv'), 'Failure event references canonical Badarpur ID');

    // Step cascade
    store.advanceCascadeStep();
    const afterCascade = useVajraStore.getState();
    assert(afterCascade.activeCascade !== null, 'Cascade initiated from canonical asset failure');
  }

  // ─── 5. Reset Behavior ───────────────────────────────────────────────
  console.log('─── 5. Reset Behavior ───');
  {
    const store = useVajraStore.getState();
    store.reset();
    const resetState = useVajraStore.getState();
    assert(resetState.clock.tick === 0, 'Clock reset to 0');
    assert(resetState.failures.length === 0, 'Failures cleared upon reset');
    assert(resetState.topology.substations.every((s) => s.status === 'ONLINE'), 'All canonical substations restored to ONLINE');
  }

  // ─── 6. Synthetic Demo Data & Generator Preservation ─────────────────
  console.log('─── 6. Synthetic Demo Data & Generator Preservation ───');
  {
    // Ensure generateGridTopology still exists and functions for benchmarks
    const synthTopo = generateGridTopology({ seed: 99 });
    assert(synthTopo.substations.length === 12, 'Synthetic grid generator produces 12 substations as test fixture');
    assert(synthTopo.generators.length === 7, 'Synthetic grid generator produces 7 generators as test fixture');

    // Ensure DeterministicGeoDataProvider still provides synthetic demo packages
    const provider = new DeterministicGeoDataProvider();
    const pkg = await provider.loadCityTwin('city-delhi');
    assert(pkg !== null, 'DeterministicGeoDataProvider still loads demo package');
    assert(pkg!.provenanceSummary.syntheticCount > 0, 'Demo package explicitly labeled with SYNTHETIC provenance');
  }

  console.log(`\n══════════════════════════════════════════════════════`);
  console.log(`PHASE 1 VERIFICATION COMPLETE: ${passed} passed, ${failed} failed`);
  console.log(`══════════════════════════════════════════════════════\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1UnificationTests().catch((err) => {
  console.error('Phase 1 Verification Fatal Error:', err);
  process.exit(1);
});
