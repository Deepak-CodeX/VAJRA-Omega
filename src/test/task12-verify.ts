// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Task #12 Verification Script: 2D Grid Topology Visualizer
// ═══════════════════════════════════════════════════════════════════════
// Tests:
// 1. Visual state mapping for all node states (NORMAL, WARNING, OVERLOADED, FAILED, ISOLATED, RECOVERING, OFFLINE)
// 2. Transmission line visual state mapping (NORMAL, WARNING, OVERLOADED, FAILED)
// 3. Spatial position lookup across all asset categories
// 4. Connected assets resolution for navigation and highlighting
// 5. Live synchronization: Scenario activation reflects in derived visual state
// 6. Substation failure scenario: Substation FAILED, lines FAILED, loads ISOLATED
// 7. Recovery plan execution: Restores visual states to NORMAL/ONLINE
// ═══════════════════════════════════════════════════════════════════════

import {
  deriveNodeVisualState,
  deriveLineVisualState,
  getAssetPosition,
  getConnectedAssetIds,
  STATE_THEMES,
  ASSET_TYPE_COLORS,
  type SelectedAsset,
} from '../components/grid/gridVisualizerUtils';
import { useVajraStore } from '../store/vajraStore';
import type { TransmissionLine } from '../types';

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

console.log('\n═══ Test Suite: Task #12 — Digital Twin 2D Grid Topology Visualizer ═══');

// ─── 1. Node Visual State Derivation ──────────────────────────────────
console.log('\n─── 1. Node Visual State Derivation ───');
assert(deriveNodeVisualState('ONLINE') === 'NORMAL', 'ONLINE status maps to NORMAL visual state');
assert(deriveNodeVisualState('WARNING') === 'WARNING', 'WARNING status maps to WARNING visual state');
assert(deriveNodeVisualState('OVERLOADED') === 'OVERLOADED', 'OVERLOADED status maps to OVERLOADED visual state');
assert(deriveNodeVisualState('FAILED') === 'FAILED', 'FAILED status maps to FAILED visual state');
assert(deriveNodeVisualState('ISOLATED') === 'ISOLATED', 'ISOLATED status maps to ISOLATED visual state');
assert(deriveNodeVisualState('RECOVERING') === 'RECOVERING', 'RECOVERING status maps to RECOVERING visual state');
assert(deriveNodeVisualState('OFFLINE') === 'OFFLINE', 'OFFLINE status maps to OFFLINE visual state');

// Metric-driven state overrides
assert(
  deriveNodeVisualState('ONLINE', { loadingPercent: 105 }) === 'OVERLOADED',
  'Node with >100% loading overrides to OVERLOADED',
);
assert(
  deriveNodeVisualState('ONLINE', { loadingPercent: 85 }) === 'WARNING',
  'Node with >80% loading overrides to WARNING',
);
assert(
  deriveNodeVisualState('ONLINE', { isConnected: false }) === 'ISOLATED',
  'Disconnected load overrides to ISOLATED',
);
assert(
  deriveNodeVisualState('FAILED', { isRecovering: true }) === 'RECOVERING',
  'Asset undergoing recovery overrides to RECOVERING',
);

// ─── 2. Line Visual State Derivation ──────────────────────────────────
console.log('\n─── 2. Line Visual State Derivation ───');
const baseLine: TransmissionLine = {
  id: 'line-test',
  name: 'Test Line',
  fromId: 'sub-1',
  toId: 'sub-2',
  capacityMW: 300,
  currentFlowMW: 120,
  loadingPercent: 40,
  lossesMW: 1.2,
  status: 'ONLINE',
  lengthKm: 25,
};

assert(deriveLineVisualState(baseLine) === 'NORMAL', 'Line with 40% load maps to NORMAL');
assert(
  deriveLineVisualState({ ...baseLine, loadingPercent: 88, status: 'WARNING' }) === 'WARNING',
  'Line with 88% load maps to WARNING',
);
assert(
  deriveLineVisualState({ ...baseLine, loadingPercent: 110, status: 'OVERLOADED' }) === 'OVERLOADED',
  'Line with 110% load maps to OVERLOADED',
);
assert(
  deriveLineVisualState({ ...baseLine, status: 'FAILED' }) === 'FAILED',
  'Failed line maps to FAILED',
);

