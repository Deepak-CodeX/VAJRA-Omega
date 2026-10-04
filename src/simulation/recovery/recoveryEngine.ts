// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Recovery Engine
// ═══════════════════════════════════════════════════════════════════════
// Generates and executes recovery plans in response to failures.
// Objectives: minimize unserved load, reduce overloads, restore critical loads first.
// ═══════════════════════════════════════════════════════════════════════

import type {
  GridTopology,
  PowerBalance,
  RecoveryPlan,
  RecoveryAction,
  RecoveryActionType,
  RecoveryMetrics,
  FailureEvent,
  EventLogEntry,
} from '@/types';

import { generateId, tickToTimestamp } from '@/lib/utils';
import { THRESHOLDS } from '@/simulation/engine/simulationEngine';

// ─── Compute Recovery Metrics ───────────────────────────────────────

export function computeRecoveryMetrics(
  topology: GridTopology,
  powerBalance: PowerBalance,
): RecoveryMetrics {
  const disconnectedLoads = topology.loads.filter((l) => !l.connected);
  const unservedMW = disconnectedLoads.reduce((sum, l) => sum + l.baseDemandMW, 0);
  const affectedConsumers = disconnectedLoads.reduce((sum, l) => sum + l.consumerCount, 0);

  const overloadedLines = topology.transmissionLines.filter(
    (l) => l.loadingPercent > THRESHOLDS.LINE_OVERLOAD_PERCENT && l.status !== 'FAILED',
  );
  const maxOverload = overloadedLines.length > 0
    ? Math.max(...overloadedLines.map((l) => l.loadingPercent))
    : 0;

  const criticalLoads = topology.loads.filter(
    (l) => l.priority === 'critical' || l.priority === 'high',
  );
  const criticalServed = criticalLoads.filter((l) => l.connected).length;

  const totalBatteryCapacity = topology.batteries.reduce((sum, b) => sum + b.capacityMWh, 0);
  const totalBatterySOC = topology.batteries.reduce((sum, b) => sum + b.stateOfChargeMWh, 0);
  const batteryUtil = totalBatteryCapacity > 0 ? (totalBatterySOC / totalBatteryCapacity) * 100 : 0;

  const totalGenCapacity = topology.generators.reduce((sum, g) => sum + g.capacityMW, 0);
  const renewableOutput = topology.generators
    .filter((g) => g.type === 'solar' || g.type === 'wind')
    .reduce((sum, g) => sum + g.currentOutputMW, 0);
  const renewableUtil = totalGenCapacity > 0 ? (renewableOutput / totalGenCapacity) * 100 : 0;

  // Stability index: composite of frequency, voltage, and load served
  const freqStability = Math.max(0, 1 - (Math.abs(powerBalance.netBalanceMW) / Math.max(powerBalance.totalDemandMW, 1)) * 10);
  const voltStability = topology.substations
    .filter((s) => s.status !== 'FAILED')
    .reduce((sum, s) => sum + (s.voltagePU > 0 ? Math.min(1, 1 - Math.abs(s.voltagePU - 1) * 5) : 0), 0)
    / Math.max(topology.substations.filter((s) => s.status !== 'FAILED').length, 1);
  const loadFactor = topology.loads.length > 0
    ? topology.loads.filter((l) => l.connected).length / topology.loads.length
    : 1;

  return {
    unservedLoadMW: unservedMW,
    maxOverloadPercent: maxOverload,
    affectedConsumers,
    criticalLoadsServed: criticalServed,
    totalCriticalLoads: criticalLoads.length,
    batteryUtilizationPercent: batteryUtil,
    renewableUtilizationPercent: renewableUtil,
    stabilityIndex: (freqStability + voltStability + loadFactor) / 3,
  };
}

// ─── Generate Recovery Plan ─────────────────────────────────────────

/**
 * Analyze the current grid state and generate a recovery plan.
 * The plan consists of ordered actions to restore the grid.
 */
