// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Cascading Failure Engine
// ═══════════════════════════════════════════════════════════════════════
// When a line trips from overload (>120%), its flow redistributes to
// parallel paths. Those paths may then overload and trip too, creating
// a cascade. This engine models that chain reaction.
// ═══════════════════════════════════════════════════════════════════════

import type {
  GridTopology,
  TransmissionLine,
  Load,
  CascadeStep,
  CascadeRecord,
  CascadeStatus,
  CascadeStepAction,
  FailureEvent,
  FailureType,
  EventLogEntry,
} from '@/types';

import { generateId, tickToTimestamp } from '@/lib/utils';
import { THRESHOLDS, computeTransmissionFlows } from '@/simulation/engine/simulationEngine';

// ─── Failure Injection ──────────────────────────────────────────────

/**
 * Inject a failure event into the grid.
 * Mutates the topology directly — sets affected assets to FAILED status.
 */
export function injectFailure(
  topology: GridTopology,
  failureType: FailureType,
  targetAssetIds: string[],
  tick: number,
): { failure: FailureEvent; events: EventLogEntry[] } {
  const events: EventLogEntry[] = [];
  const affectedIds: string[] = [];

  for (const assetId of targetAssetIds) {
    // Find the asset type and set it to FAILED
    const gen = topology.generators.find((g) => g.id === assetId);
    if (gen) {
      gen.status = 'FAILED';
      gen.currentOutputMW = 0;
      affectedIds.push(assetId);
      events.push({
        id: generateId('evt'),
        type: 'FAILURE_INJECTED',
        tick,
        timestamp: tickToTimestamp(tick),
        message: `Generator ${gen.name} failed (${failureType})`,
        severity: 'CRITICAL',
        relatedAssetIds: [assetId],
        data: { failureType, assetType: 'generator' },
      });
      continue;
    }

    const sub = topology.substations.find((s) => s.id === assetId);
    if (sub) {
      sub.status = 'FAILED';
      sub.currentLoadMW = 0;
      sub.voltagePU = 0;
      sub.frequencyHz = 0;
      affectedIds.push(assetId);

      // Also disconnect all loads connected to this substation
      for (const load of topology.loads) {
        if (load.connectedTo === assetId) {
          load.connected = false;
          load.status = 'ISOLATED';
          affectedIds.push(load.id);
        }
      }

      // Also fail all lines connected to this substation
      for (const line of topology.transmissionLines) {
        if (line.fromId === assetId || line.toId === assetId) {
          line.status = 'FAILED';
          line.currentFlowMW = 0;
          line.loadingPercent = 0;
          affectedIds.push(line.id);
        }
      }

      events.push({
        id: generateId('evt'),
        type: 'FAILURE_INJECTED',
        tick,
        timestamp: tickToTimestamp(tick),
        message: `Substation ${sub.name} failed (${failureType}) — ${topology.loads.filter((l) => l.connectedTo === assetId).length} loads isolated`,
        severity: 'CRITICAL',
        relatedAssetIds: affectedIds.slice(),
        data: { failureType, assetType: 'substation' },
      });
      continue;
    }

    const line = topology.transmissionLines.find((l) => l.id === assetId);
    if (line) {
      line.status = 'FAILED';
      line.currentFlowMW = 0;
      line.loadingPercent = 0;
      affectedIds.push(assetId);
      events.push({
        id: generateId('evt'),
        type: 'FAILURE_INJECTED',
        tick,
        timestamp: tickToTimestamp(tick),
        message: `Transmission line ${line.name} failed (${failureType})`,
        severity: 'CRITICAL',
        relatedAssetIds: [assetId],
        data: { failureType, assetType: 'line' },
      });
      continue;
    }

    const battery = topology.batteries.find((b) => b.id === assetId);
    if (battery) {
      battery.status = 'FAILED';
      battery.currentFlowMW = 0;
      affectedIds.push(assetId);
      events.push({
        id: generateId('evt'),
        type: 'FAILURE_INJECTED',
        tick,
        timestamp: tickToTimestamp(tick),
        message: `Battery ${battery.name} failed (${failureType})`,
        severity: 'CRITICAL',
        relatedAssetIds: [assetId],
        data: { failureType, assetType: 'battery' },
      });
      continue;
    }
  }

  // For special failure types that affect categories
  if (failureType === 'SOLAR_COLLAPSE') {
    for (const gen of topology.generators) {
      if (gen.type === 'solar' && gen.status !== 'FAILED') {
        gen.resourceFactor = 0.05; // Near-zero solar
        gen.currentOutputMW = gen.capacityMW * 0.05;
        affectedIds.push(gen.id);
      }
    }
    events.push({
      id: generateId('evt'),
      type: 'FAILURE_INJECTED',
      tick,
      timestamp: tickToTimestamp(tick),
      message: 'Solar collapse — cloud cover reduced solar output to ~5%',
      severity: 'CRITICAL',
      relatedAssetIds: topology.generators.filter((g) => g.type === 'solar').map((g) => g.id),
      data: { failureType },
    });
  }

  if (failureType === 'WIND_REDUCTION') {
    for (const gen of topology.generators) {
      if (gen.type === 'wind' && gen.status !== 'FAILED') {
        gen.resourceFactor = 0.1;
        gen.currentOutputMW = gen.capacityMW * 0.1;
        affectedIds.push(gen.id);
      }
    }
    events.push({
      id: generateId('evt'),
      type: 'FAILURE_INJECTED',
      tick,
      timestamp: tickToTimestamp(tick),
      message: 'Wind reduction — calm conditions reduced wind output to ~10%',
      severity: 'WARNING',
      relatedAssetIds: topology.generators.filter((g) => g.type === 'wind').map((g) => g.id),
      data: { failureType },
    });
  }

  if (failureType === 'DEMAND_SPIKE' || failureType === 'EV_SURGE') {
    const targetLoads = failureType === 'EV_SURGE'
      ? topology.loads.filter((l) => l.type === 'ev_charging')
      : topology.loads;
    const multiplier = failureType === 'EV_SURGE' ? 3.0 : 1.5;

    for (const load of targetLoads) {
      if (load.connected) {
        load.demandMW = load.baseDemandMW * multiplier;
        affectedIds.push(load.id);
      }
    }
    events.push({
      id: generateId('evt'),
      type: 'FAILURE_INJECTED',
      tick,
      timestamp: tickToTimestamp(tick),
      message: failureType === 'EV_SURGE'
        ? `EV surge — charging demand spiked to ${multiplier}×`
        : `Demand spike — all loads increased to ${multiplier}×`,
      severity: 'WARNING',
      relatedAssetIds: targetLoads.map((l) => l.id),
      data: { failureType, multiplier },
    });
  }

  const failure: FailureEvent = {
    id: generateId('fail'),
    type: failureType,
    affectedAssetIds: Array.from(new Set(affectedIds)),
    tick,
    resolved: false,
    description: events.map((e) => e.message).join('; '),
  };

  return { failure, events };
}

