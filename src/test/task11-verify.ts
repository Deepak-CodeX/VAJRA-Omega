// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Task #11 Verification Script
// ═══════════════════════════════════════════════════════════════════════
// Tests:
// 1. Store initialization & baseline state
// 2. Scenario selector connects to simulation & causes real state change
// 3. Scenario determinism (same scenario → identical outcome)
// 4. Live fault injection alters topology & metrics
// 5. Recovery plan generation produces valid proposed plan
// 6. Step-by-step recovery action execution
// 7. Full recovery plan execution & state restoration
// 8. Reset to Normal Operation restores clean grid state
// ═══════════════════════════════════════════════════════════════════════

import { useVajraStore } from '../store/vajraStore';

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

function assertClose(a: number, b: number, eps: number, msg: string): void {
  assert(Math.abs(a - b) < eps, `${msg} (${a} ≈ ${b}, ε=${eps})`);
}

console.log('\n═══ Test Suite: Task #11 — Scenario Selector & Recovery Controls ═══');

// ─── 1. Store Initialization ──────────────────────────────────────────
console.log('\n─── 1. Store Initialization ───');
const store = useVajraStore.getState();
store.initialize(42);

const initSnap = useVajraStore.getState();
assert(initSnap.initialized, 'Store initialized successfully');
assert(initSnap.clock.tick === 0, 'Initial clock tick is 0');
assert(initSnap.topology.substations.length > 0, 'Topology has substations');
assert(initSnap.topology.generators.length > 0, 'Topology has generators');
assert(initSnap.metrics.failedAssetCount === 0, 'Initial failed asset count is 0');
assert(initSnap.activeScenario === 'NORMAL_OPERATION', 'Initial scenario is NORMAL_OPERATION');

// ─── 2. Scenario Activation: Substation Failure ────────────────────────
console.log('\n─── 2. Scenario Activation (Substation Failure) ───');
useVajraStore.getState().activateScenario('SUBSTATION_FAILURE');

const subFailSnap = useVajraStore.getState();
assert(subFailSnap.activeScenario === 'SUBSTATION_FAILURE', 'Active scenario updated to SUBSTATION_FAILURE');
assert(subFailSnap.metrics.failedAssetCount > 0, `Failed asset count > 0 (got ${subFailSnap.metrics.failedAssetCount})`);
assert(subFailSnap.failures.length > 0, 'Failure record registered');
assert(subFailSnap.failures[0].type === 'SUBSTATION_FAILURE', 'Failure type is SUBSTATION_FAILURE');

const failedSubs = subFailSnap.topology.substations.filter((s) => s.status === 'FAILED');
assert(failedSubs.length > 0, `Substation marked as FAILED in topology (${failedSubs.map((s) => s.name).join(', ')})`);
assert(subFailSnap.snapshots.before !== null, 'Before snapshot captured');

// Record metrics for determinism check
const run1FailedCount = subFailSnap.metrics.failedAssetCount;
const run1Demand = subFailSnap.metrics.totalDemandMW;
const run1Unserved = subFailSnap.metrics.unservedLoadMW;

// ─── 3. Determinism: Reactivating Scenario Yields Identical State ─────
console.log('\n─── 3. Determinism Check ───');
useVajraStore.getState().activateScenario('SUBSTATION_FAILURE');
const subFailSnap2 = useVajraStore.getState();

assert(subFailSnap2.metrics.failedAssetCount === run1FailedCount, 'Deterministic failed asset count matches');
assertClose(subFailSnap2.metrics.totalDemandMW, run1Demand, 0.001, 'Deterministic total demand matches');
assertClose(subFailSnap2.metrics.unservedLoadMW, run1Unserved, 0.001, 'Deterministic unserved load matches');

// ─── 4. Live Fault Injection ──────────────────────────────────────────
console.log('\n─── 4. Live Fault Injection ───');
const preInjectFailCount = useVajraStore.getState().failures.length;
useVajraStore.getState().injectFault('GENERATOR_OUTAGE');

const postInjectSnap = useVajraStore.getState();
assert(postInjectSnap.failures.length === preInjectFailCount + 1, 'New failure event recorded for custom fault');
const failedGens = postInjectSnap.topology.generators.filter((g) => g.status === 'FAILED');
assert(failedGens.length > 0, `Generator marked FAILED (${failedGens[0].name})`);

// ─── 5. Recovery Plan Generation ──────────────────────────────────────
console.log('\n─── 5. Recovery Plan Generation ───');
useVajraStore.getState().generateRecovery();

const planSnap = useVajraStore.getState();
assert(planSnap.recoveryPlans.length > 0, 'Recovery plan generated');
const activePlan = planSnap.recoveryPlans[planSnap.recoveryPlans.length - 1];
assert(activePlan.status === 'PROPOSED', 'Plan status is PROPOSED');
assert(activePlan.actions.length > 0, `Recovery plan has ${activePlan.actions.length} actions`);
assert(activePlan.preRecoveryMetrics !== undefined, 'Pre-recovery metrics recorded');

// ─── 6. Single Recovery Action Execution ──────────────────────────────
console.log('\n─── 6. Single Action Execution ───');
const firstAction = activePlan.actions[0];
useVajraStore.getState().executeRecoveryAction(firstAction.id);

const stepSnap = useVajraStore.getState();
const stepPlan = stepSnap.recoveryPlans[stepSnap.recoveryPlans.length - 1];
const updatedAction = stepPlan.actions.find((a) => a.id === firstAction.id);
assert(updatedAction?.executed === true, 'Individual recovery action marked executed');
assert(stepPlan.status === 'PARTIAL' || stepPlan.status === 'COMPLETED', `Plan status updated to ${stepPlan.status}`);

// ─── 7. Full Recovery Execution ───────────────────────────────────────
console.log('\n─── 7. Full Recovery Execution ───');
useVajraStore.getState().executeRecovery();

const fullRecoverSnap = useVajraStore.getState();
const completedPlan = fullRecoverSnap.recoveryPlans[fullRecoverSnap.recoveryPlans.length - 1];
assert(completedPlan.status === 'COMPLETED', 'Plan status is COMPLETED');
assert(completedPlan.actions.every((a) => a.executed), 'All actions in plan executed');
assert(completedPlan.postRecoveryMetrics !== undefined, 'Post-recovery metrics recorded');
assert(fullRecoverSnap.snapshots.after !== null, 'After snapshot captured');
assert(
  completedPlan.postRecoveryMetrics!.stabilityIndex >= 0 && completedPlan.postRecoveryMetrics!.stabilityIndex <= 1,
  `Stability index valid: ${completedPlan.postRecoveryMetrics!.stabilityIndex.toFixed(3)} (pre: ${completedPlan.preRecoveryMetrics.stabilityIndex.toFixed(3)})`,
);

// ─── 8. Normal Operation Reset ────────────────────────────────────────
console.log('\n─── 8. Normal Operation Reset ───');
useVajraStore.getState().activateScenario('NORMAL_OPERATION');

const normalSnap = useVajraStore.getState();
assert(normalSnap.activeScenario === 'NORMAL_OPERATION', 'Scenario reset to NORMAL_OPERATION');
assert(normalSnap.metrics.failedAssetCount === 0, 'Zero failed assets in normal operation');
assert(normalSnap.topology.substations.every((s) => s.status === 'ONLINE'), 'All substations restored to ONLINE');
assert(normalSnap.topology.generators.every((g) => g.status === 'ONLINE'), 'All generators restored to ONLINE');

// ─── Final Summary ────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════');
console.log(`  TASK #11 RESULTS: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
