// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Deterministic Grid Topology Generator
// ═══════════════════════════════════════════════════════════════════════
// Produces a realistic power grid from a seed value.
// Same seed ALWAYS produces the same grid.
// ═══════════════════════════════════════════════════════════════════════

import type {
  Generator,
  GeneratorType,
  Substation,
  TransmissionLine,
  Battery,
  Load,
  LoadType,
  LoadPriority,
  GridTopology,
  GridPosition,
} from '@/types';

import { SeededRandom, generateId, resetIdCounter, distance2D } from '@/lib/utils';

// ─── Grid Configuration ─────────────────────────────────────────────

interface GridConfig {
  /** Seed for deterministic generation */
  seed: number;
  /** Number of transmission substations */
  transmissionSubstations: number;
  /** Number of distribution substations */
  distributionSubstations: number;
  /** Solar farm count */
  solarFarms: number;
  /** Wind farm count */
  windFarms: number;
  /** Thermal plant count */
  thermalPlants: number;
  /** Battery storage count */
  batteries: number;
  /** Load areas (consumers) */
  residential: number;
  industrial: number;
  commercial: number;
  evCharging: number;
  /** Grid spatial extent */
  gridWidth: number;
  gridHeight: number;
}

const DEFAULT_CONFIG: GridConfig = {
  seed: 42,
  transmissionSubstations: 4,
  distributionSubstations: 8,
  solarFarms: 3,
  windFarms: 2,
  thermalPlants: 2,
  batteries: 3,
  residential: 6,
  industrial: 3,
  commercial: 4,
  evCharging: 2,
  gridWidth: 800,
  gridHeight: 600,
};

// ─── Generator ──────────────────────────────────────────────────────

function generateGenerators(rng: SeededRandom, config: GridConfig): Generator[] {
  const generators: Generator[] = [];

  // Solar farms — large capacity, intermittent
  for (let i = 0; i < config.solarFarms; i++) {
    const capacity = rng.range(80, 200);
    generators.push({
      id: generateId('gen'),
      name: `Solar Farm ${i + 1}`,
      type: 'solar',
      capacityMW: Math.round(capacity),
      currentOutputMW: 0, // Set by simulation engine
      availability: rng.range(0.92, 0.99),
      efficiency: rng.range(0.18, 0.25),
      status: 'ONLINE',
      resourceFactor: 0, // Set by simulation based on time-of-day
      position: {
        x: rng.range(50, config.gridWidth * 0.4),
        y: rng.range(50, config.gridHeight - 50),
      },
      connectedTo: [], // Linked after substations are generated
      rampRateMW: capacity * 0.1, // Solar ramps at ~10%/min
    });
  }

  // Wind farms — medium-large capacity, variable
  for (let i = 0; i < config.windFarms; i++) {
    const capacity = rng.range(100, 250);
    generators.push({
      id: generateId('gen'),
      name: `Wind Farm ${i + 1}`,
      type: 'wind',
      capacityMW: Math.round(capacity),
      currentOutputMW: 0,
      availability: rng.range(0.90, 0.97),
      efficiency: rng.range(0.30, 0.45),
      status: 'ONLINE',
      resourceFactor: rng.range(0.3, 0.8), // Initial wind factor
      position: {
        x: rng.range(config.gridWidth * 0.6, config.gridWidth - 50),
        y: rng.range(50, config.gridHeight * 0.5),
      },
      connectedTo: [],
      rampRateMW: capacity * 0.05, // Wind ramps slower
    });
  }

  // Thermal plants — large capacity, dispatchable
  for (let i = 0; i < config.thermalPlants; i++) {
    const capacity = rng.range(200, 500);
    generators.push({
      id: generateId('gen'),
      name: `Thermal Plant ${i + 1}`,
      type: 'thermal',
      capacityMW: Math.round(capacity),
      currentOutputMW: 0,
      availability: rng.range(0.85, 0.95),
      efficiency: rng.range(0.35, 0.45),
      status: 'ONLINE',
      resourceFactor: 1.0, // Fuel always available
      position: {
        x: rng.range(config.gridWidth * 0.3, config.gridWidth * 0.7),
        y: rng.range(50, config.gridHeight * 0.4),
      },
      connectedTo: [],
      rampRateMW: capacity * 0.03, // Thermal ramps slowest
    });
  }

  return generators;
}

// ─── Substations ────────────────────────────────────────────────────