export function generateRecoveryPlan(
  topology: GridTopology,
  powerBalance: PowerBalance,
  failure: FailureEvent,
  tick: number,
): RecoveryPlan {
  const actions: RecoveryAction[] = [];

  // === Strategy 1: Isolate failed components ===
  const failedLines = topology.transmissionLines.filter((l) => l.status === 'FAILED');
  const failedSubs = topology.substations.filter((s) => s.status === 'FAILED');

  if (failedSubs.length > 0) {
    actions.push({
      id: generateId('act'),
      type: 'ISOLATE',
      description: `Isolate failed substations: ${failedSubs.map((s) => s.name).join(', ')}`,
      targetAssetIds: failedSubs.map((s) => s.id),
      estimatedBenefitMW: 0, // Isolation doesn't directly restore power
      executed: false,
    });
  }

  // === Strategy 2: Dispatch batteries ===
  const availableBatteries = topology.batteries.filter(
    (b) => b.status !== 'FAILED' && b.socPercent > THRESHOLDS.BATTERY_WARNING_SOC,
  );
  if (availableBatteries.length > 0 && powerBalance.netBalanceMW < 0) {
    const totalDischarge = availableBatteries.reduce(
      (sum, b) => sum + Math.min(b.maxDischargeRateMW, b.stateOfChargeMWh * 3600),
      0,
    );
    actions.push({
      id: generateId('act'),
      type: 'DISPATCH_BATTERY',
      description: `Dispatch ${availableBatteries.length} batteries (max ${totalDischarge.toFixed(0)} MW available)`,
      targetAssetIds: availableBatteries.map((b) => b.id),
      estimatedBenefitMW: Math.min(totalDischarge, Math.abs(powerBalance.netBalanceMW)),
      executed: false,
    });
  }

  // === Strategy 3: Increase thermal generation ===
  const thermalGens = topology.generators.filter(
    (g) => g.type === 'thermal' && g.status !== 'FAILED' && g.currentOutputMW < g.capacityMW * 0.95,
  );
  if (thermalGens.length > 0 && powerBalance.netBalanceMW < 0) {
    const rampPotential = thermalGens.reduce(
      (sum, g) => sum + (g.capacityMW * 0.95 - g.currentOutputMW),
      0,
    );
    actions.push({
      id: generateId('act'),
      type: 'INCREASE_GENERATION',
      description: `Ramp up ${thermalGens.length} thermal units (+${rampPotential.toFixed(0)} MW potential)`,
      targetAssetIds: thermalGens.map((g) => g.id),
      estimatedBenefitMW: rampPotential,
      executed: false,
    });
  }

  // === Strategy 4: Shed low-priority loads if still in deficit ===
  const disconnectedMW = topology.loads
    .filter((l) => !l.connected)
    .reduce((sum, l) => sum + l.baseDemandMW, 0);
  const deficit = Math.abs(Math.min(0, powerBalance.netBalanceMW));

  if (deficit > 0) {
    // Shed loads in reverse priority order
    const shedCandidates = topology.loads
      .filter((l) => l.connected && l.priority === 'low')
      .sort((a, b) => a.demandMW - b.demandMW);

    if (shedCandidates.length > 0) {
      const shedMW = shedCandidates.reduce((sum, l) => sum + l.demandMW, 0);
      actions.push({
        id: generateId('act'),
        type: 'SHED_LOAD',
        description: `Shed ${shedCandidates.length} low-priority loads (${shedMW.toFixed(0)} MW)`,
        targetAssetIds: shedCandidates.map((l) => l.id),
        estimatedBenefitMW: shedMW,
        executed: false,
      });
    }
  }

  // === Strategy 5: Prioritize critical loads ===
  const disconnectedCritical = topology.loads.filter(
    (l) => !l.connected && (l.priority === 'critical' || l.priority === 'high'),
  );
  if (disconnectedCritical.length > 0) {
    actions.push({
      id: generateId('act'),
      type: 'PRIORITIZE_CRITICAL',
      description: `Restore ${disconnectedCritical.length} critical/high-priority loads (${disconnectedCritical.reduce((s, l) => s + l.baseDemandMW, 0).toFixed(0)} MW)`,
      targetAssetIds: disconnectedCritical.map((l) => l.id),
      estimatedBenefitMW: disconnectedCritical.reduce((s, l) => s + l.baseDemandMW, 0),
      executed: false,
    });
  }

  // === Strategy 6: Reroute via alternate paths ===
  if (failedLines.length > 0) {
    const reroutableLines = failedLines.filter((fl) => {
      // Check if there's an alternate path between the two substations
      const alternates = topology.transmissionLines.filter(
        (l) =>
          l.id !== fl.id &&
          l.status !== 'FAILED' &&
          l.loadingPercent < THRESHOLDS.LINE_WARNING_PERCENT &&
          (l.fromId === fl.fromId || l.toId === fl.toId ||
            l.fromId === fl.toId || l.toId === fl.fromId),
      );
      return alternates.length > 0;
    });

    if (reroutableLines.length > 0) {
      actions.push({
        id: generateId('act'),
        type: 'REROUTE',
        description: `Reroute power via alternate paths for ${reroutableLines.length} failed lines`,
        targetAssetIds: reroutableLines.map((l) => l.id),
        estimatedBenefitMW: reroutableLines.reduce((s, l) => s + l.capacityMW * 0.5, 0),
        executed: false,
      });
    }
  }

  const preMetrics = computeRecoveryMetrics(topology, powerBalance);

  return {
    id: generateId('plan'),
    generatedAtTick: tick,
    failureEventId: failure.id,
    actions,
    preRecoveryMetrics: preMetrics,
    status: 'PROPOSED',
  };
}

