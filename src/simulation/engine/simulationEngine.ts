// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Core Simulation Engine
// ═══════════════════════════════════════════════════════════════════════
// Computes the physics of the grid on every tick:
// 1. Update resource factors (solar irradiance, wind speed)
// 2. Compute generator outputs
// 3. Compute load demands (time-of-day adjusted)
// 4. Compute power balance
// 5. Dispatch batteries (charge when surplus, discharge when deficit)
// 6. Compute transmission line flows (DC power flow approximation)
// 7. Compute losses
// 8. Compute frequency deviation
// 9. Compute voltage at each substation
// 10. Detect overloads
// ═══════════════════════════════════════════════════════════════════════

import type {
  GridTopology,
  Generator,
  Substation,
  TransmissionLine,
  Battery,
  Load,
  PowerBalance,
  SystemMetrics,
  AssetStatus,
} from '@/types';

import {
  SeededRandom,
  clamp,
  solarIrradianceFactor,
  demandProfileFactor,
  computeLineLoss,
  computeFrequencyDeviation,
  computeVoltagePU,
  tickToFractionalHour,
} from '@/lib/utils';

// ─── Thresholds ─────────────────────────────────────────────────────

export const THRESHOLDS = {
  /** Line loading above this triggers WARNING */
  LINE_WARNING_PERCENT: 80,
  /** Line loading above this triggers OVERLOAD */
  LINE_OVERLOAD_PERCENT: 100,
  /** Line loading above this triggers TRIP (cascading failure) */
  LINE_TRIP_PERCENT: 120,
  /** Substation loading above this triggers WARNING */
  SUB_WARNING_PERCENT: 75,
  /** Substation loading above this triggers OVERLOAD */
  SUB_OVERLOAD_PERCENT: 100,
  /** Frequency deviation above this triggers WARNING (Hz) */
  FREQ_WARNING_HZ: 0.2,
  /** Frequency deviation above this triggers CRITICAL (Hz) */
  FREQ_CRITICAL_HZ: 0.5,
  /** Voltage below this triggers WARNING (per-unit) */
  VOLTAGE_WARNING_LOW: 0.95,
  /** Voltage below this triggers CRITICAL (per-unit) */
  VOLTAGE_CRITICAL_LOW: 0.90,
  /** Voltage above this triggers WARNING (per-unit) */
  VOLTAGE_WARNING_HIGH: 1.05,
  /** Battery SOC below this triggers WARNING */
  BATTERY_WARNING_SOC: 0.2,
  /** Battery SOC below this triggers CRITICAL */
  BATTERY_CRITICAL_SOC: 0.1,
  /** Nominal frequency Hz */
  NOMINAL_FREQUENCY: 50.0,
};

// ─── Step 1: Update Resource Factors ────────────────────────────────

export function updateResourceFactors(
  generators: Generator[],
  tick: number,
  rng: SeededRandom,
): void {
  const hour = tickToFractionalHour(tick);

  for (const gen of generators) {
    if (gen.status === 'FAILED' || gen.status === 'OFFLINE') continue;

    switch (gen.type) {
      case 'solar':
        // Solar follows irradiance curve + small noise
        gen.resourceFactor = clamp(
          solarIrradianceFactor(hour) + rng.gaussian() * 0.02,
          0,
          1,
        );
        break;

      case 'wind':
        // Wind varies slowly with occasional gusts
        // Random walk with mean-reversion
        const windDelta = rng.gaussian() * 0.005;
        const meanReversion = (0.5 - gen.resourceFactor) * 0.001;
        gen.resourceFactor = clamp(
          gen.resourceFactor + windDelta + meanReversion,
          0.05,
          1,
        );
        break;

      case 'thermal':
        // Thermal resource is always available (fuel)
        gen.resourceFactor = 1.0;
        break;
    }
  }
}

// ─── Step 2: Compute Generator Outputs ──────────────────────────────