// ─── Cascade Propagation ────────────────────────────────────────────

/**
 * Check for and propagate cascading failures.
 * A line trips when loading > 120%. Its flow redistributes to parallel paths.
 * Returns cascade steps if any occurred.
 */
export function propagateCascade(
  topology: GridTopology,
  tick: number,
): { steps: CascadeStep[]; events: EventLogEntry[] } {
  const steps: CascadeStep[] = [];
  const events: EventLogEntry[] = [];
  let cascadeIteration = 0;
  const MAX_CASCADE_ITERATIONS = 10;

  while (cascadeIteration < MAX_CASCADE_ITERATIONS) {
    cascadeIteration++;
    let tripped = false;

    for (const line of topology.transmissionLines) {
      if (line.status === 'FAILED' || line.status === 'OFFLINE') continue;

      if (line.loadingPercent >= THRESHOLDS.LINE_TRIP_PERCENT) {
        // This line trips
        const flowBeforeTrip = line.currentFlowMW;
        line.status = 'FAILED';
        line.currentFlowMW = 0;
        line.loadingPercent = 0;
        tripped = true;

        // Find parallel lines (lines connecting the same pair or lines
        // connected to the from/to substations)
        const parallelLines = topology.transmissionLines.filter(
          (l) =>
            l.id !== line.id &&
            l.status !== 'FAILED' &&
            l.status !== 'OFFLINE' &&
            (l.fromId === line.fromId || l.toId === line.toId ||
              l.fromId === line.toId || l.toId === line.fromId),
        );

        // Redistribute flow to parallel lines
        if (parallelLines.length > 0) {
          const flowPerLine = flowBeforeTrip / parallelLines.length;
          for (const parallel of parallelLines) {
            parallel.currentFlowMW += flowPerLine;
            parallel.loadingPercent = parallel.capacityMW > 0
              ? (Math.abs(parallel.currentFlowMW) / parallel.capacityMW) * 100
              : 0;

            const unservedMW = topology.loads.filter((l) => !l.connected).reduce((sum, l) => sum + l.baseDemandMW, 0);
            const consumers = topology.loads.filter((l) => !l.connected).reduce((sum, l) => sum + l.consumerCount, 0);

            steps.push({
              tick,
              triggerAssetId: line.id,
              triggerReason: `Line tripped at ${THRESHOLDS.LINE_TRIP_PERCENT}% loading`,
              affectedAssetId: parallel.id,
              affectedAssetType: 'line',
              loadRedistributedMW: flowPerLine,
              resultingLoadingPercent: parallel.loadingPercent,
              stepIndex: cascadeIteration,
              timestamp: tickToTimestamp(tick),
              action: 'LINE_TRIP',
              triggerAssetName: line.name,
              affectedAssetName: parallel.name,
              loadingBefore: flowBeforeTrip > 0 ? (flowBeforeTrip / line.capacityMW) * 100 : 0,
              loadingAfter: parallel.loadingPercent,
              unservedLoadMW: unservedMW,
              affectedConsumers: consumers,
              depth: cascadeIteration,
              status: 'PROPAGATING',
            });
          }
        } else {
          // No parallel paths — loads downstream may be isolated
          const isolatedLoads = findIsolatedLoads(topology, line);
          for (const load of isolatedLoads) {
            load.connected = false;
            load.status = 'ISOLATED';
            const unservedMW = topology.loads.filter((l) => !l.connected).reduce((sum, l) => sum + l.baseDemandMW, 0);
            const consumers = topology.loads.filter((l) => !l.connected).reduce((sum, l) => sum + l.consumerCount, 0);

            steps.push({
              tick,
              triggerAssetId: line.id,
              triggerReason: 'No parallel path available',
              affectedAssetId: load.id,
              affectedAssetType: 'load',
              loadRedistributedMW: 0,
              resultingLoadingPercent: 0,
              stepIndex: cascadeIteration,
              timestamp: tickToTimestamp(tick),
              action: 'ISOLATE_LOAD',
              triggerAssetName: line.name,
              affectedAssetName: load.name,
              unservedLoadMW: unservedMW,
              affectedConsumers: consumers,
              depth: cascadeIteration,
              status: 'PROPAGATING',
            });
          }
        }

        events.push({
          id: generateId('evt'),
          type: 'CASCADE_STEP',
          tick,
          timestamp: tickToTimestamp(tick),
          message: `Cascade: Line ${line.name} tripped at ${THRESHOLDS.LINE_TRIP_PERCENT}% → flow redistributed to ${parallelLines.length} parallel lines`,
          severity: 'CRITICAL',
          relatedAssetIds: [line.id, ...parallelLines.map((l) => l.id)],
          data: {
            iteration: cascadeIteration,
            flowRedistributed: flowBeforeTrip,
          },
        });
      }
    }

    if (!tripped) break; // No more trips this iteration
  }

  return { steps, events };
}

