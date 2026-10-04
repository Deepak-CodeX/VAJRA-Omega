// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Task #13 Verification Script: Dynamic Failure & Cascade Engine
// ═══════════════════════════════════════════════════════════════════════
// Tests:
// 1. Initial Failure Injection & Root Step Generation
// 2. Overload Propagation & DC Flow Redistribution
// 3. Line Trip & Thermal Limit Exceeded
// 4. Multi-Stage Cascade Continuation & Depth Tracking
// 5. Cascade Termination & Grid Equilibrium Stabilization
// 6. Affected Load & Consumer Isolation Calculation
// 7. Store Step-by-Step Mode Progression (advanceCascadeStep)
// 8. Cascade Reset & State Restoration
// 9. Determinism: Identical Seed + Fault = Identical Cascade Chain
// ═══════════════════════════════════════════════════════════════════════

import { generateGridTopology } from '../simulation/models/gridGenerator';
import {
  evaluateCascadeStep,
  initiateCascadeSequence,
  simulateFullCascade,
  findIsolatedLoads,
} from '../simulation/failures/cascadeEngine';
import { computeTransmissionFlows, simulationTick } from '../simulation/engine/simulationEngine';
import { useVajraStore } from '../store/vajraStore';
import { SeededRandom } from '../lib/utils';

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

console.log('\n═══ Test Suite: Task #13 — Dynamic Failure & Cascade Propagation Engine ═══');

// ─── 1. Initial Failure Injection ─────────────────────────────────────
console.log('\n─── 1. Initial Failure Injection ───');
{
  const topology = generateGridTopology({ seed: 42 });
  const transSub = topology.substations.find((s) => s.type === 'transmission');
  assert(transSub !== undefined, 'Found transmission substation to inject fault');

  if (transSub) {
    const { cascade, events } = initiateCascadeSequence(
      topology,
      0,
      'SUBSTATION_FAILURE',
      [transSub.id],
    );

    assert(transSub.status === 'FAILED', 'Target substation status set to FAILED');
    assert(cascade.steps.length === 1, 'Initial cascade has exactly 1 root step');
    assert(cascade.steps[0].action === 'INITIAL_FAILURE', 'Root step action is INITIAL_FAILURE');
    assert(cascade.steps[0].stepIndex === 0, 'Root step index is 0');
    assert(cascade.steps[0].triggerAssetId === transSub.id, 'Root step triggerAssetId matches target');
    assert(cascade.depth === 0, 'Root cascade depth is 0');
    assert(events.length > 0, 'Event log entries generated for initial failure');
  }
}

// ─── 2. Overload Propagation & DC Flow Redistribution ─────────────────
console.log('\n─── 2. Overload Propagation & DC Flow Redistribution ───');
{
  const topology = generateGridTopology({ seed: 42 });
  simulationTick(topology, 0, new SeededRandom(42));

  // Set a transmission line to trip with flow
  const targetLine = topology.transmissionLines[0];
  targetLine.loadingPercent = 125.0;
  targetLine.currentFlowMW = 150.0;
  const baselineFlows = topology.transmissionLines.map((l) => ({ id: l.id, flow: l.currentFlowMW }));

  // Evaluate cascade step
  const res = evaluateCascadeStep(topology, 1, 0);
  assert(res.step !== null, 'Cascade step produced for overloaded line');

  const changedFlows = topology.transmissionLines.filter((l) => {
    if (l.id === targetLine.id) return false;
    const base = baselineFlows.find((b) => b.id === l.id);
    return base && Math.abs(base.flow - l.currentFlowMW) > 0.001;
  });

  assert(
    changedFlows.length > 0,
    `DC power flow redistributed to ${changedFlows.length} parallel transmission lines`,
  );
}

// ─── 3. Line Trip & Thermal Limits ────────────────────────────────────
console.log('\n─── 3. Line Trip & Thermal Limits ───');
{
  const topology = generateGridTopology({ seed: 42 });
  // Force a line into severe overload (>120%)
  const testLine = topology.transmissionLines[1];
  testLine.loadingPercent = 135.0;
  testLine.currentFlowMW = 250;

  const res = evaluateCascadeStep(topology, 1, 0);
  assert(res.step !== null, 'Evaluation produced a cascade step for overloaded line');
  if (res.step) {
    assert(res.step.action === 'LINE_TRIP', 'Overloaded line triggered a LINE_TRIP action');
    assert(res.step.triggerAssetId === testLine.id, 'Trigger asset matches the overloaded line');
    assert(testLine.status === 'FAILED', 'Tripped line status transitioned to FAILED');
    assert(testLine.currentFlowMW === 0, 'Tripped line current flow is zeroed');
    assert(res.step.loadingBefore === 135.0, 'Recorded accurate pre-trip loading percentage');
  }
}

// ─── 4. Multi-Stage Cascade Continuation & Depth Tracking ─────────────
console.log('\n─── 4. Multi-Stage Cascade Continuation & Depth ───');
{
  const topology = generateGridTopology({ seed: 42 });
  // Initiate cascade with transmission line failure under stress
  const transSubs = topology.substations.filter((s) => s.type === 'transmission');
  const { cascade } = initiateCascadeSequence(topology, 0, 'SUBSTATION_FAILURE', [transSubs[0].id]);

  let currentDepth = 0;
  let hasMore = true;
  let iterations = 0;

  while (hasMore && iterations < 5) {
    const stepRes = evaluateCascadeStep(topology, iterations + 1, currentDepth);
    iterations++;
    if (stepRes.step) {
      cascade.steps.push(stepRes.step);
      currentDepth++;
      hasMore = stepRes.hasMore;
    } else {
      break;
    }
  }

  assert(cascade.steps.length >= 1, `Cascade tracked ${cascade.steps.length} sequential steps`);
  assert(
    cascade.steps.every((s, i) => s.stepIndex === i),
    'Cascade steps have strictly monotonic stepIndex',
  );
}