export function computeGeneratorOutputs(generators: Generator[]): void {
  for (const gen of generators) {
    if (gen.status === 'FAILED' || gen.status === 'OFFLINE') {
      gen.currentOutputMW = 0;
      continue;
    }

    // Output = capacity × resource_factor × availability × efficiency_factor
    // For thermal, we want them to run at ~70-85% of capacity (baseload)
    let targetOutput: number;
    if (gen.type === 'thermal') {
      targetOutput = gen.capacityMW * gen.resourceFactor * gen.availability * 0.8;
    } else {
      targetOutput = gen.capacityMW * gen.resourceFactor * gen.availability;
    }

    // Apply ramp rate: output can't change faster than rampRateMW per minute
    // Each tick is 1 second, so max change per tick = rampRateMW / 60
    const maxDelta = gen.rampRateMW / 60;
    const delta = targetOutput - gen.currentOutputMW;
    gen.currentOutputMW = gen.currentOutputMW + clamp(delta, -maxDelta, maxDelta);
    gen.currentOutputMW = clamp(gen.currentOutputMW, 0, gen.capacityMW);
  }
}

// ─── Step 3: Compute Load Demands ───────────────────────────────────

export function computeLoadDemands(
  loads: Load[],
  tick: number,
  rng: SeededRandom,
): void {
  const hour = tickToFractionalHour(tick);
  const demandFactor = demandProfileFactor(hour);

  for (const load of loads) {
    if (load.status === 'FAILED' || load.status === 'OFFLINE' || !load.connected) {
      load.demandMW = 0;
      continue;
    }

    // Base demand × time-of-day factor × per-type modifier + noise
    let typeFactor = 1.0;
    switch (load.type) {
      case 'residential':
        // Higher in evenings
        typeFactor = 1.0;
        break;
      case 'industrial':
        // Flatter profile (24/7 operations), peaks mid-day
        typeFactor = 0.85 + 0.15 * Math.exp(-0.5 * ((hour - 14) / 4) ** 2);
        break;
      case 'commercial':
        // Peaks during business hours
        typeFactor = hour >= 8 && hour <= 18 ? 1.1 : 0.4;
        break;
      case 'ev_charging':
        // Peaks in evening (people come home)
        typeFactor = 0.2 + 0.8 * Math.exp(-0.5 * ((hour - 19) / 2) ** 2);
        break;
    }

    // Add some noise (± 3%)
    const noise = 1 + rng.gaussian() * 0.03;

    load.demandMW = clamp(
      load.baseDemandMW * demandFactor * typeFactor * noise,
      0,
      load.baseDemandMW * 2, // Cap at 2× base
    );
  }
}

// ─── Step 4: Compute Power Balance ──────────────────────────────────

export function computePowerBalance(
  generators: Generator[],
  loads: Load[],
  batteries: Battery[],
  totalLossesMW: number,
): PowerBalance {
  const solarMW = generators
    .filter((g) => g.type === 'solar')
    .reduce((sum, g) => sum + g.currentOutputMW, 0);
  const windMW = generators
    .filter((g) => g.type === 'wind')
    .reduce((sum, g) => sum + g.currentOutputMW, 0);
  const thermalMW = generators
    .filter((g) => g.type === 'thermal')
    .reduce((sum, g) => sum + g.currentOutputMW, 0);

  const totalGeneration = solarMW + windMW + thermalMW;
  const totalDemand = loads.reduce((sum, l) => sum + l.demandMW, 0);
  const totalBatteryFlow = batteries.reduce((sum, b) => sum + b.currentFlowMW, 0);

  const renewableFraction = totalGeneration > 0
    ? (solarMW + windMW) / totalGeneration
    : 0;

  return {
    totalGenerationMW: totalGeneration,
    totalDemandMW: totalDemand,
    totalBatteryFlowMW: totalBatteryFlow,
    totalLossesMW: totalLossesMW,
    netBalanceMW: totalGeneration + totalBatteryFlow - totalDemand - totalLossesMW,
    solarGenerationMW: solarMW,
    windGenerationMW: windMW,
    thermalGenerationMW: thermalMW,
    renewableFraction,
  };
}

// ─── Step 5: Dispatch Batteries ─────────────────────────────────────