// ─── Find Isolated Loads ────────────────────────────────────────────

/**
 * Find loads that lost their connection due to a line failure.
 */
export function findIsolatedLoads(
  topology: GridTopology,
  failedLine: TransmissionLine,
): Load[] {
  const isolated: Load[] = [];

  // Check both substations connected to the failed line
  const checkSubId = (subId: string) => {
    const sub = topology.substations.find((s) => s.id === subId);
    if (!sub || sub.type !== 'distribution') return;

    // Check if this distribution substation has any other online line to a transmission sub
    const hasAlternatePath = topology.transmissionLines.some(
      (l) =>
        l.id !== failedLine.id &&
        l.status !== 'FAILED' &&
        l.status !== 'OFFLINE' &&
        (l.fromId === subId || l.toId === subId),
    );

    if (!hasAlternatePath) {
      // All loads on this substation are isolated
      for (const load of topology.loads) {
        if (load.connectedTo === subId && load.connected) {
          isolated.push(load);
        }
      }
    }
  };

  checkSubId(failedLine.fromId);
  checkSubId(failedLine.toId);

  return isolated;
}

// ─── Step-by-Step Cascade Evaluator ─────────────────────────────────

export interface CascadeStepEvaluation {
  step: CascadeStep | null;
  hasMore: boolean;
  status: CascadeStatus;
  events: EventLogEntry[];
}