function generateSubstations(rng: SeededRandom, config: GridConfig): Substation[] {
  const substations: Substation[] = [];

  // Transmission substations — high capacity hubs
  for (let i = 0; i < config.transmissionSubstations; i++) {
    substations.push({
      id: generateId('sub'),
      name: `Transmission Sub ${i + 1}`,
      type: 'transmission',
      capacityMW: Math.round(rng.range(400, 800)),
      currentLoadMW: 0,
      voltagePU: 1.0,
      frequencyHz: 50.0,
      status: 'ONLINE',
      position: {
        // Spread across the grid in a rough grid pattern
        x: ((i % 2) + 0.5) * (config.gridWidth / 2) + rng.range(-60, 60),
        y: (Math.floor(i / 2) + 0.5) * (config.gridHeight / 2) + rng.range(-60, 60),
      },
      connectedLines: [],
      connectedLoads: [],
      connectedGenerators: [],
    });
  }

  // Distribution substations — lower capacity, closer to loads
  for (let i = 0; i < config.distributionSubstations; i++) {
    substations.push({
      id: generateId('sub'),
      name: `Distribution Sub ${i + 1}`,
      type: 'distribution',
      capacityMW: Math.round(rng.range(50, 200)),
      currentLoadMW: 0,
      voltagePU: 1.0,
      frequencyHz: 50.0,
      status: 'ONLINE',
      position: {
        x: rng.range(100, config.gridWidth - 100),
        y: rng.range(100, config.gridHeight - 100),
      },
      connectedLines: [],
      connectedLoads: [],
      connectedGenerators: [],
    });
  }

  return substations;
}

// ─── Transmission Lines ─────────────────────────────────────────────

function generateTransmissionLines(
  rng: SeededRandom,
  substations: Substation[],
): TransmissionLine[] {
  const lines: TransmissionLine[] = [];
  const transmissionSubs = substations.filter((s) => s.type === 'transmission');
  const distributionSubs = substations.filter((s) => s.type === 'distribution');

  // Connect all transmission substations to each other (mesh backbone)
  for (let i = 0; i < transmissionSubs.length; i++) {
    for (let j = i + 1; j < transmissionSubs.length; j++) {
      const from = transmissionSubs[i];
      const to = transmissionSubs[j];
      const dist = distance2D(from.position.x, from.position.y, to.position.x, to.position.y);
      const lengthKm = Math.round(dist * 0.5); // Scale factor
      const lineId = generateId('line');

      lines.push({
        id: lineId,
        name: `${from.name} ↔ ${to.name}`,
        fromId: from.id,
        toId: to.id,
        capacityMW: Math.round(rng.range(200, 500)),
        currentFlowMW: 0,
        loadingPercent: 0,
        lossesMW: 0,
        status: 'ONLINE',
        lengthKm: Math.max(lengthKm, 10),
      });

      from.connectedLines.push(lineId);
      to.connectedLines.push(lineId);
    }
  }

  // Connect each distribution substation to the nearest transmission substation
  for (const distSub of distributionSubs) {
    let nearestTrans = transmissionSubs[0];
    let nearestDist = Infinity;

    for (const transSub of transmissionSubs) {
      const d = distance2D(
        distSub.position.x, distSub.position.y,
        transSub.position.x, transSub.position.y,
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearestTrans = transSub;
      }
    }

    const lengthKm = Math.round(nearestDist * 0.3);
    const lineId = generateId('line');

    lines.push({
      id: lineId,
      name: `${nearestTrans.name} → ${distSub.name}`,
      fromId: nearestTrans.id,
      toId: distSub.id,
      capacityMW: Math.round(rng.range(80, 200)),
      currentFlowMW: 0,
      loadingPercent: 0,
      lossesMW: 0,
      status: 'ONLINE',
      lengthKm: Math.max(lengthKm, 5),
    });

    distSub.connectedLines.push(lineId);
    nearestTrans.connectedLines.push(lineId);

    // 40% chance of a redundant connection to a second transmission substation
    if (rng.chance(0.4) && transmissionSubs.length > 1) {
      const others = transmissionSubs.filter((s) => s.id !== nearestTrans.id);
      const secondTrans = rng.pick(others);
      const d2 = distance2D(
        distSub.position.x, distSub.position.y,
        secondTrans.position.x, secondTrans.position.y,
      );
      const lineId2 = generateId('line');

      lines.push({
        id: lineId2,
        name: `${secondTrans.name} → ${distSub.name} (redundant)`,
        fromId: secondTrans.id,
        toId: distSub.id,
        capacityMW: Math.round(rng.range(50, 150)),
        currentFlowMW: 0,
        loadingPercent: 0,
        lossesMW: 0,
        status: 'ONLINE',
        lengthKm: Math.max(Math.round(d2 * 0.3), 5),
      });

      distSub.connectedLines.push(lineId2);
      secondTrans.connectedLines.push(lineId2);
    }
  }

  return lines;
}

// ─── Batteries ──────────────────────────────────────────────────────

function generateBatteries(
  rng: SeededRandom,
  config: GridConfig,
  substations: Substation[],
): Battery[] {
  const batteries: Battery[] = [];
  const transmissionSubs = substations.filter((s) => s.type === 'transmission');

  for (let i = 0; i < config.batteries; i++) {
    const capacityMWh = Math.round(rng.range(50, 200));
    const maxRate = Math.round(capacityMWh * rng.range(0.2, 0.5)); // C-rate 0.2-0.5
    const connectedSub = rng.pick(transmissionSubs);
    const initialSOC = rng.range(0.5, 0.9);

    batteries.push({
      id: generateId('bat'),
      name: `Battery Storage ${i + 1}`,
      capacityMWh,
      stateOfChargeMWh: capacityMWh * initialSOC,
      socPercent: initialSOC,
      maxChargeRateMW: maxRate,
      maxDischargeRateMW: maxRate,
      currentFlowMW: 0,
      status: 'ONLINE',
      position: {
        x: connectedSub.position.x + rng.range(-40, 40),
        y: connectedSub.position.y + rng.range(-40, 40),
      },
      connectedTo: connectedSub.id,
      efficiency: rng.range(0.85, 0.95),
    });
  }

  return batteries;
}