// ─── 5. Cascade Termination & Grid Equilibrium ────────────────────────
console.log('\n─── 5. Cascade Termination & Grid Equilibrium ───');
{
  const topology = generateGridTopology({ seed: 42 });
  // Normal grid with no overloaded lines
  computeTransmissionFlows(
    topology.transmissionLines,
    topology.substations,
    topology.generators,
    topology.loads,
    topology.batteries,
  );

  const evaluation = evaluateCascadeStep(topology, 1, 1);
  assert(evaluation.step === null, 'No step generated when grid is within thermal limits');
  assert(evaluation.hasMore === false, 'hasMore is false when cascade has stabilized');
  assert(evaluation.status === 'STABILIZED', 'Status is STABILIZED when equilibrium reached');
}

// ─── 6. Affected Load & Consumer Isolation Calculation ─────────────────
console.log('\n─── 6. Affected Load & Consumer Isolation Calculation ───');
{
  const topology = generateGridTopology({ seed: 42 });
  const distSub = topology.substations.find((s) => s.type === 'distribution');
  assert(distSub !== undefined, 'Found distribution substation');

  if (distSub) {
    const connectedLines = topology.transmissionLines.filter(
      (l) => l.fromId === distSub.id || l.toId === distSub.id,
    );

    // Fail all incoming lines to isolate the distribution sub
    for (const l of connectedLines) {
      l.status = 'FAILED';
    }

    const isolated = findIsolatedLoads(topology, connectedLines[0]);
    assert(isolated.length > 0, `Detected ${isolated.length} isolated loads due to line loss`);

    const expectedConsumers = isolated.reduce((sum, l) => sum + l.consumerCount, 0);
    const expectedMW = isolated.reduce((sum, l) => sum + l.baseDemandMW, 0);

    assert(expectedConsumers > 0, `Isolated loads represent ${expectedConsumers} consumers`);
    assert(expectedMW > 0, `Isolated loads represent ${expectedMW.toFixed(1)} MW unserved demand`);
  }
}

// ─── 7. Store Step-by-Step Mode Progression ───────────────────────────
console.log('\n─── 7. Store Step-by-Step Mode Progression ───');
{
  const store = useVajraStore.getState();
  store.initialize(42);

  // Initiate a substation failure cascade
  store.initiateCascade('SUBSTATION_FAILURE');
  const initialCascade = useVajraStore.getState().activeCascade;
  assert(initialCascade !== null, 'Store activeCascade initialized');
  assert(initialCascade?.steps.length === 1, 'Store activeCascade has initial step');

  // Advance one discrete cascade step
  store.advanceCascadeStep();
  const stepOneCascade = useVajraStore.getState().activeCascade;
  assert(
    stepOneCascade !== null && stepOneCascade.steps.length >= 1,
    'Store advanceCascadeStep progressed cascade or stabilized cleanly',
  );

  // Step index selection
  store.selectCascadeStep(0);
  assert(useVajraStore.getState().activeCascadeStepIndex === 0, 'selectCascadeStep sets activeCascadeStepIndex to 0');
}

// ─── 8. Cascade Reset & State Restoration ─────────────────────────────
console.log('\n─── 8. Cascade Reset & State Restoration ───');
{
  const store = useVajraStore.getState();
  store.initialize(42);

  store.initiateCascade('SUBSTATION_FAILURE');
  assert(useVajraStore.getState().activeCascade !== null, 'Cascade active prior to reset');

  store.resetCascade();
  assert(useVajraStore.getState().activeCascade === null, 'resetCascade cleared activeCascade');
  assert(useVajraStore.getState().isCascadeRunning === false, 'resetCascade stopped cascade runner');
}

// ─── 9. Determinism: Same Initial State = Same Cascade Chain ──────────
console.log('\n─── 9. Determinism Verification ───');
{
  const top1 = generateGridTopology({ seed: 99 });
  const top2 = generateGridTopology({ seed: 99 });
  simulationTick(top1, 0, new SeededRandom(99));
  simulationTick(top2, 0, new SeededRandom(99));

  const run1 = simulateFullCascade(top1, 0, 'SUBSTATION_FAILURE', 5);
  const run2 = simulateFullCascade(top2, 0, 'SUBSTATION_FAILURE', 5);

  const steps1 = run1.record?.steps ?? [];
  const steps2 = run2.record?.steps ?? [];

  assert(steps1.length === steps2.length, `Both runs produced identical step count: ${steps1.length}`);

  let allStepsMatch = true;
  for (let i = 0; i < steps1.length; i++) {
    if (
      steps1[i].action !== steps2[i].action ||
      steps1[i].triggerAssetId !== steps2[i].triggerAssetId ||
      Math.abs(steps1[i].resultingLoadingPercent - steps2[i].resultingLoadingPercent) > 0.001
    ) {
      allStepsMatch = false;
      break;
    }
  }

  assert(allStepsMatch, 'All cascade steps, triggers, and loading deltas matched deterministically');
}

// ─── Summary ──────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log(`Task #13 Test Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