/**
 * Evaluate the next discrete cascade step on the current topology.
 * Identifies the most critically overloaded line, trips it, recomputes
 * DC power flow, checks for isolated distribution loads, and returns the step.
 */
export function evaluateCascadeStep(
  topology: GridTopology,
  tick: number,
  currentStepIndex: number = 0,
): CascadeStepEvaluation {
  const events: EventLogEntry[] = [];

  // Step 1: Find online lines already exceeding trip threshold (>120%)
  let candidateLines = topology.transmissionLines
    .filter((l) => l.status !== 'FAILED' && l.status !== 'OFFLINE')
    .filter((l) => l.loadingPercent >= THRESHOLDS.LINE_TRIP_PERCENT)
    .sort((a, b) => b.loadingPercent - a.loadingPercent);

  // If no pre-existing trips, recompute DC power flows to ensure authoritative network state
  if (candidateLines.length === 0) {
    computeTransmissionFlows(
      topology.transmissionLines,
      topology.substations,
      topology.generators,
      topology.loads,
      topology.batteries,
    );

    candidateLines = topology.transmissionLines
      .filter((l) => l.status !== 'FAILED' && l.status !== 'OFFLINE')
      .filter((l) => l.loadingPercent >= THRESHOLDS.LINE_TRIP_PERCENT)
      .sort((a, b) => b.loadingPercent - a.loadingPercent);
  }

  // If no lines >= 120%, check if any lines > 100% under cascade progression
  let targetLine = candidateLines[0];
  if (!targetLine) {
    const overloaded = topology.transmissionLines
      .filter((l) => l.status !== 'FAILED' && l.status !== 'OFFLINE')
      .filter((l) => l.loadingPercent >= THRESHOLDS.LINE_OVERLOAD_PERCENT)
      .sort((a, b) => b.loadingPercent - a.loadingPercent);
    if (overloaded.length > 0) {
      targetLine = overloaded[0];
    }
  }

  // If no lines trip, cascade has stabilized
  if (!targetLine) {
    const isStabilizedEvent: EventLogEntry = {
      id: generateId('evt'),
      type: 'GRID_STABILIZED',
      tick,
      timestamp: tickToTimestamp(tick),
      message: `Cascade stabilized: all remaining transmission lines within thermal limits`,
      severity: 'INFO',
      relatedAssetIds: [],
      data: { stepIndex: currentStepIndex },
    };
    events.push(isStabilizedEvent);

    return {
      step: null,
      hasMore: false,
      status: 'STABILIZED',
      events,
    };
  }

  // Step 3: Trip the target line
  const flowBeforeTrip = targetLine.currentFlowMW;
  const loadBeforePercent = targetLine.loadingPercent;

  targetLine.status = 'FAILED';
  targetLine.currentFlowMW = 0;
  targetLine.loadingPercent = 0;

  // Step 4: Redistribute flow to parallel/connected transmission lines
  const parallelLines = topology.transmissionLines.filter(
    (l) =>
      l.id !== targetLine.id &&
      l.status !== 'FAILED' &&
      l.status !== 'OFFLINE' &&
      (l.fromId === targetLine.fromId || l.toId === targetLine.toId ||
        l.fromId === targetLine.toId || l.toId === targetLine.fromId),
  );

  if (parallelLines.length > 0 && Math.abs(flowBeforeTrip) > 0) {
    const flowPerLine = flowBeforeTrip / parallelLines.length;
    for (const parallel of parallelLines) {
      parallel.currentFlowMW += flowPerLine;
      parallel.loadingPercent = parallel.capacityMW > 0
        ? (Math.abs(parallel.currentFlowMW) / parallel.capacityMW) * 100
        : 0;
      if (parallel.loadingPercent >= THRESHOLDS.LINE_OVERLOAD_PERCENT) {
        parallel.status = 'OVERLOADED';
      } else if (parallel.loadingPercent >= THRESHOLDS.LINE_WARNING_PERCENT) {
        parallel.status = 'WARNING';
      }
    }
  }

  // Step 5: Check for newly isolated loads
  const isolatedLoads = findIsolatedLoads(topology, targetLine);
  for (const load of isolatedLoads) {
    load.connected = false;
    load.status = 'ISOLATED';
  }

  // If loads were isolated, recompute flows with decreased demand
  if (isolatedLoads.length > 0) {
    computeTransmissionFlows(
      topology.transmissionLines,
      topology.substations,
      topology.generators,
      topology.loads,
      topology.batteries,
    );
  }

  // Find newly most loaded line after redistribution
  const remainingOnline = topology.transmissionLines
    .filter((l) => l.status !== 'FAILED' && l.status !== 'OFFLINE')
    .sort((a, b) => b.loadingPercent - a.loadingPercent);
  const mostStressed = remainingOnline[0];

  const disconnectedLoads = topology.loads.filter((l) => !l.connected);
  const unservedMW = disconnectedLoads.reduce((sum, l) => sum + l.baseDemandMW, 0);
  const consumers = disconnectedLoads.reduce((sum, l) => sum + l.consumerCount, 0);

  const step: CascadeStep = {
    tick,
    triggerAssetId: targetLine.id,
    triggerReason: `Thermal overload trip: reached ${loadBeforePercent.toFixed(1)}% capacity`,
    affectedAssetId: mostStressed ? mostStressed.id : targetLine.id,
    affectedAssetType: 'line',
    loadRedistributedMW: flowBeforeTrip,
    resultingLoadingPercent: mostStressed ? mostStressed.loadingPercent : 0,
    stepIndex: currentStepIndex + 1,
    timestamp: tickToTimestamp(tick),
    action: 'LINE_TRIP',
    triggerAssetName: targetLine.name,
    affectedAssetName: mostStressed ? mostStressed.name : targetLine.name,
    loadingBefore: loadBeforePercent,
    loadingAfter: mostStressed ? mostStressed.loadingPercent : 0,
    unservedLoadMW: unservedMW,
    affectedConsumers: consumers,
    depth: currentStepIndex + 1,
    status: 'PROPAGATING',
  };

  const tripEvent: EventLogEntry = {
    id: generateId('evt'),
    type: 'CASCADE_STEP',
    tick,
    timestamp: tickToTimestamp(tick),
    message: `Cascade Stage ${currentStepIndex + 1}: Line ${targetLine.name} tripped (${loadBeforePercent.toFixed(1)}% load) → ${isolatedLoads.length} loads isolated`,
    severity: 'CRITICAL',
    relatedAssetIds: [targetLine.id, ...isolatedLoads.map((l) => l.id)],
    data: {
      stepIndex: currentStepIndex + 1,
      trippedLine: targetLine.name,
      unservedMW,
    },
  };
  events.push(tripEvent);

  const hasMore = remainingOnline.some((l) => l.loadingPercent >= THRESHOLDS.LINE_OVERLOAD_PERCENT);

  return {
    step,
    hasMore,
    status: hasMore ? 'PROPAGATING' : 'STABILIZED',
    events,
  };
}