// ─── Loads ───────────────────────────────────────────────────────────

function generateLoads(
  rng: SeededRandom,
  config: GridConfig,
  substations: Substation[],
): Load[] {
  const loads: Load[] = [];
  const distributionSubs = substations.filter((s) => s.type === 'distribution');

  const createLoads = (
    count: number,
    type: LoadType,
    namePrefix: string,
    demandRange: [number, number],
    priority: LoadPriority,
    consumerRange: [number, number],
  ) => {
    for (let i = 0; i < count; i++) {
      const sub = distributionSubs[i % distributionSubs.length];
      const baseDemand = Math.round(rng.range(demandRange[0], demandRange[1]));
      const loadId = generateId('load');

      loads.push({
        id: loadId,
        name: `${namePrefix} ${i + 1}`,
        type,
        demandMW: baseDemand, // Will be modulated by time-of-day
        baseDemandMW: baseDemand,
        priority,
        connected: true,
        status: 'ONLINE',
        position: {
          x: sub.position.x + rng.range(-60, 60),
          y: sub.position.y + rng.range(20, 80),
        },
        connectedTo: sub.id,
        consumerCount: rng.int(consumerRange[0], consumerRange[1]),
      });

      sub.connectedLoads.push(loadId);
    }
  };

  createLoads(config.residential, 'residential', 'Residential Zone', [20, 60], 'high', [5000, 25000]);
  createLoads(config.industrial, 'industrial', 'Industrial Zone', [40, 120], 'medium', [50, 200]);
  createLoads(config.commercial, 'commercial', 'Commercial District', [15, 50], 'medium', [200, 2000]);
  createLoads(config.evCharging, 'ev_charging', 'EV Charging Hub', [10, 40], 'low', [100, 500]);

  return loads;
}

// ─── Wire generators to substations ─────────────────────────────────

function connectGeneratorsToSubstations(
  generators: Generator[],
  substations: Substation[],
): void {
  const transmissionSubs = substations.filter((s) => s.type === 'transmission');

  for (const gen of generators) {
    // Find nearest transmission substation
    let nearest = transmissionSubs[0];
    let nearestDist = Infinity;

    for (const sub of transmissionSubs) {
      const d = distance2D(gen.position.x, gen.position.y, sub.position.x, sub.position.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = sub;
      }
    }

    gen.connectedTo.push(nearest.id);
    nearest.connectedGenerators.push(gen.id);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a complete, deterministic grid topology from a seed.
 * Same seed always produces the same grid.
 */
export function generateGridTopology(configOverrides?: Partial<GridConfig>): GridTopology {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const rng = new SeededRandom(config.seed);

  // Reset ID counter for determinism
  resetIdCounter();

  // Generate each layer
  const generators = generateGenerators(rng, config);
  const substations = generateSubstations(rng, config);
  const transmissionLines = generateTransmissionLines(rng, substations);
  const batteries = generateBatteries(rng, config, substations);
  const loads = generateLoads(rng, config, substations);

  // Wire generators ↔ substations
  connectGeneratorsToSubstations(generators, substations);

  return {
    generators,
    substations,
    transmissionLines,
    batteries,
    loads,
  };
}

/**
 * Compute total installed capacity from a topology.
 */
export function computeInstalledCapacity(topology: GridTopology): {
  totalMW: number;
  solarMW: number;
  windMW: number;
  thermalMW: number;
  storageMWh: number;
} {
  const solarMW = topology.generators
    .filter((g) => g.type === 'solar')
    .reduce((sum, g) => sum + g.capacityMW, 0);
  const windMW = topology.generators
    .filter((g) => g.type === 'wind')
    .reduce((sum, g) => sum + g.capacityMW, 0);
  const thermalMW = topology.generators
    .filter((g) => g.type === 'thermal')
    .reduce((sum, g) => sum + g.capacityMW, 0);
  const storageMWh = topology.batteries.reduce((sum, b) => sum + b.capacityMWh, 0);

  return { totalMW: solarMW + windMW + thermalMW, solarMW, windMW, thermalMW, storageMWh };
}

/**
 * Find all substations reachable from a given substation via online transmission lines.
 * Used by cascading failure engine to find islands.
 */
export function findConnectedSubstations(
  startSubId: string,
  substations: Substation[],
  lines: TransmissionLine[],
): Set<string> {
  const visited = new Set<string>();
  const queue = [startSubId];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // Find all online lines connected to this substation
    const connectedLines = lines.filter(
      (l) =>
        l.status === 'ONLINE' &&
        (l.fromId === current || l.toId === current),
    );

    for (const line of connectedLines) {
      const nextId = line.fromId === current ? line.toId : line.fromId;
      if (!visited.has(nextId)) {
        queue.push(nextId);
      }
    }
  }

  return visited;
}
