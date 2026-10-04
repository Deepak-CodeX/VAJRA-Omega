// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Scenario Definitions
// ═══════════════════════════════════════════════════════════════════════

import type { Scenario, ScenarioId } from '@/types';

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  NORMAL_OPERATION: {
    id: 'NORMAL_OPERATION',
    name: 'Normal Operation',
    description: 'Grid operating under normal conditions with typical generation and demand patterns.',
    failures: [],
  },

  SUBSTATION_FAILURE: {
    id: 'SUBSTATION_FAILURE',
    name: 'Substation Failure',
    description: 'A major transmission substation fails, disconnecting multiple distribution feeders and loads.',
    failures: ['SUBSTATION_FAILURE'],
  },

  TRANSMISSION_FAILURE: {
    id: 'TRANSMISSION_FAILURE',
    name: 'Transmission Line Failure',
    description: 'A critical backbone transmission line fails, forcing flow redistribution through alternate paths.',
    failures: ['LINE_FAILURE'],
  },

  RENEWABLE_DROP: {
    id: 'RENEWABLE_DROP',
    name: 'Renewable Generation Drop',
    description: 'Sudden cloud cover reduces solar output to near-zero while wind also drops to minimal levels.',
    failures: ['SOLAR_COLLAPSE', 'WIND_REDUCTION'],
  },

  EXTREME_DEMAND: {
    id: 'EXTREME_DEMAND',
    name: 'Extreme Demand Spike',
    description: 'Heatwave drives all load categories to 150% of normal demand levels.',
    failures: ['DEMAND_SPIKE'],
  },

  EV_SURGE: {
    id: 'EV_SURGE',
    name: 'EV Charging Surge',
    description: 'Mass EV charging event triples EV load demand, stressing distribution substations.',
    failures: ['EV_SURGE'],
  },

  BATTERY_UNAVAILABLE: {
    id: 'BATTERY_UNAVAILABLE',
    name: 'Battery Storage Failure',
    description: 'All battery storage units fail simultaneously, removing grid flexibility.',
    failures: ['BATTERY_FAILURE'],
  },

  MULTI_FAULT_CASCADE: {
    id: 'MULTI_FAULT_CASCADE',
    name: 'Multi-Fault Cascade',
    description: 'A transmission line failure during low renewable generation with elevated demand — the worst-case scenario.',
    failures: ['LINE_FAILURE', 'SOLAR_COLLAPSE', 'DEMAND_SPIKE'],
  },
};

export function getScenario(id: ScenarioId): Scenario {
  return SCENARIOS[id];
}

export function getAllScenarios(): Scenario[] {
  return Object.values(SCENARIOS);
}