// ─── Build Cascade Record ───────────────────────────────────────────

export function buildCascadeRecord(
  steps: CascadeStep[],
  topology: GridTopology,
  tick: number,
  initialFailureType?: FailureType,
): CascadeRecord | null {
  if (steps.length === 0) return null;

  const affectedAssetIds = Array.from(
    new Set(steps.flatMap((s) => [s.triggerAssetId, s.affectedAssetId])),
  );

  const disconnectedLoads = topology.loads.filter((l) => !l.connected);
  const unservedMW = disconnectedLoads.reduce((sum, l) => sum + l.baseDemandMW, 0);
  const consumers = disconnectedLoads.reduce((sum, l) => sum + l.consumerCount, 0);
  const criticalLoads = topology.loads.filter(
    (l) => !l.connected && (l.priority === 'critical' || l.priority === 'high'),
  ).length;

  const maxOverload = Math.max(
    0,
    ...topology.transmissionLines.map((l) => (l.status !== 'FAILED' ? l.loadingPercent : 0)),
  );

  const depth = steps.length > 0 ? Math.max(...steps.map((s) => s.depth ?? 1)) : 0;

  // Stability metric
  const loadFactor = topology.loads.length > 0
    ? topology.loads.filter((l) => l.connected).length / topology.loads.length
    : 1;

  const hasRemainingOverloads = topology.transmissionLines.some(
    (l) => l.status !== 'FAILED' && l.loadingPercent >= THRESHOLDS.LINE_OVERLOAD_PERCENT,
  );

  return {
    id: generateId('cascade'),
    startTick: tick,
    steps,
    totalUnservedLoadMW: unservedMW,
    affectedConsumers: consumers,
    affectedAssetIds,
    resolved: false,
    depth,
    maxOverloadPercent: maxOverload,
    criticalLoadsAffected: criticalLoads,
    stabilityIndex: Math.max(0, Math.min(1, loadFactor * (maxOverload > 100 ? 0.6 : 1))),
    status: hasRemainingOverloads ? 'PROPAGATING' : 'STABILIZED',
    initialFailureType,
  };
}