export function dispatchBatteries(
  batteries: Battery[],
  totalGenerationMW: number,
  totalDemandMW: number,
  totalLossesMW: number,
): void {
  const surplus = totalGenerationMW - totalDemandMW - totalLossesMW;

  for (const battery of batteries) {
    if (battery.status === 'FAILED' || battery.status === 'OFFLINE') {
      battery.currentFlowMW = 0;
      continue;
    }

    if (surplus > 0) {
      // Excess generation → charge batteries
      const availableCapacity = battery.capacityMWh - battery.stateOfChargeMWh;
      const maxChargeThisTick = battery.maxChargeRateMW;
      // Divide surplus equally among available batteries
      const share = surplus / batteries.filter((b) => b.status === 'ONLINE').length;
      const chargeAmount = Math.min(share, maxChargeThisTick, availableCapacity);

      battery.currentFlowMW = -chargeAmount; // Negative = charging
      battery.stateOfChargeMWh = clamp(
        battery.stateOfChargeMWh + (chargeAmount * battery.efficiency) / 3600, // Per-second
        0,
        battery.capacityMWh,
      );
    } else if (surplus < 0) {
      // Deficit → discharge batteries
      const deficit = Math.abs(surplus);
      const maxDischargeThisTick = battery.maxDischargeRateMW;
      const share = deficit / batteries.filter((b) => b.status === 'ONLINE').length;
      const dischargeAmount = Math.min(share, maxDischargeThisTick, battery.stateOfChargeMWh * 3600);

      battery.currentFlowMW = dischargeAmount; // Positive = discharging
      battery.stateOfChargeMWh = clamp(
        battery.stateOfChargeMWh - dischargeAmount / 3600, // Per-second
        0,
        battery.capacityMWh,
      );
    } else {
      battery.currentFlowMW = 0;
    }

    // Update SOC percent
    battery.socPercent = battery.capacityMWh > 0
      ? battery.stateOfChargeMWh / battery.capacityMWh
      : 0;

    // Update status based on SOC
    if ((battery.status as string) !== 'FAILED') {
      if (battery.socPercent < THRESHOLDS.BATTERY_CRITICAL_SOC) {
        battery.status = 'WARNING';
      } else {
        battery.status = 'ONLINE';
      }
    }
  }
}

// ─── Step 6: Compute Transmission Line Flows ────────────────────────

/**
 * Simplified DC power flow approximation.
 * For each line, flow is determined by the balance of generation and demand
 * at the connected substations.
 */
export function computeTransmissionFlows(
  lines: TransmissionLine[],
  substations: Substation[],
  generators: Generator[],
  loads: Load[],
  batteries: Battery[],
): void {
  // Build a map of net injection per substation
  const substationMap = new Map<string, Substation>();
  const netInjection = new Map<string, number>();

  for (const sub of substations) {
    substationMap.set(sub.id, sub);
    netInjection.set(sub.id, 0);
  }

  // Add generation
  for (const gen of generators) {
    for (const subId of gen.connectedTo) {
      const current = netInjection.get(subId) ?? 0;
      netInjection.set(subId, current + gen.currentOutputMW);
    }
  }

  // Subtract load
  for (const load of loads) {
    if (load.connected && load.demandMW > 0) {
      const current = netInjection.get(load.connectedTo) ?? 0;
      netInjection.set(load.connectedTo, current - load.demandMW);
    }
  }

  // Add battery flow (positive = injecting into grid)
  for (const battery of batteries) {
    const current = netInjection.get(battery.connectedTo) ?? 0;
    netInjection.set(battery.connectedTo, current + battery.currentFlowMW);
  }

  // Compute line flows from injection differences
  for (const line of lines) {
    if (line.status === 'FAILED' || line.status === 'OFFLINE') {
      line.currentFlowMW = 0;
      line.loadingPercent = 0;
      line.lossesMW = 0;
      continue;
    }

    const fromInjection = netInjection.get(line.fromId) ?? 0;
    const toInjection = netInjection.get(line.toId) ?? 0;

    // Flow direction: from high-injection to low-injection
    // Magnitude proportional to injection difference and inversely proportional to impedance (~ length)
    const impedanceFactor = 1 / Math.max(line.lengthKm, 1);
    line.currentFlowMW = (fromInjection - toInjection) * 0.5 * impedanceFactor * line.capacityMW * 0.01;

    // Clamp flow to a reasonable range (can exceed capacity = overload)
    line.currentFlowMW = clamp(line.currentFlowMW, -line.capacityMW * 1.5, line.capacityMW * 1.5);

    line.loadingPercent = line.capacityMW > 0
      ? (Math.abs(line.currentFlowMW) / line.capacityMW) * 100
      : 0;

    line.lossesMW = computeLineLoss(line.currentFlowMW, line.capacityMW, line.lengthKm);

    // Update line status
    if ((line.status as string) !== 'FAILED') {
      if (line.loadingPercent >= THRESHOLDS.LINE_OVERLOAD_PERCENT) {
        line.status = 'OVERLOADED';
      } else if (line.loadingPercent >= THRESHOLDS.LINE_WARNING_PERCENT) {
        line.status = 'WARNING';
      } else {
        line.status = 'ONLINE';
      }
    }
  }

  // Update substation loading
  for (const sub of substations) {
    if (sub.status === 'FAILED' || sub.status === 'OFFLINE') {
      sub.currentLoadMW = 0;
      continue;
    }

    // Substation load = sum of absolute flows on its lines
    const connectedLineFlows = lines
      .filter((l) => l.fromId === sub.id || l.toId === sub.id)
      .reduce((sum, l) => sum + Math.abs(l.currentFlowMW), 0);

    sub.currentLoadMW = connectedLineFlows / 2; // Divide by 2 because each line is counted twice

    const loadingPercent = sub.capacityMW > 0
      ? (sub.currentLoadMW / sub.capacityMW) * 100
      : 0;

    // Update substation status
    if ((sub.status as string) !== 'FAILED') {
      if (loadingPercent >= THRESHOLDS.SUB_OVERLOAD_PERCENT) {
        sub.status = 'OVERLOADED';
      } else if (loadingPercent >= THRESHOLDS.SUB_WARNING_PERCENT) {
        sub.status = 'WARNING';
      } else {
        sub.status = 'ONLINE';
      }
    }
  }
}

