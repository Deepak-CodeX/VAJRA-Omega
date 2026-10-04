// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Anomaly Detection Engine
// ═══════════════════════════════════════════════════════════════════════
// Rule-based anomaly detection structured for later ML replacement.
// Each detector is a pure function: (state) → Anomaly[]
// ═══════════════════════════════════════════════════════════════════════

import type {
  GridTopology,
  SystemMetrics,
  PowerBalance,
  Anomaly,
  AnomalyType,
  AnomalySeverity,
} from '@/types';

import { generateId } from '@/lib/utils';
import { THRESHOLDS } from '@/simulation/engine/simulationEngine';

// ─── Anomaly Detector Interface ─────────────────────────────────────

interface DetectorInput {
  topology: GridTopology;
  metrics: SystemMetrics;
  powerBalance: PowerBalance;
  tick: number;
}

type AnomalyDetector = (input: DetectorInput) => Anomaly[];

// ─── Helper ─────────────────────────────────────────────────────────

function createAnomaly(
  type: AnomalyType,
  severity: AnomalySeverity,
  assetId: string,
  assetName: string,
  message: string,
  value: number,
  threshold: number,
  tick: number,
): Anomaly {
  return {
    id: generateId('anom'),
    type,
    severity,
    assetId,
    assetName,
    message,
    value,
    threshold,
    detectedAtTick: tick,
    resolved: false,
  };
}

// ─── Detector: Line Overload ────────────────────────────────────────

const detectLineOverloads: AnomalyDetector = ({ topology, tick }) => {
  const anomalies: Anomaly[] = [];

  for (const line of topology.transmissionLines) {
    if (line.status === 'FAILED' || line.status === 'OFFLINE') continue;

    if (line.loadingPercent >= THRESHOLDS.LINE_OVERLOAD_PERCENT) {
      anomalies.push(
        createAnomaly(
          'LINE_OVERLOAD',
          'CRITICAL',
          line.id,
          line.name,
          `Line ${line.name} at ${line.loadingPercent.toFixed(1)}% capacity (${Math.abs(line.currentFlowMW).toFixed(1)} / ${line.capacityMW} MW)`,
          line.loadingPercent,
          THRESHOLDS.LINE_OVERLOAD_PERCENT,
          tick,
        ),
      );
    } else if (line.loadingPercent >= THRESHOLDS.LINE_WARNING_PERCENT) {
      anomalies.push(
        createAnomaly(
          'LINE_OVERLOAD',
          'WARNING',
          line.id,
          line.name,
          `Line ${line.name} approaching capacity: ${line.loadingPercent.toFixed(1)}%`,
          line.loadingPercent,
          THRESHOLDS.LINE_WARNING_PERCENT,
          tick,
        ),
      );
    }
  }

  return anomalies;
};

// ─── Detector: Substation Overload ──────────────────────────────────

const detectSubstationOverloads: AnomalyDetector = ({ topology, tick }) => {
  const anomalies: Anomaly[] = [];

  for (const sub of topology.substations) {
    if (sub.status === 'FAILED' || sub.status === 'OFFLINE') continue;

    const loadingPercent = sub.capacityMW > 0
      ? (sub.currentLoadMW / sub.capacityMW) * 100
      : 0;

    if (loadingPercent >= THRESHOLDS.SUB_OVERLOAD_PERCENT) {
      anomalies.push(
        createAnomaly(
          'SUBSTATION_OVERLOAD',
          'CRITICAL',
          sub.id,
          sub.name,
          `Substation ${sub.name} overloaded at ${loadingPercent.toFixed(1)}% (${sub.currentLoadMW.toFixed(1)} / ${sub.capacityMW} MW)`,
          loadingPercent,
          THRESHOLDS.SUB_OVERLOAD_PERCENT,
          tick,
        ),
      );
    } else if (loadingPercent >= THRESHOLDS.SUB_WARNING_PERCENT) {
      anomalies.push(
        createAnomaly(
          'SUBSTATION_OVERLOAD',
          'WARNING',
          sub.id,
          sub.name,
          `Substation ${sub.name} approaching capacity: ${loadingPercent.toFixed(1)}%`,
          loadingPercent,
          THRESHOLDS.SUB_WARNING_PERCENT,
          tick,
        ),
      );
    }
  }

  return anomalies;
};