// ─── Execute Recovery Action ────────────────────────────────────────

/**
 * Execute a single recovery action.
 * Mutates the topology and returns event log entries.
 */
export function executeRecoveryAction(
  action: RecoveryAction,
  topology: GridTopology,
  tick: number,
): EventLogEntry[] {
  const events: EventLogEntry[] = [];
  action.executed = true;
  action.executedAtTick = tick;

  switch (action.type) {
    case 'ISOLATE': {
      // Already handled by failure injection — mark as done
      action.actualBenefitMW = 0;
      events.push({
        id: generateId('evt'),
        type: 'RECOVERY_ACTION',
        tick,
        timestamp: tickToTimestamp(tick),
        message: `Isolated failed components: ${action.targetAssetIds.length} assets`,
        severity: 'INFO',
        relatedAssetIds: action.targetAssetIds,
        data: { actionType: action.type },
      });
      break;
    }

    case 'DISPATCH_BATTERY': {
      let totalDispatched = 0;
      for (const batId of action.targetAssetIds) {
        const bat = topology.batteries.find((b) => b.id === batId);
        if (bat && bat.status !== 'FAILED') {
          bat.currentFlowMW = bat.maxDischargeRateMW;
          totalDispatched += bat.maxDischargeRateMW;
        }
      }
      action.actualBenefitMW = totalDispatched;
      events.push({
        id: generateId('evt'),
        type: 'BATTERY_DISPATCHED',
        tick,
        timestamp: tickToTimestamp(tick),
        message: `Dispatched ${action.targetAssetIds.length} batteries (+${totalDispatched.toFixed(0)} MW)`,
        severity: 'INFO',
        relatedAssetIds: action.targetAssetIds,
        data: { dispatchedMW: totalDispatched },
      });
      break;
    }

    case 'INCREASE_GENERATION': {
      let totalIncrease = 0;
      for (const genId of action.targetAssetIds) {
        const gen = topology.generators.find((g) => g.id === genId);
        if (gen && gen.status !== 'FAILED' && gen.type === 'thermal') {
          const increase = gen.capacityMW * 0.95 - gen.currentOutputMW;
          gen.currentOutputMW = gen.capacityMW * 0.95;
          totalIncrease += increase;
        }
      }
      action.actualBenefitMW = totalIncrease;
      events.push({
        id: generateId('evt'),
        type: 'GENERATION_CHANGE',
        tick,
        timestamp: tickToTimestamp(tick),
        message: `Ramped thermal generation (+${totalIncrease.toFixed(0)} MW)`,
        severity: 'INFO',
        relatedAssetIds: action.targetAssetIds,
        data: { increaseMW: totalIncrease },
      });
      break;
    }

    case 'SHED_LOAD': {
      let totalShed = 0;
      for (const loadId of action.targetAssetIds) {
        const load = topology.loads.find((l) => l.id === loadId);
        if (load && load.connected) {
          totalShed += load.demandMW;
          load.connected = false;
          load.status = 'ISOLATED';
        }
      }
      action.actualBenefitMW = totalShed;
      events.push({
        id: generateId('evt'),
        type: 'LOAD_DISCONNECTED',
        tick,
        timestamp: tickToTimestamp(tick),
        message: `Shed ${action.targetAssetIds.length} low-priority loads (${totalShed.toFixed(0)} MW)`,
        severity: 'WARNING',
        relatedAssetIds: action.targetAssetIds,
        data: { shedMW: totalShed },
      });
      break;
    }

    case 'RESTORE_LOAD':
    case 'PRIORITIZE_CRITICAL': {
      let totalRestored = 0;
      for (const loadId of action.targetAssetIds) {
        const load = topology.loads.find((l) => l.id === loadId);
        if (load && !load.connected) {
          // Check if the connected substation is online
          const sub = topology.substations.find((s) => s.id === load.connectedTo);
          if (sub && sub.status !== 'FAILED') {
            load.connected = true;
            load.status = 'ONLINE';
            totalRestored += load.baseDemandMW;
          }
        }
      }
      action.actualBenefitMW = totalRestored;
      events.push({
        id: generateId('evt'),
        type: 'LOAD_RESTORED',
        tick,
        timestamp: tickToTimestamp(tick),
        message: `Restored ${action.targetAssetIds.length} loads (${totalRestored.toFixed(0)} MW)`,
        severity: 'INFO',
        relatedAssetIds: action.targetAssetIds,
        data: { restoredMW: totalRestored },
      });
      break;
    }

    case 'REROUTE': {
      events.push({
        id: generateId('evt'),
        type: 'RECOVERY_ACTION',
        tick,
        timestamp: tickToTimestamp(tick),
        message: `Rerouted power via alternate paths for ${action.targetAssetIds.length} failed lines`,
        severity: 'INFO',
        relatedAssetIds: action.targetAssetIds,
        data: { actionType: action.type },
      });
      action.actualBenefitMW = action.estimatedBenefitMW * 0.8; // ~80% effective
      break;
    }
  }

  return events;
}