// ─── Step 7: Total Losses ───────────────────────────────────────────

export function computeTotalLosses(lines: TransmissionLine[]): number {
  return lines.reduce((sum, l) => sum + l.lossesMW, 0);
}

// ─── Step 8: Frequency ──────────────────────────────────────────────

export function updateFrequency(
  substations: Substation[],
  totalGenerationMW: number,
  totalDemandMW: number,
  totalCapacityMW: number,
): void {
  const deviation = computeFrequencyDeviation(totalGenerationMW, totalDemandMW, totalCapacityMW);

  for (const sub of substations) {
    if (sub.status === 'FAILED' || sub.status === 'OFFLINE') {
      sub.frequencyHz = 0;
      continue;
    }
    sub.frequencyHz = THRESHOLDS.NOMINAL_FREQUENCY + deviation;
  }
}

// ─── Step 9: Voltage ────────────────────────────────────────────────

export function updateVoltage(substations: Substation[]): void {
  for (const sub of substations) {
    if (sub.status === 'FAILED' || sub.status === 'OFFLINE') {
      sub.voltagePU = 0;
      continue;
    }
    const loadingPercent = sub.capacityMW > 0
      ? (sub.currentLoadMW / sub.capacityMW) * 100
      : 0;
    sub.voltagePU = computeVoltagePU(loadingPercent);
  }
}

// ─── Step 10: Compute System Metrics ────────────────────────────────