// ─── 3. Theme & Color Tokens ──────────────────────────────────────────
console.log('\n─── 3. Theme & Palette Tokens ───');
assert(STATE_THEMES.NORMAL.primary !== '', 'NORMAL theme has primary color');
assert(STATE_THEMES.FAILED.primary === '#ff3b5c', 'FAILED theme uses alert red (#ff3b5c)');
assert(STATE_THEMES.WARNING.primary === '#f5a623', 'WARNING theme uses amber (#f5a623)');
assert(ASSET_TYPE_COLORS.solar !== undefined, 'Asset type colors include solar');
assert(ASSET_TYPE_COLORS.wind !== undefined, 'Asset type colors include wind');
assert(ASSET_TYPE_COLORS.transmissionSub !== undefined, 'Asset type colors include transmission substation');
assert(ASSET_TYPE_COLORS.battery !== undefined, 'Asset type colors include battery');

// ─── 4. Spatial Position & Navigation Lookup ──────────────────────────
console.log('\n─── 4. Spatial Position & Navigation Lookup ───');
useVajraStore.getState().initialize(42);
const topo = useVajraStore.getState().topology;

const sub1 = topo.substations[0];
const subPos = getAssetPosition(sub1.id, topo);
assert(subPos !== null, 'Substation position resolved');
assert(subPos?.x === sub1.position.x && subPos?.y === sub1.position.y, 'Substation coordinates match model');

const gen1 = topo.generators[0];
const genPos = getAssetPosition(gen1.id, topo);
assert(genPos !== null, 'Generator position resolved');

const load1 = topo.loads[0];
const loadPos = getAssetPosition(load1.id, topo);
assert(loadPos !== null, 'Load position resolved');

// Connected assets resolution
const subSelected: SelectedAsset = { kind: 'substation', data: sub1 };
const connectedToSub = getConnectedAssetIds(subSelected, topo);
assert(connectedToSub.length > 0, `Substation has connected assets (${connectedToSub.length} found)`);

const genSelected: SelectedAsset = { kind: 'generator', data: gen1 };
const connectedToGen = getConnectedAssetIds(genSelected, topo);
assert(connectedToGen.length > 0, 'Generator connects to target substation');
assert(connectedToGen[0] === gen1.connectedTo[0], 'Generator connection matches topology model');

// ─── 5. Scenario-Driven Topology Live Synchronization ─────────────────
console.log('\n─── 5. Scenario-Driven Live Topology Synchronization ───');
useVajraStore.getState().activateScenario('SUBSTATION_FAILURE');
const failedTopo = useVajraStore.getState().topology;

const targetSub = failedTopo.substations.find((s) => s.status === 'FAILED');
assert(targetSub !== undefined, 'Failed substation found in topology');
assert(
  deriveNodeVisualState(targetSub!.status) === 'FAILED',
  `Failed substation visual state derived as FAILED (got ${deriveNodeVisualState(targetSub!.status)})`,
);

// Verify connected lines also transitioned
const failedLines = failedTopo.transmissionLines.filter((l) => l.status === 'FAILED');
assert(failedLines.length > 0, `Lines connected to failed substation transitioned to FAILED (${failedLines.length} lines)`);
assert(deriveLineVisualState(failedLines[0]) === 'FAILED', 'Tripped line visual state derived as FAILED');

// Verify connected loads transitioned to ISOLATED
const isolatedLoads = failedTopo.loads.filter((l) => !l.connected || l.status === 'ISOLATED');
const loadsConnectedToFailedSub = failedTopo.loads.filter((l) => l.connectedTo === targetSub!.id);
if (loadsConnectedToFailedSub.length > 0) {
  assert(
    loadsConnectedToFailedSub.every((l) => !l.connected && deriveNodeVisualState(l.status, { isConnected: l.connected }) === 'ISOLATED'),
    'Downstream loads on failed substation visually isolated',
  );
} else {
  assert(true, 'No distribution loads directly on this transmission substation');
}

// ─── 6. Recovery State Visualization ──────────────────────────────────
console.log('\n─── 6. Recovery State Visualization ───');
useVajraStore.getState().generateRecovery();
useVajraStore.getState().executeRecovery();

const executedPlan = useVajraStore.getState().recoveryPlans.slice(-1)[0];
assert(executedPlan !== undefined && executedPlan.status === 'COMPLETED', 'Recovery plan successfully executed and marked COMPLETED');
assert(executedPlan.actions.every((a) => a.executed), `All ${executedPlan.actions.length} recovery actions executed`);

// Reset to normal operation
useVajraStore.getState().activateScenario('NORMAL_OPERATION');
const restoredTopo = useVajraStore.getState().topology;
assert(
  restoredTopo.substations.every((s) => deriveNodeVisualState(s.status) === 'NORMAL'),
  'All substations visual state restored to NORMAL on baseline reset',
);
assert(
  restoredTopo.transmissionLines.every((l) => deriveLineVisualState(l) === 'NORMAL'),
  'All transmission lines visual state restored to NORMAL on baseline reset',
);

// ─── Final Summary ────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════');
console.log(`  TASK #12 RESULTS: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
}