/**
 * Execute all actions in a recovery plan.
 */
export function executeRecoveryPlan(
  plan: RecoveryPlan,
  topology: GridTopology,
  powerBalance: PowerBalance,
  tick: number,
): EventLogEntry[] {
  const events: EventLogEntry[] = [];

  plan.status = 'EXECUTING';

  events.push({
    id: generateId('evt'),
    type: 'RECOVERY_STARTED',
    tick,
    timestamp: tickToTimestamp(tick),
    message: `Recovery plan initiated: ${plan.actions.length} actions`,
    severity: 'INFO',
    relatedAssetIds: [],
    data: { planId: plan.id, actionCount: plan.actions.length },
  });

  for (const action of plan.actions) {
    if (!action.executed) {
      events.push(...executeRecoveryAction(action, topology, tick));
    }
  }

  plan.postRecoveryMetrics = computeRecoveryMetrics(topology, powerBalance);
  plan.status = plan.actions.every((a) => a.executed) ? 'COMPLETED' : 'PARTIAL';

  events.push({
    id: generateId('evt'),
    type: 'RECOVERY_COMPLETE',
    tick,
    timestamp: tickToTimestamp(tick),
    message: `Recovery plan ${plan.status.toLowerCase()}: ${plan.actions.filter((a) => a.executed).length}/${plan.actions.length} actions executed`,
    severity: 'INFO',
    relatedAssetIds: [],
    data: {
      planId: plan.id,
      status: plan.status,
      stabilityBefore: plan.preRecoveryMetrics.stabilityIndex,
      stabilityAfter: plan.postRecoveryMetrics.stabilityIndex,
    },
  });

  return events;
}