// ─── Initiate Cascade Sequence ──────────────────────────────────────

/**
 * Initiate a cascade sequence with an initial failure and create the root cascade record.
 */
export function initiateCascadeSequence(
  topology: GridTopology,
  tick: number,
  failureType: FailureType,
  targetAssetIds: string[],
): { cascade: CascadeRecord; events: EventLogEntry[] } {
  // 1. Inject initial failure
  const { failure, events } = injectFailure(topology, failureType, targetAssetIds, tick);

  // 2. Recompute flows
  computeTransmissionFlows(
    topology.transmissionLines,
    topology.substations,
    topology.generators,
    topology.loads,
    topology.batteries,
  );

  // 3. Find primary trigger asset name
  const primaryId = targetAssetIds[0] ?? failure.affectedAssetIds[0] ?? 'grid';
  let primaryName = primaryId;
  let primaryType: 'line' | 'substation' | 'generator' | 'load' = 'substation';

  const sub = topology.substations.find((s) => s.id === primaryId);
  if (sub) {
    primaryName = sub.name;
    primaryType = 'substation';
  }
  const line = topology.transmissionLines.find((l) => l.id === primaryId);
  if (line) {
    primaryName = line.name;
    primaryType = 'line';
  }
  const gen = topology.generators.find((g) => g.id === primaryId);
  if (gen) {
    primaryName = gen.name;
    primaryType = 'generator';
  }

  // 4. Calculate grid stress
  const disconnectedLoads = topology.loads.filter((l) => !l.connected);
  const unservedMW = disconnectedLoads.reduce((sum, l) => sum + l.baseDemandMW, 0);
  const consumers = disconnectedLoads.reduce((sum, l) => sum + l.consumerCount, 0);
  const maxOverload = Math.max(
    0,
    ...topology.transmissionLines.map((l) => (l.status !== 'FAILED' ? l.loadingPercent : 0)),
  );

  const hasPropagatingFault = topology.transmissionLines.some(
    (l) => l.status !== 'FAILED' && l.loadingPercent >= THRESHOLDS.LINE_OVERLOAD_PERCENT,
  );

  // 5. Initial Step
  const initialStep: CascadeStep = {
    tick,
    triggerAssetId: primaryId,
    triggerReason: `Initial failure: ${failureType}`,
    affectedAssetId: primaryId,
    affectedAssetType: primaryType,
    loadRedistributedMW: 0,
    resultingLoadingPercent: maxOverload,
    stepIndex: 0,
    timestamp: tickToTimestamp(tick),
    action: 'INITIAL_FAILURE',
    triggerAssetName: primaryName,
    affectedAssetName: primaryName,
    loadingBefore: 100,
    loadingAfter: maxOverload,
    unservedLoadMW: unservedMW,
    affectedConsumers: consumers,
    depth: 0,
    status: hasPropagatingFault ? 'PROPAGATING' : 'STABILIZED',
  };

  const cascade: CascadeRecord = {
    id: generateId('cascade'),
    startTick: tick,
    steps: [initialStep],
    totalUnservedLoadMW: unservedMW,
    affectedConsumers: consumers,
    affectedAssetIds: failure.affectedAssetIds,
    resolved: false,
    depth: 0,
    maxOverloadPercent: maxOverload,
    criticalLoadsAffected: topology.loads.filter(
      (l) => !l.connected && (l.priority === 'critical' || l.priority === 'high'),
    ).length,
    stabilityIndex: Math.max(0, Math.min(1, 1.0 - unservedMW / Math.max(1, unservedMW + 1000))),
    status: hasPropagatingFault ? 'PROPAGATING' : 'STABILIZED',
    initialFailureType: failureType,
  };

  return { cascade, events };
}

// ─── Simulate Full Cascade ──────────────────────────────────────────

/**
 * Deterministically simulates the complete cascading sequence
 * step-by-step from the current state and returns the aggregated record.
 */
export function simulateFullCascade(
  topology: GridTopology,
  startTick: number,
  initialFailureType?: FailureType,
  maxSteps: number = 10,
): { record: CascadeRecord | null; events: EventLogEntry[] } {
  const steps: CascadeStep[] = [];
  const allEvents: EventLogEntry[] = [];
  let depth = 0;
  let hasMore = true;

  while (hasMore && depth < maxSteps) {
    const res = evaluateCascadeStep(topology, startTick + depth, depth);
    if (res.step) {
      steps.push(res.step);
      allEvents.push(...res.events);
      depth++;
      hasMore = res.hasMore;
    } else {
      allEvents.push(...res.events);
      break;
    }
  }

  const record = buildCascadeRecord(steps, topology, startTick + depth, initialFailureType);
  return { record, events: allEvents };
}