// ─── Detector: Frequency Deviation ──────────────────────────────────

const detectFrequencyDeviations: AnomalyDetector = ({ metrics, tick }) => {
  const anomalies: Anomaly[] = [];

  if (metrics.frequencyDeviationHz >= THRESHOLDS.FREQ_CRITICAL_HZ) {
    anomalies.push(
      createAnomaly(
        'FREQUENCY_DEVIATION',
        'CRITICAL',
        'system',
        'Grid',
        `Critical frequency deviation: ${metrics.systemFrequencyHz.toFixed(2)} Hz (±${metrics.frequencyDeviationHz.toFixed(2)} Hz)`,
        metrics.frequencyDeviationHz,
        THRESHOLDS.FREQ_CRITICAL_HZ,
        tick,
      ),
    );
  } else if (metrics.frequencyDeviationHz >= THRESHOLDS.FREQ_WARNING_HZ) {
    anomalies.push(
      createAnomaly(
        'FREQUENCY_DEVIATION',
        'WARNING',
        'system',
        'Grid',
        `Frequency deviation: ${metrics.systemFrequencyHz.toFixed(2)} Hz (±${metrics.frequencyDeviationHz.toFixed(2)} Hz)`,
        metrics.frequencyDeviationHz,
        THRESHOLDS.FREQ_WARNING_HZ,
        tick,
      ),
    );
  }

  return anomalies;
};

// ─── Detector: Voltage Anomaly ──────────────────────────────────────

const detectVoltageAnomalies: AnomalyDetector = ({ topology, tick }) => {
  const anomalies: Anomaly[] = [];

  for (const sub of topology.substations) {
    if (sub.status === 'FAILED' || sub.status === 'OFFLINE') continue;

    if (sub.voltagePU < THRESHOLDS.VOLTAGE_CRITICAL_LOW) {
      anomalies.push(
        createAnomaly(
          'VOLTAGE_ANOMALY',
          'CRITICAL',
          sub.id,
          sub.name,
          `Critical undervoltage at ${sub.name}: ${sub.voltagePU.toFixed(3)} PU`,
          sub.voltagePU,
          THRESHOLDS.VOLTAGE_CRITICAL_LOW,
          tick,
        ),
      );
    } else if (sub.voltagePU < THRESHOLDS.VOLTAGE_WARNING_LOW) {
      anomalies.push(
        createAnomaly(
          'VOLTAGE_ANOMALY',
          'WARNING',
          sub.id,
          sub.name,
          `Low voltage at ${sub.name}: ${sub.voltagePU.toFixed(3)} PU`,
          sub.voltagePU,
          THRESHOLDS.VOLTAGE_WARNING_LOW,
          tick,
        ),
      );
    } else if (sub.voltagePU > THRESHOLDS.VOLTAGE_WARNING_HIGH) {
      anomalies.push(
        createAnomaly(
          'VOLTAGE_ANOMALY',
          'WARNING',
          sub.id,
          sub.name,
          `High voltage at ${sub.name}: ${sub.voltagePU.toFixed(3)} PU`,
          sub.voltagePU,
          THRESHOLDS.VOLTAGE_WARNING_HIGH,
          tick,
        ),
      );
    }
  }

  return anomalies;
};

// ─── Detector: Generation Shortfall ─────────────────────────────────

const detectGenerationShortfall: AnomalyDetector = ({ powerBalance, metrics, tick }) => {
  const anomalies: Anomaly[] = [];

  // Check if generation + battery can't meet demand
  const availableGeneration = powerBalance.totalGenerationMW + powerBalance.totalBatteryFlowMW;
  const demand = powerBalance.totalDemandMW + powerBalance.totalLossesMW;

  if (demand > 0 && availableGeneration < demand * 0.9) {
    const shortfallPercent = ((demand - availableGeneration) / demand) * 100;
    anomalies.push(
      createAnomaly(
        'GENERATION_SHORTFALL',
        shortfallPercent > 15 ? 'CRITICAL' : 'WARNING',
        'system',
        'Grid',
        `Generation shortfall: ${shortfallPercent.toFixed(1)}% deficit (${availableGeneration.toFixed(0)} MW available vs ${demand.toFixed(0)} MW needed)`,
        shortfallPercent,
        10,
        tick,
      ),
    );
  }

  return anomalies;
};

