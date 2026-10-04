// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Phase 3 Telemetry Pipeline Verification
// ═══════════════════════════════════════════════════════════════════════
// Validates:
// 1. Initial simulation produces valid deterministic tick 0 telemetry
// 2. Telemetry metadata matches: sourceType = SIMULATED, classification = PURPLE
// 3. Units and confidence scores are accurately attached
// 4. Advancing simulation ticks generates and buffers telemetry deterministically
// 5. Reset maintains determinism and re-primes tick 0 baseline
// ═══════════════════════════════════════════════════════════════════════

import { useVajraStore } from '../store/vajraStore';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

console.log('\n═══ Test Suite: Phase 3 — Deterministic Telemetry & Analytics Buffer Restoration ═══\n');

// 1. Initialize store
const store = useVajraStore.getState();
store.initialize(42);

const initialSeries = useVajraStore.getState().timeSeries;

console.log('─── 1. Initial State & Buffer Priming ───');
assert(initialSeries.generation.length >= 1, 'Generation buffer has at least 1 record at tick 0');
assert(initialSeries.demand.length >= 1, 'Demand buffer has at least 1 record at tick 0');
assert(initialSeries.frequency.length >= 1, 'Frequency buffer has at least 1 record at tick 0');
assert(initialSeries.batterySOC.length >= 1, 'Battery SOC buffer has at least 1 record at tick 0');
assert(initialSeries.lineLoading.length >= 1, 'Line loading buffer has at least 1 record at tick 0');

console.log('─── 2. Telemetry Provenance & Metadata Verification ───');
const genPoint = initialSeries.generation[0];
const freqPoint = initialSeries.frequency[0];
const loadPoint = initialSeries.demand[0];

assert(genPoint.tick === 0, 'Initial telemetry tick is 0');
assert(genPoint.source === 'VAJRA_DETERMINISTIC_SIMULATION_ENGINE', 'Source correctly identifies simulation engine');
assert(genPoint.sourceType === 'SIMULATED', 'sourceType is explicitly SIMULATED');
assert(genPoint.classification === 'PURPLE', 'Classification is PURPLE (never claimed as SCADA / GREEN)');
assert(genPoint.confidence === 1.0, 'Confidence is 1.0 for deterministic simulation');
assert(genPoint.unit === 'MW', 'Generation unit is MW');
assert(freqPoint.unit === 'Hz', 'Frequency unit is Hz');
assert(loadPoint.unit === 'MW', 'Demand unit is MW');
assert(typeof genPoint.value === 'number' && genPoint.value > 0, `Generation value is positive (${genPoint.value.toFixed(1)} MW)`);
assert(typeof freqPoint.value === 'number' && freqPoint.value >= 49 && freqPoint.value <= 51, `Frequency is near nominal 50Hz (${freqPoint.value.toFixed(3)} Hz)`);

console.log('─── 3. Deterministic Pipeline Progression ───');
// Advance 10 ticks (should record at tick 5 and tick 10)
store.advance(10);
const advancedSeries = useVajraStore.getState().timeSeries;
assert(advancedSeries.generation.length >= 3, `Buffer accumulated ${advancedSeries.generation.length} points after 10 ticks`);
const tick5Point = advancedSeries.generation[1];
const tick10Point = advancedSeries.generation[2];
assert(tick5Point.tick === 5, 'Point 1 is recorded at tick 5');
assert(tick10Point.tick === 10, 'Point 2 is recorded at tick 10');
assert(tick10Point.classification === 'PURPLE', 'Subsequent points retain PURPLE classification');
assert(tick10Point.sourceType === 'SIMULATED', 'Subsequent points retain SIMULATED sourceType');

console.log('─── 4. Determinism on Reset ───');
store.reset();
const resetSeries = useVajraStore.getState().timeSeries;
assert(resetSeries.generation.length === 1, 'Reset returns timeSeries to clean single tick-0 record');
assert(resetSeries.generation[0].value === genPoint.value, 'Reset reproduces identical initial generation value');
assert(resetSeries.frequency[0].value === freqPoint.value, 'Reset reproduces identical initial frequency value');

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('Phase 3 Verification Results: ALL CHECKS PASSED (100% Deterministic)');
console.log('═══════════════════════════════════════════════════════════════════\n');