export function computeSystemMetrics(
  topology: GridTopology,
  powerBalance: PowerBalance,
): SystemMetrics {
  const { generators, substations, transmissionLines, batteries, loads } = topology;

  const totalCapacity = generators.reduce((sum, g) => sum + g.capacityMW, 0);
  const connectedLoads = loads.filter((l) => l.connected);
  const disconnectedLoads = loads.filter((l) => !l.connected);
  const totalDemand = loads.reduce((sum, l) => sum + l.baseDemandMW, 0);
  const servedDemand = connectedLoads.reduce((sum, l) => sum + l.demandMW, 0);
  const unservedLoad = disconnectedLoads.reduce((sum, l) => sum + l.baseDemandMW, 0);
  const affectedConsumers = disconnectedLoads.reduce((sum, l) => sum + l.consumerCount, 0);

  const criticalLoads = loads.filter((l) => l.priority === 'critical' || l.priority === 'high');
  const criticalServed = criticalLoads.filter((l) => l.connected).length;

  const onlineLines = transmissionLines.filter((l) => l.status !== 'FAILED' && l.status !== 'OFFLINE');
  const avgLineLoading = onlineLines.length > 0
    ? onlineLines.reduce((sum, l) => sum + l.loadingPercent, 0) / onlineLines.length
    : 0;
  const maxLineLoading = onlineLines.length > 0
    ? Math.max(...onlineLines.map((l) => l.loadingPercent))
    : 0;

  const avgBatterySOC = batteries.length > 0
    ? batteries.reduce((sum, b) => sum + b.socPercent, 0) / batteries.length
    : 0;

  const failedAssets = [
    ...generators.filter((g) => g.status === 'FAILED'),
    ...substations.filter((s) => s.status === 'FAILED'),
    ...transmissionLines.filter((l) => l.status === 'FAILED'),
    ...batteries.filter((b) => b.status === 'FAILED'),
  ];

  const onlineSubs = substations.filter((s) => s.status !== 'FAILED' && s.status !== 'OFFLINE');
  const avgVoltage = onlineSubs.length > 0
    ? onlineSubs.reduce((sum, s) => sum + s.voltagePU, 0) / onlineSubs.length
    : 0;
  const avgFreq = onlineSubs.length > 0
    ? onlineSubs.reduce((sum, s) => sum + s.frequencyHz, 0) / onlineSubs.length
    : THRESHOLDS.NOMINAL_FREQUENCY;

  return {
    totalCapacityMW: totalCapacity,
    totalGenerationMW: powerBalance.totalGenerationMW,
    totalDemandMW: powerBalance.totalDemandMW,
    loadServedPercent: totalDemand > 0 ? (servedDemand / totalDemand) * 100 : 100,
    unservedLoadMW: unservedLoad,
    renewablePercent: powerBalance.renewableFraction * 100,
    avgBatterySOCPercent: avgBatterySOC * 100,
    avgLineLoadingPercent: avgLineLoading,
    maxLineLoadingPercent: maxLineLoading,
    failedAssetCount: failedAssets.length,
    affectedConsumers,
    criticalLoadsServedPercent: criticalLoads.length > 0
      ? (criticalServed / criticalLoads.length) * 100
      : 100,
    systemFrequencyHz: avgFreq,
    voltageHealthIndex: avgVoltage,
    frequencyDeviationHz: Math.abs(avgFreq - THRESHOLDS.NOMINAL_FREQUENCY),
    totalLossesMW: powerBalance.totalLossesMW,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN TICK FUNCTION
// ═══════════════════════════════════════════════════════════════════════

export interface TickResult {
  powerBalance: PowerBalance;
  metrics: SystemMetrics;
}

/**
 * Execute a single simulation tick.
 * This is the authoritative state update — everything flows from here.
 */
export function simulationTick(
  topology: GridTopology,
  tick: number,
  rng: SeededRandom,
): TickResult {
  const { generators, substations, transmissionLines, batteries, loads } = topology;
  const totalCapacity = generators.reduce((sum, g) => sum + g.capacityMW, 0);

  // Step 1: Update resource factors
  updateResourceFactors(generators, tick, rng);

  // Step 2: Compute generator outputs
  computeGeneratorOutputs(generators);

  // Step 3: Compute load demands
  computeLoadDemands(loads, tick, rng);

  // Pre-compute generation and demand for battery dispatch
  const preGeneration = generators.reduce((sum, g) => sum + g.currentOutputMW, 0);
  const preDemand = loads.reduce((sum, l) => sum + l.demandMW, 0);

  // Step 5: Dispatch batteries (using pre-loss estimate)
  const estimatedLosses = preGeneration * 0.02; // Rough 2% loss estimate for dispatch
  dispatchBatteries(batteries, preGeneration, preDemand, estimatedLosses);

  // Step 6: Compute transmission flows (updates line loading + substation loading)
  computeTransmissionFlows(transmissionLines, substations, generators, loads, batteries);

  // Step 7: Compute actual losses
  const totalLosses = computeTotalLosses(transmissionLines);

  // Step 4: Compute power balance (uses actual losses)
  const powerBalance = computePowerBalance(generators, loads, batteries, totalLosses);

  // Step 8: Update frequency
  updateFrequency(
    substations,
    powerBalance.totalGenerationMW + powerBalance.totalBatteryFlowMW,
    powerBalance.totalDemandMW,
    totalCapacity,
  );

  // Step 9: Update voltage
  updateVoltage(substations);

  // Step 10: Compute metrics
  const metrics = computeSystemMetrics(topology, powerBalance);

  return { powerBalance, metrics };
}