// ─── Detector: Battery Critical ─────────────────────────────────────

const detectBatteryCritical: AnomalyDetector = ({ topology, tick }) => {
  const anomalies: Anomaly[] = [];

  for (const battery of topology.batteries) {
    if (battery.status === 'FAILED' || battery.status === 'OFFLINE') continue;

    if (battery.socPercent < THRESHOLDS.BATTERY_CRITICAL_SOC) {
      anomalies.push(
        createAnomaly(
          'BATTERY_CRITICAL',
          'CRITICAL',
          battery.id,
          battery.name,
          `Battery ${battery.name} critically low: ${(battery.socPercent * 100).toFixed(1)}% SOC`,
          battery.socPercent,
          THRESHOLDS.BATTERY_CRITICAL_SOC,
          tick,
        ),
      );
    } else if (battery.socPercent < THRESHOLDS.BATTERY_WARNING_SOC) {
      anomalies.push(
        createAnomaly(
          'BATTERY_CRITICAL',
          'WARNING',
          battery.id,
          battery.name,
          `Battery ${battery.name} low: ${(battery.socPercent * 100).toFixed(1)}% SOC`,
          battery.socPercent,
          THRESHOLDS.BATTERY_WARNING_SOC,
          tick,
        ),
      );
    }
  }

  return anomalies;
};

// ─── Detector: Cascading Failure Risk ───────────────────────────────

const detectCascadingRisk: AnomalyDetector = ({ topology, tick }) => {
  const anomalies: Anomaly[] = [];

  // Count lines near trip threshold
  const nearTripLines = topology.transmissionLines.filter(
    (l) => l.loadingPercent >= THRESHOLDS.LINE_OVERLOAD_PERCENT && l.status !== 'FAILED',
  );

  if (nearTripLines.length >= 2) {
    anomalies.push(
      createAnomaly(
        'CASCADING_FAILURE_RISK',
        'CRITICAL',
        'system',
        'Grid',
        `Cascading failure risk: ${nearTripLines.length} lines at/above 100% loading`,
        nearTripLines.length,
        2,
        tick,
      ),
    );
  }

  return anomalies;
};

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

const ALL_DETECTORS: AnomalyDetector[] = [
  detectLineOverloads,
  detectSubstationOverloads,
  detectFrequencyDeviations,
  detectVoltageAnomalies,
  detectGenerationShortfall,
  detectBatteryCritical,
  detectCascadingRisk,
];

/**
 * Run all anomaly detectors against current grid state.
 * Returns new anomalies detected this tick.
 */
export function detectAnomalies(input: DetectorInput): Anomaly[] {
  const allAnomalies: Anomaly[] = [];

  for (const detector of ALL_DETECTORS) {
    allAnomalies.push(...detector(input));
  }

  return allAnomalies;
}

/**
 * Reconcile new anomalies with existing ones.
 * - If an existing anomaly matches a new one (same type + assetId), update it.
 * - If an existing anomaly has no matching new one, mark it as resolved.
 * - New anomalies that don't match existing ones are added.
 */
export function reconcileAnomalies(
  existing: Anomaly[],
  detected: Anomaly[],
  tick: number,
): Anomaly[] {
  const result: Anomaly[] = [];

  // Key: type + assetId
  const detectedMap = new Map<string, Anomaly>();
  for (const a of detected) {
    detectedMap.set(`${a.type}:${a.assetId}`, a);
  }

  // Process existing anomalies
  for (const existing_a of existing) {
    const key = `${existing_a.type}:${existing_a.assetId}`;
    const match = detectedMap.get(key);

    if (match) {
      // Still active — update value but keep original detection tick
      result.push({
        ...existing_a,
        value: match.value,
        message: match.message,
        severity: match.severity,
      });
      detectedMap.delete(key);
    } else if (!existing_a.resolved) {
      // No longer detected — resolve it
      result.push({
        ...existing_a,
        resolved: true,
        resolvedAtTick: tick,
      });
    } else {
      // Already resolved, keep it in the history (could trim old ones)
      result.push(existing_a);
    }
  }

  // Add new anomalies not seen before
  Array.from(detectedMap.values()).forEach((newAnomaly) => {
    result.push(newAnomaly);
  });

  return result;
}
