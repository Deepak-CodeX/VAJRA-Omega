// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Central Zustand Store
// ═══════════════════════════════════════════════════════════════════════
// Single source of truth for all simulation state.
// The store wraps the simulation engine and orchestrates:
// - Initialization (grid generation)
// - Tick execution (simulation step)
// - Scenario activation
// - Failure injection
// - Recovery execution
// - Snapshot capture (before/after comparison)
// ═══════════════════════════════════════════════════════════════════════

import { create } from 'zustand';
import type {
  SimulationState,
  SimulationClock,
  SimulationSpeed,
  GridTopology,
  PowerBalance,
  SystemMetrics,
  Anomaly,
  EventLogEntry,
  FailureEvent,
  CascadeRecord,
  CascadeStep,
  RecoveryPlan,
  DemandForecast,
  GridTimeSeries,
  GridSnapshot,
  ScenarioId,
  FailureType,
  TimeSeriesPoint,
  GeoTwinState,
  GeoLayerId,
  GeoViewport,
  CitySearchResult,
  MapEngineStatus,
  LocationResolutionStatus,
} from '@/types';

import { SeededRandom, tickToTimestamp } from '@/lib/utils';
import { generateGridTopology } from '@/simulation/models/gridGenerator';
import { buildCanonicalTopology } from '@/simulation/models/canonicalGridBuilder';
import { simulationTick } from '@/simulation/engine/simulationEngine';
import { detectAnomalies, reconcileAnomalies } from '@/simulation/anomaly/anomalyDetector';
import {
  injectFailure,
  propagateCascade,
  buildCascadeRecord,
  evaluateCascadeStep,
  initiateCascadeSequence,
} from '@/simulation/failures/cascadeEngine';
import {
  generateRecoveryPlan,
  executeRecoveryPlan,
  executeRecoveryAction,
  computeRecoveryMetrics,
} from '@/simulation/recovery/recoveryEngine';
import { getScenario } from '@/simulation/scenarios/scenarios';
import { generateId } from '@/lib/utils';
import { CityResolver } from '@/simulation/geo/geoProvider';
import { DeterministicGeoDataProvider, DEMO_CITIES } from '@/simulation/geo/deterministicGeoTwin';
import { RealGeoDataProvider } from '@/simulation/geo/realGeoDataProvider';
import { GeoElectricalMapper } from '@/simulation/geo/geoElectricalMapper';
import { GeoSimulationCoordinator } from '@/simulation/geo/geoSimulationCoordinator';

// ─── Store Actions interface ────────────────────────────────────────

interface StoreActions {
  /** Initialize the simulation with a seed */
  initialize: (seed?: number) => void;
  /** Execute a single tick */
  tick: () => void;
  /** Start auto-ticking */
  start: () => void;
  /** Pause auto-ticking */
  pause: () => void;
  /** Reset simulation to initial state */
  reset: () => void;
  /** Set simulation speed */
  setSpeed: (speed: SimulationSpeed) => void;
  /** Advance by N ticks */
  advance: (ticks: number) => void;
  /** Activate a scenario */
  activateScenario: (scenarioId: ScenarioId) => void;
  /** Inject an on-the-fly fault directly into current grid */
  injectFault: (failureType: FailureType, targetIds?: string[]) => void;
  /** Take a snapshot (for before/after) */
  takeSnapshot: (type: 'before' | 'after') => void;
  /** Generate and propose a recovery plan for the latest failure */
  generateRecovery: () => void;
  /** Execute the most recent proposed recovery plan */
  executeRecovery: () => void;
  /** Execute an individual action from the active recovery plan */
  executeRecoveryAction: (actionId: string) => void;
  /** Advance by one cascade step (deterministic discrete propagation) */
  advanceCascadeStep: () => void;
  /** Run cascade automatically step-by-step */
  runCascadeAuto: () => void;
  /** Pause auto-running cascade */
  pauseCascade: () => void;
  /** Reset cascade and restore pre-cascade state */
  resetCascade: () => void;
  /** Select an individual step in the active cascade for inspection/visualization */
  selectCascadeStep: (stepIndex: number) => void;
  /** Initiate a cascade failure sequence directly (e.g. stress test or specific failure) */
  initiateCascade: (failureType?: FailureType, targetIds?: string[]) => void;

  // ─── Geo-Twin Actions (Task #14) ──────────────────────────────────
  /** Toggle between Abstract Schematic Grid and Geo-Twin Digital Twin View */
  setGeoViewActive: (active: boolean) => void;
  /** Search cities across registered geographic data providers */
  searchGeoCities: (query: string) => Promise<CitySearchResult[]>;
  /** Select and load a city's digital twin data package */
  selectGeoCity: (cityId: string) => Promise<void>;
  /** Select an individual geographic entity for inspection */
  selectGeoEntity: (entityId: string | null) => void;
  /** Update viewport / camera parameters */
  setGeoViewport: (viewport: Partial<GeoViewport>) => void;
  /** Toggle visibility of a specific geographic data layer */
  toggleGeoLayer: (layerId: GeoLayerId) => void;
  /** Enable or disable all geographic layers */
  setAllGeoLayers: (enabled: boolean) => void;
  /** Explicitly search, resolve location, and transition camera to city with race condition protection */
  searchAndNavigateCity: (query: string) => Promise<boolean>;
  /** Update map engine status (READY, FALLBACK, ERROR, etc.) */
  setMapEngineStatus: (status: MapEngineStatus, error?: string) => void;
  /** Task 16: Compute geographic ↔ electrical asset mapping, Voronoi service regions, and load clusters */
  computeSpatialAllocations: () => void;
  // ─── Task 17: Geo-Simulation Integration ──────────────────────────
  /** Trigger a fault on a geographic entity (resolves to electrical asset and trips it) */
  injectGeoFault: (geoEntityId: string, failureType?: FailureType) => void;
  /** Re-calculate geo-simulation impact projection */
  refreshGeoSimulationImpact: () => void;
}

type VajraStore = SimulationState & StoreActions;

// ─── Initial values ─────────────────────────────────────────────────

const EMPTY_TOPOLOGY: GridTopology = {
  generators: [],
  substations: [],
  transmissionLines: [],
  batteries: [],
  loads: [],
};

const EMPTY_POWER_BALANCE: PowerBalance = {
  totalGenerationMW: 0,
  totalDemandMW: 0,
  totalBatteryFlowMW: 0,
  totalLossesMW: 0,
  netBalanceMW: 0,
  solarGenerationMW: 0,
  windGenerationMW: 0,
  thermalGenerationMW: 0,
  renewableFraction: 0,
};

const EMPTY_METRICS: SystemMetrics = {
  totalCapacityMW: 0,
  totalGenerationMW: 0,
  totalDemandMW: 0,
  loadServedPercent: 100,
  unservedLoadMW: 0,
  renewablePercent: 0,
  avgBatterySOCPercent: 0,
  avgLineLoadingPercent: 0,
  maxLineLoadingPercent: 0,
  failedAssetCount: 0,
  affectedConsumers: 0,
  criticalLoadsServedPercent: 100,
  systemFrequencyHz: 50.0,
  voltageHealthIndex: 1.0,
  frequencyDeviationHz: 0,
  totalLossesMW: 0,
};

const EMPTY_TIME_SERIES: GridTimeSeries = {
  generation: [],
  demand: [],
  frequency: [],
  voltage: [],
  batterySOC: [],
  lineLoading: [],
  renewablePercent: [],
  unservedLoad: [],
};

const INITIAL_CLOCK: SimulationClock = {
  isRunning: false,
  speed: 1,
  tick: 0,
  ticksPerMinute: 60,
  startedAt: 0,
};

// ─── Time series recording (Phase 3: Deterministic Telemetry) ───────

const TIME_SERIES_MAX_POINTS = 600; // 10 minutes at 1-second ticks
const TIME_SERIES_SAMPLE_INTERVAL = 5; // Record every 5 ticks

function appendTimeSeries(
  series: TimeSeriesPoint[],
  tick: number,
  value: number,
  unit?: string,
): TimeSeriesPoint[] {
  const point: TimeSeriesPoint = {
    tick,
    timestamp: tickToTimestamp(tick),
    value,
    unit,
    source: 'VAJRA_DETERMINISTIC_SIMULATION_ENGINE',
    sourceType: 'SIMULATED',
    classification: 'PURPLE',
    confidence: 1.0,
  };
  const updated = [...series, point];
  if (updated.length > TIME_SERIES_MAX_POINTS) {
    return updated.slice(updated.length - TIME_SERIES_MAX_POINTS);
  }
  return updated;
}

/**
 * Record a full deterministic telemetry snapshot from simulation metrics.
 */
function recordSimulationTelemetry(
  timeSeries: GridTimeSeries,
  tick: number,
  metrics: SystemMetrics,
): GridTimeSeries {
  return {
    generation: appendTimeSeries(timeSeries.generation, tick, metrics.totalGenerationMW, 'MW'),
    demand: appendTimeSeries(timeSeries.demand, tick, metrics.totalDemandMW, 'MW'),
    frequency: appendTimeSeries(timeSeries.frequency, tick, metrics.systemFrequencyHz, 'Hz'),
    voltage: appendTimeSeries(timeSeries.voltage, tick, metrics.voltageHealthIndex, 'p.u.'),
    batterySOC: appendTimeSeries(timeSeries.batterySOC, tick, metrics.avgBatterySOCPercent, '%'),
    lineLoading: appendTimeSeries(timeSeries.lineLoading, tick, metrics.maxLineLoadingPercent, '%'),
    renewablePercent: appendTimeSeries(timeSeries.renewablePercent, tick, metrics.renewablePercent, '%'),
    unservedLoad: appendTimeSeries(timeSeries.unservedLoad, tick, metrics.unservedLoadMW, 'MW'),
  };
}

// ─── Geo-Twin Default State ─────────────────────────────────────────

export const DEFAULT_GEO_LAYERS: Record<GeoLayerId, boolean> = {
  BASE_MAP: true,
  BUILDINGS: true,
  ROADS: true,
  POWER_GENERATION: true,
  SUBSTATIONS: true,
  TRANSMISSION: true,
  DISTRIBUTION: false,
  TRANSFORMERS: false,
  LOAD_ZONES: true,
  CRITICAL_INFRASTRUCTURE: true,
  EV_INFRASTRUCTURE: true,
  GRID_HEALTH: true,
  FAILURES: true,
  CASCADE_PROPAGATION: true,
  SERVICE_REGIONS: true,
  LOAD_CLUSTERS: true,
};

export const DEFAULT_GEO_TWIN_STATE: GeoTwinState = {
  isGeoViewActive: false,
  selectedCity: DEMO_CITIES['city-delhi'] ?? null,
  selectedRegion: null,
  selectedEntityId: null,
  viewport: {
    center: { latitude: 28.6139, longitude: 77.209 },
    zoom: 11,
    pitchDegrees: 0,
    bearingDegrees: 0,
  },
  visibleLayers: { ...DEFAULT_GEO_LAYERS },
  searchQuery: '',
  searchResults: [],
  loadedEntitiesCount: 14,
  provenanceSummary: {
    verifiedCount: 0,
    modeledCount: 1,
    syntheticCount: 13,
  },
  mapEngineStatus: 'UNINITIALIZED',
  locationResolutionStatus: 'IDLE',
  errorMessage: null,
  requestGenerationToken: 0,
  attribution: '© OpenStreetMap contributors © CARTO',
  serviceRegions: [],
  loadClusters: [],
  electricalGeoMappings: [],
  criticalInfrastructure: [],
};

const defaultCityResolver = new CityResolver([
  new RealGeoDataProvider(),
  new DeterministicGeoDataProvider(),
]);

/**
 * Helper to compute live GeoSimulationImpact from current grid state and active GeoTwin.
 */
function computeGeoSimulationImpactFromState(
  topology: GridTopology,
  geoTwin: GeoTwinState | undefined,
  activeCascade: CascadeRecord | null | undefined,
  tick: number,
  criticalInfra?: import('@/types/geo').CriticalInfrastructure[],
): { simulationImpact?: import('@/types/geo').GeoSimulationImpact; activeGeoCascadeSteps?: import('@/types/geo').GeoCascadeSpatialStep[] } {
  if (!geoTwin || !geoTwin.serviceRegions || geoTwin.serviceRegions.length === 0) {
    return {
      simulationImpact: geoTwin?.simulationImpact,
      activeGeoCascadeSteps: geoTwin?.activeGeoCascadeSteps,
    };
  }

  const infraToUse = criticalInfra ?? geoTwin.criticalInfrastructure ?? [];
  const impact = GeoSimulationCoordinator.computeGeoSimulationImpact(
    topology,
    geoTwin,
    infraToUse,
    activeCascade,
    tick,
  );

  return {
    simulationImpact: impact,
    activeGeoCascadeSteps: impact.latestCascadeSteps,
  };
}

// ─── Interval management ────────────────────────────────────────────

let tickInterval: ReturnType<typeof setInterval> | null = null;

// ─── The simulation RNG, persisted across ticks ─────────────────────

let simRng: SeededRandom = new SeededRandom(42);

// ═══════════════════════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════════════════════

export const useVajraStore = create<VajraStore>((set, get) => ({
  // ── Initial State ─────────────────────────────────────────────────
  clock: { ...INITIAL_CLOCK },
  topology: EMPTY_TOPOLOGY,
  powerBalance: { ...EMPTY_POWER_BALANCE },
  metrics: { ...EMPTY_METRICS },
  anomalies: [],
  eventLog: [],
  failures: [],
  cascades: [],
  recoveryPlans: [],
  forecasts: [],
  timeSeries: { ...EMPTY_TIME_SERIES },
  activeScenario: null,
  snapshots: { before: null, after: null },
  activeCascade: null,
  activeCascadeStepIndex: 0,
  isCascadeRunning: false,
  geoTwin: { ...DEFAULT_GEO_TWIN_STATE },
  initialized: false,

  // ── Actions ───────────────────────────────────────────────────────

  initialize: (seed = 42) => {
    // Stop any running interval
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }

    // Create deterministic RNG
    simRng = new SeededRandom(seed);

    // Phase 1: Build canonical grid topology directly from verified PowerAssets
    const activeCityId = get().geoTwin?.selectedCity?.id ?? 'city-delhi';
    const topology = buildCanonicalTopology(activeCityId, { seed });

    // Run one tick to populate initial values
    const { powerBalance, metrics } = simulationTick(topology, 0, simRng);

    const initEvent: EventLogEntry = {
      id: generateId('evt'),
      type: 'SYSTEM_INIT',
      tick: 0,
      timestamp: tickToTimestamp(0),
      message: `Grid initialized: ${topology.generators.length} generators, ${topology.substations.length} substations, ${topology.transmissionLines.length} lines, ${topology.batteries.length} batteries, ${topology.loads.length} loads`,
      severity: 'INFO',
      relatedAssetIds: [],
      data: {
        seed,
        totalCapacityMW: metrics.totalCapacityMW,
        totalDemandMW: metrics.totalDemandMW,
      },
    };

    // Record tick 0 telemetry point directly from authoritative simulation engine
    const initialTimeSeries = recordSimulationTelemetry({ ...EMPTY_TIME_SERIES }, 0, metrics);

    set({
      clock: { ...INITIAL_CLOCK, startedAt: Date.now() },
      topology,
      powerBalance,
      metrics,
      anomalies: [],
      eventLog: [initEvent],
      failures: [],
      cascades: [],
      recoveryPlans: [],
      forecasts: [],
      timeSeries: initialTimeSeries,
      activeScenario: 'NORMAL_OPERATION',
      snapshots: { before: null, after: null },
      activeCascade: null,
      activeCascadeStepIndex: 0,
      isCascadeRunning: false,
      geoTwin: { ...DEFAULT_GEO_TWIN_STATE },
      initialized: true,
    });
  },

  tick: () => {
    const state = get();
    if (!state.initialized) return;

    // If cascade is auto-running and active cascade is in PROPAGATING state, advance cascade step
    if (state.isCascadeRunning && state.activeCascade && state.activeCascade.status === 'PROPAGATING') {
      get().advanceCascadeStep();
      return;
    }

    const nextTick = state.clock.tick + 1;

    // Run simulation engine
    const { powerBalance, metrics } = simulationTick(state.topology, nextTick, simRng);

    // Detect anomalies
    const detected = detectAnomalies({
      topology: state.topology,
      metrics,
      powerBalance,
      tick: nextTick,
    });
    const anomalies = reconcileAnomalies(state.anomalies, detected, nextTick);

    // Check for cascading failures
    const { steps: cascadeSteps, events: cascadeEvents } = propagateCascade(state.topology, nextTick);
    const newEvents = [...cascadeEvents];

    let cascades = [...state.cascades];
    if (cascadeSteps.length > 0) {
      const cascadeRecord = buildCascadeRecord(cascadeSteps, state.topology, nextTick);
      if (cascadeRecord) {
        cascades = [...cascades, cascadeRecord];
        newEvents.push({
          id: generateId('evt'),
          type: 'CASCADE_STARTED',
          tick: nextTick,
          timestamp: tickToTimestamp(nextTick),
          message: `Cascading failure: ${cascadeSteps.length} steps, ${cascadeRecord.affectedConsumers} consumers affected`,
          severity: 'CRITICAL',
          relatedAssetIds: cascadeRecord.affectedAssetIds,
          data: {
            steps: cascadeSteps.length,
            unservedMW: cascadeRecord.totalUnservedLoadMW,
          },
        });
      }
    }

    // Record deterministic time series (every N ticks)
    let timeSeries = state.timeSeries;
    if (nextTick % TIME_SERIES_SAMPLE_INTERVAL === 0) {
      timeSeries = recordSimulationTelemetry(timeSeries, nextTick, metrics);
    }

    // Trim event log to last 500 entries
    const eventLog = [...state.eventLog, ...newEvents].slice(-500);

    const geoImpact = computeGeoSimulationImpactFromState(
      state.topology,
      state.geoTwin,
      state.activeCascade,
      nextTick,
    );

    set({
      clock: { ...state.clock, tick: nextTick },
      powerBalance,
      metrics,
      anomalies,
      eventLog,
      cascades,
      timeSeries,
      geoTwin: state.geoTwin
        ? {
            ...state.geoTwin,
            simulationImpact: geoImpact.simulationImpact,
            activeGeoCascadeSteps: geoImpact.activeGeoCascadeSteps,
          }
        : state.geoTwin,
    });
  },

  start: () => {
    const state = get();
    if (!state.initialized || state.clock.isRunning) return;

    set({ clock: { ...state.clock, isRunning: true } });

    // Calculate interval based on speed
    const intervalMs = Math.round(1000 / state.clock.speed);

    tickInterval = setInterval(() => {
      get().tick();
    }, intervalMs);
  },

  pause: () => {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
    const state = get();
    set({ clock: { ...state.clock, isRunning: false } });
  },

  reset: () => {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
    get().initialize();
  },

  setSpeed: (speed: SimulationSpeed) => {
    const state = get();
    const wasRunning = state.clock.isRunning;

    if (wasRunning) {
      get().pause();
    }

    set({ clock: { ...state.clock, speed } });

    if (wasRunning) {
      get().start();
    }
  },

  advance: (ticks: number) => {
    const state = get();
    if (!state.initialized) return;

    // Fast-forward without rendering each frame
    for (let i = 0; i < ticks; i++) {
      get().tick();
    }
  },

  activateScenario: (scenarioId: ScenarioId) => {
    const state = get();
    if (!state.initialized) return;

    const scenario = getScenario(scenarioId);
    if (!scenario) return;

    // Reset grid to clean deterministic initial state for the scenario
    // This ensures that each scenario is reproducible from the exact same initial state.
    const seed = 42;
    simRng = new SeededRandom(seed);
    const activeCityId = state.geoTwin?.selectedCity?.id ?? 'city-delhi';
    const topology = buildCanonicalTopology(activeCityId, { seed });
    const initialSim = simulationTick(topology, 0, simRng);

    if (scenarioId === 'NORMAL_OPERATION') {
      const normalEvent: EventLogEntry = {
        id: generateId('evt'),
        type: 'SCENARIO_STARTED',
        tick: 0,
        timestamp: tickToTimestamp(0),
        message: `Scenario activated: ${scenario.name} — ${scenario.description}`,
        severity: 'INFO',
        relatedAssetIds: [],
        data: { scenarioId },
      };

      const scenarioTimeSeries = recordSimulationTelemetry({ ...EMPTY_TIME_SERIES }, 0, initialSim.metrics);

      set({
        clock: { ...INITIAL_CLOCK, startedAt: Date.now() },
        topology,
        powerBalance: initialSim.powerBalance,
        metrics: initialSim.metrics,
        anomalies: [],
        eventLog: [...state.eventLog, normalEvent].slice(-500),
        failures: [],
        cascades: [],
        recoveryPlans: [],
        forecasts: [],
        timeSeries: scenarioTimeSeries,
        activeScenario: 'NORMAL_OPERATION',
        snapshots: { before: null, after: null },
      });
      return;
    }

    // Take "before" snapshot on the clean baseline
    const beforeSnapshot: GridSnapshot = {
      tick: 0,
      timestamp: tickToTimestamp(0),
      metrics: { ...initialSim.metrics },
      powerBalance: { ...initialSim.powerBalance },
      failedAssetIds: [],
      disconnectedLoadIds: [],
      overloadedLineIds: [],
      activeCascadeCount: 0,
    };

    const events: EventLogEntry[] = [{
      id: generateId('evt'),
      type: 'SCENARIO_STARTED',
      tick: 0,
      timestamp: tickToTimestamp(0),
      message: `Scenario activated: ${scenario.name} — ${scenario.description}`,
      severity: 'WARNING',
      relatedAssetIds: [],
      data: { scenarioId },
    }];

    const failures: FailureEvent[] = [];

    for (const failureType of scenario.failures) {
      let targetIds: string[] = scenario.targetAssetIds ?? [];

      if (targetIds.length === 0) {
        switch (failureType) {
          case 'SUBSTATION_FAILURE': {
            const transSubs = topology.substations.filter((s) => s.type === 'transmission' && s.status !== 'FAILED');
            if (transSubs.length > 0) targetIds = [transSubs[0].id];
            break;
          }
          case 'LINE_FAILURE': {
            const onlineLines = topology.transmissionLines
              .filter((l) => l.status !== 'FAILED')
              .sort((a, b) => b.loadingPercent - a.loadingPercent);
            if (onlineLines.length > 0) targetIds = [onlineLines[0].id];
            break;
          }
          case 'GENERATOR_OUTAGE': {
            const onlineGens = topology.generators.filter((g) => g.status !== 'FAILED');
            if (onlineGens.length > 0) targetIds = [onlineGens[0].id];
            break;
          }
          case 'BATTERY_FAILURE': {
            targetIds = topology.batteries
              .filter((b) => b.status !== 'FAILED')
              .map((b) => b.id);
            break;
          }
          default:
            targetIds = [];
        }
      }

      const { failure, events: failEvents } = injectFailure(
        topology,
        failureType,
        targetIds,
        0,
      );
      failures.push(failure);
      events.push(...failEvents);
    }

    // Immediately re-evaluate simulation tick to update power balance and metrics
    const { powerBalance, metrics } = simulationTick(topology, 0, simRng);
    const anomalies = detectAnomalies({
      topology,
      metrics,
      powerBalance,
      tick: 0,
    });

    let activeCascade: CascadeRecord | null = null;
    if (failures.length > 0) {
      const primaryFail = failures[0];
      const maxOverload = metrics.maxLineLoadingPercent;
      const initialStep: CascadeStep = {
        tick: 0,
        triggerAssetId: primaryFail.affectedAssetIds[0] ?? 'grid',
        triggerReason: `Scenario trigger: ${scenario.name}`,
        affectedAssetId: primaryFail.affectedAssetIds[0] ?? 'grid',
        affectedAssetType: 'substation',
        loadRedistributedMW: 0,
        resultingLoadingPercent: maxOverload,
        stepIndex: 0,
        timestamp: tickToTimestamp(0),
        action: 'INITIAL_FAILURE',
        triggerAssetName: scenario.name,
        affectedAssetName: scenario.name,
        loadingBefore: 100,
        loadingAfter: maxOverload,
        unservedLoadMW: metrics.unservedLoadMW,
        affectedConsumers: metrics.affectedConsumers,
        depth: 0,
        status: maxOverload >= 100 ? 'PROPAGATING' : 'STABILIZED',
      };
      activeCascade = {
        id: generateId('cascade'),
        startTick: 0,
        steps: [initialStep],
        totalUnservedLoadMW: metrics.unservedLoadMW,
        affectedConsumers: metrics.affectedConsumers,
        affectedAssetIds: failures.flatMap((f) => f.affectedAssetIds),
        resolved: false,
        depth: 0,
        maxOverloadPercent: maxOverload,
        criticalLoadsAffected: topology.loads.filter(
          (l) => !l.connected && (l.priority === 'critical' || l.priority === 'high'),
        ).length,
        stabilityIndex: Math.max(0, Math.min(1, 1.0 - metrics.unservedLoadMW / Math.max(1, metrics.unservedLoadMW + 1000))),
        status: maxOverload >= 100 ? 'PROPAGATING' : 'STABILIZED',
        initialFailureType: primaryFail.type,
      };
    }

    const scenarioTimeSeries = recordSimulationTelemetry({ ...EMPTY_TIME_SERIES }, 0, metrics);

    set({
      clock: { ...INITIAL_CLOCK, startedAt: Date.now() },
      topology,
      powerBalance,
      metrics,
      anomalies,
      failures,
      cascades: activeCascade ? [activeCascade] : [],
      recoveryPlans: [],
      forecasts: [],
      timeSeries: scenarioTimeSeries,
      activeScenario: scenarioId,
      snapshots: { before: beforeSnapshot, after: null },
      activeCascade,
      activeCascadeStepIndex: 0,
      isCascadeRunning: false,
      eventLog: [...state.eventLog, ...events].slice(-500),
    });
  },

  injectFault: (failureType: FailureType, targetIds?: string[]) => {
    const state = get();
    if (!state.initialized) return;

    let targets = targetIds ?? [];
    if (targets.length === 0) {
      switch (failureType) {
        case 'SUBSTATION_FAILURE': {
          const transSubs = state.topology.substations.filter((s) => s.type === 'transmission' && s.status !== 'FAILED');
          if (transSubs.length > 0) targets = [transSubs[0].id];
          break;
        }
        case 'LINE_FAILURE': {
          const onlineLines = state.topology.transmissionLines
            .filter((l) => l.status !== 'FAILED')
            .sort((a, b) => b.loadingPercent - a.loadingPercent);
          if (onlineLines.length > 0) targets = [onlineLines[0].id];
          break;
        }
        case 'GENERATOR_OUTAGE': {
          const onlineGens = state.topology.generators.filter((g) => g.status !== 'FAILED');
          if (onlineGens.length > 0) targets = [onlineGens[0].id];
          break;
        }
        case 'BATTERY_FAILURE': {
          targets = state.topology.batteries
            .filter((b) => b.status !== 'FAILED')
            .map((b) => b.id);
          break;
        }
        default:
          targets = [];
      }
    }

    // Take "before" snapshot if not taken yet
    if (!state.snapshots.before) {
      get().takeSnapshot('before');
    }

    const { failure, events } = injectFailure(
      state.topology,
      failureType,
      targets,
      state.clock.tick,
    );

    // Immediately re-evaluate simulation tick
    const { powerBalance, metrics } = simulationTick(state.topology, state.clock.tick, simRng);
    const detected = detectAnomalies({
      topology: state.topology,
      metrics,
      powerBalance,
      tick: state.clock.tick,
    });
    const anomalies = reconcileAnomalies(state.anomalies, detected, state.clock.tick);

    const maxOverload = metrics.maxLineLoadingPercent;
    const initialStep: CascadeStep = {
      tick: state.clock.tick,
      triggerAssetId: targets[0] ?? failure.affectedAssetIds[0] ?? 'grid',
      triggerReason: `Fault injection: ${failureType}`,
      affectedAssetId: targets[0] ?? failure.affectedAssetIds[0] ?? 'grid',
      affectedAssetType: 'substation',
      loadRedistributedMW: 0,
      resultingLoadingPercent: maxOverload,
      stepIndex: 0,
      timestamp: tickToTimestamp(state.clock.tick),
      action: 'INITIAL_FAILURE',
      triggerAssetName: failureType,
      affectedAssetName: targets[0] ?? failureType,
      loadingBefore: 100,
      loadingAfter: maxOverload,
      unservedLoadMW: metrics.unservedLoadMW,
      affectedConsumers: metrics.affectedConsumers,
      depth: 0,
      status: maxOverload >= 100 ? 'PROPAGATING' : 'STABILIZED',
    };
    const activeCascade: CascadeRecord = {
      id: generateId('cascade'),
      startTick: state.clock.tick,
      steps: [initialStep],
      totalUnservedLoadMW: metrics.unservedLoadMW,
      affectedConsumers: metrics.affectedConsumers,
      affectedAssetIds: failure.affectedAssetIds,
      resolved: false,
      depth: 0,
      maxOverloadPercent: maxOverload,
      criticalLoadsAffected: state.topology.loads.filter(
        (l) => !l.connected && (l.priority === 'critical' || l.priority === 'high'),
      ).length,
      stabilityIndex: Math.max(0, Math.min(1, 1.0 - metrics.unservedLoadMW / Math.max(1, metrics.unservedLoadMW + 1000))),
      status: maxOverload >= 100 ? 'PROPAGATING' : 'STABILIZED',
      initialFailureType: failureType,
    };

    const geoImpact = computeGeoSimulationImpactFromState(
      state.topology,
      state.geoTwin,
      activeCascade,
      state.clock.tick,
    );

    set({
      powerBalance,
      metrics,
      anomalies,
      failures: [...state.failures, failure],
      activeCascade,
      activeCascadeStepIndex: 0,
      isCascadeRunning: false,
      cascades: [...state.cascades, activeCascade],
      eventLog: [...state.eventLog, ...events].slice(-500),
      geoTwin: state.geoTwin
        ? {
            ...state.geoTwin,
            simulationImpact: geoImpact.simulationImpact,
            activeGeoCascadeSteps: geoImpact.activeGeoCascadeSteps,
          }
        : state.geoTwin,
    });
  },

  takeSnapshot: (type: 'before' | 'after') => {
    const state = get();
    const snapshot: GridSnapshot = {
      tick: state.clock.tick,
      timestamp: tickToTimestamp(state.clock.tick),
      metrics: { ...state.metrics },
      powerBalance: { ...state.powerBalance },
      failedAssetIds: [
        ...state.topology.generators.filter((g) => g.status === 'FAILED').map((g) => g.id),
        ...state.topology.substations.filter((s) => s.status === 'FAILED').map((s) => s.id),
        ...state.topology.transmissionLines.filter((l) => l.status === 'FAILED').map((l) => l.id),
        ...state.topology.batteries.filter((b) => b.status === 'FAILED').map((b) => b.id),
      ],
      disconnectedLoadIds: state.topology.loads.filter((l) => !l.connected).map((l) => l.id),
      overloadedLineIds: state.topology.transmissionLines
        .filter((l) => l.status === 'OVERLOADED')
        .map((l) => l.id),
      activeCascadeCount: state.cascades.filter((c) => !c.resolved).length,
    };

    set({
      snapshots: {
        ...state.snapshots,
        [type]: snapshot,
      },
    });
  },

  generateRecovery: () => {
    const state = get();
    if (!state.initialized) return;

    // Find the most recent unresolved failure, or create one if grid has failed assets
    let latestFailure = [...state.failures].reverse().find((f) => !f.resolved);
    if (!latestFailure) {
      const hasFailedAssets =
        state.topology.generators.some((g) => g.status === 'FAILED') ||
        state.topology.substations.some((s) => s.status === 'FAILED') ||
        state.topology.transmissionLines.some((l) => l.status === 'FAILED') ||
        state.topology.batteries.some((b) => b.status === 'FAILED') ||
        state.metrics.unservedLoadMW > 0;

      if (hasFailedAssets) {
        latestFailure = {
          id: generateId('fail'),
          type: 'MULTI_FAULT',
          affectedAssetIds: [
            ...state.topology.substations.filter((s) => s.status === 'FAILED').map((s) => s.id),
            ...state.topology.transmissionLines.filter((l) => l.status === 'FAILED').map((l) => l.id),
          ],
          tick: state.clock.tick,
          resolved: false,
          description: 'Grid anomaly / asset failure detected',
        };
      }
    }

    if (!latestFailure) return;

    const plan = generateRecoveryPlan(
      state.topology,
      state.powerBalance,
      latestFailure,
      state.clock.tick,
    );

    set({
      recoveryPlans: [...state.recoveryPlans, plan],
      eventLog: [...state.eventLog, {
        id: generateId('evt'),
        type: 'RECOVERY_STARTED' as const,
        tick: state.clock.tick,
        timestamp: tickToTimestamp(state.clock.tick),
        message: `Recovery plan generated: ${plan.actions.length} actions proposed`,
        severity: 'INFO' as const,
        relatedAssetIds: [],
        data: { planId: plan.id },
      } satisfies EventLogEntry].slice(-500),
    });
  },

  executeRecovery: () => {
    const state = get();
    if (!state.initialized) return;

    // Find the most recent proposed or executing plan
    const plan = [...state.recoveryPlans].reverse().find((p) => p.status === 'PROPOSED' || p.status === 'PARTIAL');
    if (!plan) return;

    const events = executeRecoveryPlan(plan, state.topology, state.powerBalance, state.clock.tick);

    // Recompute simulation tick so power balance and metrics immediately reflect recovery
    const { powerBalance, metrics } = simulationTick(state.topology, state.clock.tick, simRng);
    plan.postRecoveryMetrics = computeRecoveryMetrics(state.topology, powerBalance);

    // Mark any unresolved failures as resolved
    const failures = state.failures.map((f) => {
      if (!f.resolved) {
        return { ...f, resolved: true, resolvedAtTick: state.clock.tick };
      }
      return f;
    });

    // Reconcile anomalies
    const detected = detectAnomalies({
      topology: state.topology,
      metrics,
      powerBalance,
      tick: state.clock.tick,
    });
    const anomalies = reconcileAnomalies(state.anomalies, detected, state.clock.tick);

    // Take "after" snapshot
    const afterSnapshot: GridSnapshot = {
      tick: state.clock.tick,
      timestamp: tickToTimestamp(state.clock.tick),
      metrics: { ...metrics },
      powerBalance: { ...powerBalance },
      failedAssetIds: [
        ...state.topology.generators.filter((g) => g.status === 'FAILED').map((g) => g.id),
        ...state.topology.substations.filter((s) => s.status === 'FAILED').map((s) => s.id),
        ...state.topology.transmissionLines.filter((l) => l.status === 'FAILED').map((l) => l.id),
        ...state.topology.batteries.filter((b) => b.status === 'FAILED').map((b) => b.id),
      ],
      disconnectedLoadIds: state.topology.loads.filter((l) => !l.connected).map((l) => l.id),
      overloadedLineIds: state.topology.transmissionLines
        .filter((l) => l.status === 'OVERLOADED')
        .map((l) => l.id),
      activeCascadeCount: state.cascades.filter((c) => !c.resolved).length,
    };

    const geoImpact = computeGeoSimulationImpactFromState(
      state.topology,
      state.geoTwin,
      state.activeCascade,
      state.clock.tick,
    );

    set({
      powerBalance,
      metrics,
      anomalies,
      failures,
      snapshots: { ...state.snapshots, after: afterSnapshot },
      recoveryPlans: state.recoveryPlans.map((p) => (p.id === plan.id ? plan : p)),
      eventLog: [...state.eventLog, ...events].slice(-500),
      geoTwin: state.geoTwin
        ? {
            ...state.geoTwin,
            simulationImpact: geoImpact.simulationImpact,
            activeGeoCascadeSteps: geoImpact.activeGeoCascadeSteps,
          }
        : state.geoTwin,
    });
  },

  executeRecoveryAction: (actionId: string) => {
    const state = get();
    if (!state.initialized) return;

    const plan = [...state.recoveryPlans].reverse().find((p) => p.status === 'PROPOSED' || p.status === 'PARTIAL');
    if (!plan) return;

    const action = plan.actions.find((a) => a.id === actionId);
    if (!action || action.executed) return;

    const events = executeRecoveryAction(action, state.topology, state.clock.tick);

    const { powerBalance, metrics } = simulationTick(state.topology, state.clock.tick, simRng);
    plan.postRecoveryMetrics = computeRecoveryMetrics(state.topology, powerBalance);
    plan.status = plan.actions.every((a) => a.executed) ? 'COMPLETED' : 'PARTIAL';

    const detected = detectAnomalies({
      topology: state.topology,
      metrics,
      powerBalance,
      tick: state.clock.tick,
    });
    const anomalies = reconcileAnomalies(state.anomalies, detected, state.clock.tick);

    const geoImpact = computeGeoSimulationImpactFromState(
      state.topology,
      state.geoTwin,
      state.activeCascade,
      state.clock.tick,
    );

    set({
      powerBalance,
      metrics,
      anomalies,
      recoveryPlans: state.recoveryPlans.map((p) => (p.id === plan.id ? plan : p)),
      eventLog: [...state.eventLog, ...events].slice(-500),
      geoTwin: state.geoTwin
        ? {
            ...state.geoTwin,
            simulationImpact: geoImpact.simulationImpact,
            activeGeoCascadeSteps: geoImpact.activeGeoCascadeSteps,
          }
        : state.geoTwin,
    });
  },

  advanceCascadeStep: () => {
    const state = get();
    if (!state.initialized) return;

    let cascade = state.activeCascade;
    if (!cascade) {
      const hasFailed =
        state.topology.substations.some((s) => s.status === 'FAILED') ||
        state.topology.transmissionLines.some((l) => l.status === 'FAILED') ||
        state.topology.generators.some((g) => g.status === 'FAILED');
      const maxOverload = Math.max(
        0,
        ...state.topology.transmissionLines.map((l) => (l.status !== 'FAILED' ? l.loadingPercent : 0)),
      );

      if (hasFailed || maxOverload >= 100) {
        const rootStep: CascadeStep = {
          tick: state.clock.tick,
          triggerAssetId: 'grid',
          triggerReason: 'Baseline grid stress / unmitigated failure',
          affectedAssetId: 'grid',
          affectedAssetType: 'line',
          loadRedistributedMW: 0,
          resultingLoadingPercent: maxOverload,
          stepIndex: 0,
          timestamp: tickToTimestamp(state.clock.tick),
          action: 'LINE_OVERLOAD',
          triggerAssetName: 'Grid Flow',
          affectedAssetName: 'Transmission Network',
          loadingBefore: 100,
          loadingAfter: maxOverload,
          unservedLoadMW: state.metrics.unservedLoadMW,
          affectedConsumers: state.metrics.affectedConsumers,
          depth: 0,
          status: 'PROPAGATING',
        };

        cascade = {
          id: generateId('cascade'),
          startTick: state.clock.tick,
          steps: [rootStep],
          totalUnservedLoadMW: state.metrics.unservedLoadMW,
          affectedConsumers: state.metrics.affectedConsumers,
          affectedAssetIds: [],
          resolved: false,
          depth: 0,
          maxOverloadPercent: maxOverload,
          criticalLoadsAffected: state.topology.loads.filter(
            (l) => !l.connected && (l.priority === 'critical' || l.priority === 'high'),
          ).length,
          stabilityIndex: 0.8,
          status: 'PROPAGATING',
        };
      } else {
        // Grid is in normal operation — initiate a substation failure to begin cascade
        get().initiateCascade('SUBSTATION_FAILURE');
        return;
      }
    }

    if (cascade.status === 'STABILIZED' || cascade.status === 'COLLAPSED') {
      if (state.isCascadeRunning) {
        set({ isCascadeRunning: false });
      }
      return;
    }

    const nextTick = state.clock.tick + 1;
    const currentStepIndex = cascade.steps.length;

    const evaluation = evaluateCascadeStep(state.topology, nextTick, currentStepIndex);

    // Recompute simulation tick so all power balances and metrics update
    const { powerBalance, metrics } = simulationTick(state.topology, nextTick, simRng);
    const detected = detectAnomalies({
      topology: state.topology,
      metrics,
      powerBalance,
      tick: nextTick,
    });
    const anomalies = reconcileAnomalies(state.anomalies, detected, nextTick);

    if (evaluation.step) {
      const updatedSteps = [...cascade.steps, evaluation.step];
      const affectedIds = Array.from(
        new Set([...cascade.affectedAssetIds, evaluation.step.triggerAssetId, evaluation.step.affectedAssetId]),
      );
      const updatedCascade: CascadeRecord = {
        ...cascade,
        steps: updatedSteps,
        depth: updatedSteps.length - 1,
        totalUnservedLoadMW: metrics.unservedLoadMW,
        affectedConsumers: metrics.affectedConsumers,
        affectedAssetIds: affectedIds,
        maxOverloadPercent: metrics.maxLineLoadingPercent,
        criticalLoadsAffected: state.topology.loads.filter(
          (l) => !l.connected && (l.priority === 'critical' || l.priority === 'high'),
        ).length,
        stabilityIndex: Math.max(
          0,
          Math.min(1, 1.0 - metrics.unservedLoadMW / Math.max(1, metrics.unservedLoadMW + 1000)),
        ),
        status: evaluation.status,
      };

      const geoImpact = computeGeoSimulationImpactFromState(
        state.topology,
        state.geoTwin,
        updatedCascade,
        nextTick,
      );

      set({
        clock: { ...state.clock, tick: nextTick },
        powerBalance,
        metrics,
        anomalies,
        activeCascade: updatedCascade,
        activeCascadeStepIndex: updatedSteps.length - 1,
        cascades: [...state.cascades.filter((c) => c.id !== cascade.id), updatedCascade],
        eventLog: [...state.eventLog, ...evaluation.events].slice(-500),
        isCascadeRunning: evaluation.hasMore ? state.isCascadeRunning : false,
        geoTwin: state.geoTwin
          ? {
              ...state.geoTwin,
              simulationImpact: geoImpact.simulationImpact,
              activeGeoCascadeSteps: geoImpact.activeGeoCascadeSteps,
            }
          : state.geoTwin,
      });
    } else {
      // Cascade has reached stabilization
      const stabilizedStep: CascadeStep = {
        tick: nextTick,
        triggerAssetId: 'grid',
        triggerReason: 'Thermal equilibrium reached — all lines within capacity',
        affectedAssetId: 'grid',
        affectedAssetType: 'line',
        loadRedistributedMW: 0,
        resultingLoadingPercent: metrics.maxLineLoadingPercent,
        stepIndex: currentStepIndex,
        timestamp: tickToTimestamp(nextTick),
        action: 'CASCADE_STABILIZED',
        triggerAssetName: 'Grid Equilibrium',
        affectedAssetName: 'Stabilized Network',
        loadingBefore: cascade.maxOverloadPercent ?? 0,
        loadingAfter: metrics.maxLineLoadingPercent,
        unservedLoadMW: metrics.unservedLoadMW,
        affectedConsumers: metrics.affectedConsumers,
        depth: currentStepIndex,
        status: 'STABILIZED',
      };

      const updatedCascade: CascadeRecord = {
        ...cascade,
        steps: [...cascade.steps, stabilizedStep],
        status: 'STABILIZED',
      };

      const geoImpact = computeGeoSimulationImpactFromState(
        state.topology,
        state.geoTwin,
        updatedCascade,
        nextTick,
      );

      set({
        clock: { ...state.clock, tick: nextTick },
        powerBalance,
        metrics,
        anomalies,
        activeCascade: updatedCascade,
        activeCascadeStepIndex: updatedCascade.steps.length - 1,
        cascades: [...state.cascades.filter((c) => c.id !== cascade.id), updatedCascade],
        eventLog: [...state.eventLog, ...evaluation.events].slice(-500),
        isCascadeRunning: false,
        geoTwin: state.geoTwin
          ? {
              ...state.geoTwin,
              simulationImpact: geoImpact.simulationImpact,
              activeGeoCascadeSteps: geoImpact.activeGeoCascadeSteps,
            }
          : state.geoTwin,
      });
    }
  },

  runCascadeAuto: () => {
    const state = get();
    if (!state.initialized) return;

    if (!state.activeCascade || state.activeCascade.status === 'STABILIZED') {
      get().initiateCascade();
    }

    set({ isCascadeRunning: true });
    if (!state.clock.isRunning) {
      get().start();
    }
  },

  pauseCascade: () => {
    set({ isCascadeRunning: false });
  },

  resetCascade: () => {
    const state = get();
    if (state.snapshots.before) {
      const seed = 42;
      simRng = new SeededRandom(seed);
      const activeCityId = state.geoTwin?.selectedCity?.id ?? 'city-delhi';
      const topology = buildCanonicalTopology(activeCityId, { seed });
      const { powerBalance, metrics } = simulationTick(topology, 0, simRng);
      const geoImpact = computeGeoSimulationImpactFromState(
        topology,
        state.geoTwin,
        null,
        0,
      );
      set({
        topology,
        powerBalance,
        metrics,
        anomalies: [],
        activeCascade: null,
        activeCascadeStepIndex: 0,
        isCascadeRunning: false,
        failures: [],
        recoveryPlans: [],
        geoTwin: state.geoTwin
          ? {
              ...state.geoTwin,
              simulationImpact: geoImpact.simulationImpact,
              activeGeoCascadeSteps: geoImpact.activeGeoCascadeSteps,
            }
          : state.geoTwin,
      });
    } else {
      set({
        activeCascade: null,
        activeCascadeStepIndex: 0,
        isCascadeRunning: false,
      });
    }
  },

  selectCascadeStep: (stepIndex: number) => {
    set({ activeCascadeStepIndex: stepIndex });
  },

  initiateCascade: (failureType: FailureType = 'SUBSTATION_FAILURE', targetIds?: string[]) => {
    const state = get();
    if (!state.initialized) return;

    let targets = targetIds ?? [];
    if (targets.length === 0) {
      switch (failureType) {
        case 'SUBSTATION_FAILURE': {
          const transSubs = state.topology.substations.filter((s) => s.type === 'transmission' && s.status !== 'FAILED');
          if (transSubs.length > 0) targets = [transSubs[0].id];
          break;
        }
        case 'LINE_FAILURE': {
          const onlineLines = state.topology.transmissionLines
            .filter((l) => l.status !== 'FAILED')
            .sort((a, b) => b.loadingPercent - a.loadingPercent);
          if (onlineLines.length > 0) targets = [onlineLines[0].id];
          break;
        }
        case 'GENERATOR_OUTAGE': {
          const onlineGens = state.topology.generators.filter((g) => g.status !== 'FAILED');
          if (onlineGens.length > 0) targets = [onlineGens[0].id];
          break;
        }
        case 'BATTERY_FAILURE': {
          targets = state.topology.batteries.filter((b) => b.status !== 'FAILED').map((b) => b.id);
          break;
        }
        default:
          targets = [];
      }
    }

    if (!state.snapshots.before) {
      get().takeSnapshot('before');
    }

    const { cascade, events } = initiateCascadeSequence(
      state.topology,
      state.clock.tick,
      failureType,
      targets,
    );

    const { powerBalance, metrics } = simulationTick(state.topology, state.clock.tick, simRng);
    const detected = detectAnomalies({
      topology: state.topology,
      metrics,
      powerBalance,
      tick: state.clock.tick,
    });
    const anomalies = reconcileAnomalies(state.anomalies, detected, state.clock.tick);

    const geoImpact = computeGeoSimulationImpactFromState(
      state.topology,
      state.geoTwin,
      cascade,
      state.clock.tick,
    );

    set({
      powerBalance,
      metrics,
      anomalies,
      activeCascade: cascade,
      activeCascadeStepIndex: 0,
      isCascadeRunning: false,
      cascades: [...state.cascades, cascade],
      eventLog: [...state.eventLog, ...events].slice(-500),
      geoTwin: state.geoTwin
        ? {
            ...state.geoTwin,
            simulationImpact: geoImpact.simulationImpact,
            activeGeoCascadeSteps: geoImpact.activeGeoCascadeSteps,
          }
        : state.geoTwin,
    });
  },

  // ─── Geo-Twin Actions ─────────────────────────────────────────────

  setGeoViewActive: (active: boolean) => {
    const current = get().geoTwin ?? DEFAULT_GEO_TWIN_STATE;
    set({
      geoTwin: {
        ...current,
        isGeoViewActive: active,
      },
    });
  },

  searchGeoCities: async (query: string) => {
    const current = get().geoTwin ?? DEFAULT_GEO_TWIN_STATE;
    const results = await defaultCityResolver.search(query);
    set({
      geoTwin: {
        ...current,
        searchQuery: query,
        searchResults: results,
      },
    });
    return results;
  },

  selectGeoCity: async (cityId: string) => {
    const current = get().geoTwin ?? DEFAULT_GEO_TWIN_STATE;
    const twinPkg = await defaultCityResolver.loadTwin(cityId);
    if (!twinPkg) return;

    // Phase 1: Switch simulation engine to consume canonical PowerAsset topology for this city
    const topology = buildCanonicalTopology(cityId, { seed: 42 });
    const { powerBalance, metrics } = simulationTick(topology, get().clock.tick, simRng);

    // Bridge electrical topology to geographic entities
    const mapper = new GeoElectricalMapper(
      topology,
      twinPkg.city,
      twinPkg.powerAssets,
      twinPkg.buildings,
      twinPkg.criticalInfrastructure,
    );
    const mappingResult = mapper.executeMapping();

    const geoImpact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      topology,
      {
        ...current,
        serviceRegions: mappingResult.serviceRegions,
        loadClusters: mappingResult.loadClusters,
        electricalGeoMappings: mappingResult.references,
      },
      twinPkg.criticalInfrastructure,
      get().activeCascade,
      get().clock.tick,
    );

    // Record deterministic telemetry point for the newly selected city
    const updatedTimeSeries = recordSimulationTelemetry(get().timeSeries, get().clock.tick, metrics);

    set({
      topology,
      powerBalance,
      metrics,
      timeSeries: updatedTimeSeries,
      geoTwin: {
        ...current,
        selectedCity: twinPkg.city,
        selectedEntityId: null,
        loadedEntitiesCount:
          twinPkg.buildings.length +
          twinPkg.criticalInfrastructure.length +
          twinPkg.powerAssets.length,
        provenanceSummary: twinPkg.provenanceSummary,
        serviceRegions: mappingResult.serviceRegions,
        loadClusters: mappingResult.loadClusters,
        electricalGeoMappings: mappingResult.references,
        criticalInfrastructure: twinPkg.criticalInfrastructure,
        simulationImpact: geoImpact,
        activeGeoCascadeSteps: geoImpact.latestCascadeSteps,
        viewport: {
          ...current.viewport,
          center: twinPkg.city.centerCoordinates,
          boundingBox: twinPkg.city.boundingBox,
        },
      },
      eventLog: [
        ...get().eventLog,
        {
          id: generateId('evt'),
          type: 'SYSTEM_INIT' as const,
          tick: get().clock.tick,
          timestamp: tickToTimestamp(get().clock.tick),
          message: `Geo-Twin initialized for ${twinPkg.city.name} (${twinPkg.buildings.length} buildings, ${twinPkg.criticalInfrastructure.length} critical facilities, ${twinPkg.powerAssets.length} power assets) [Provenance: SYNTHETIC/MODELED]`,
          severity: 'INFO' as const,
          relatedAssetIds: [],
          data: { cityId, provenance: 'SYNTHETIC' },
        },
      ].slice(-500),
    });
  },

  selectGeoEntity: (entityId: string | null) => {
    const current = get().geoTwin ?? DEFAULT_GEO_TWIN_STATE;
    set({
      geoTwin: {
        ...current,
        selectedEntityId: entityId,
      },
    });
  },

  setGeoViewport: (viewport: Partial<GeoViewport>) => {
    const current = get().geoTwin ?? DEFAULT_GEO_TWIN_STATE;
    set({
      geoTwin: {
        ...current,
        viewport: {
          ...current.viewport,
          ...viewport,
        },
      },
    });
  },

  toggleGeoLayer: (layerId: GeoLayerId) => {
    const current = get().geoTwin ?? DEFAULT_GEO_TWIN_STATE;
    const updated = {
      ...current.visibleLayers,
      [layerId]: !current.visibleLayers[layerId],
    };
    set({
      geoTwin: {
        ...current,
        visibleLayers: updated,
      },
    });
  },

  setAllGeoLayers: (enabled: boolean) => {
    const current = get().geoTwin ?? DEFAULT_GEO_TWIN_STATE;
    const updated = { ...current.visibleLayers };
    for (const key of Object.keys(updated) as GeoLayerId[]) {
      updated[key] = enabled;
    }
    set({
      geoTwin: {
        ...current,
        visibleLayers: updated,
      },
    });
  },

  searchAndNavigateCity: async (query: string): Promise<boolean> => {
    const current = get().geoTwin ?? DEFAULT_GEO_TWIN_STATE;

    set({
      geoTwin: {
        ...current,
        searchQuery: query,
        locationResolutionStatus: 'RESOLVING',
        errorMessage: null,
      },
    });

    try {
      const res = await defaultCityResolver.resolveLocation(query);
      if (!res) {
        const updated = get().geoTwin ?? DEFAULT_GEO_TWIN_STATE;
        set({
          geoTwin: {
            ...updated,
            locationResolutionStatus: 'ERROR',
            errorMessage: `Unable to resolve location "${query}". The digital twin remains focused on the previous city.`,
          },
        });
        return false;
      }

      // Stale check
      if (res.isStale) {
        console.warn(`[GeoTwin] Ignored stale location response for token ${res.generationToken}`);
        return false;
      }

      const city = res.city;
      const twinPkg = await defaultCityResolver.loadTwin(city.id);
      const updated = get().geoTwin ?? DEFAULT_GEO_TWIN_STATE;

      // Task 16: Bridge electrical topology to geographic entities
      const mapper = new GeoElectricalMapper(
        get().topology,
        city,
        twinPkg ? twinPkg.powerAssets : [],
        twinPkg ? twinPkg.buildings : [],
        twinPkg ? twinPkg.criticalInfrastructure : [],
      );
      const mappingResult = mapper.executeMapping();

      const geoImpact = GeoSimulationCoordinator.computeGeoSimulationImpact(
        get().topology,
        {
          ...updated,
          serviceRegions: mappingResult.serviceRegions,
          loadClusters: mappingResult.loadClusters,
          electricalGeoMappings: mappingResult.references,
        },
        twinPkg ? twinPkg.criticalInfrastructure : [],
        get().activeCascade,
        get().clock.tick,
      );

      set({
        geoTwin: {
          ...updated,
          selectedCity: city,
          selectedEntityId: null,
          locationResolutionStatus: 'SUCCESS',
          errorMessage: null,
          requestGenerationToken: res.generationToken,
          serviceRegions: mappingResult.serviceRegions,
          loadClusters: mappingResult.loadClusters,
          electricalGeoMappings: mappingResult.references,
          criticalInfrastructure: twinPkg ? twinPkg.criticalInfrastructure : [],
          simulationImpact: geoImpact,
          activeGeoCascadeSteps: geoImpact.latestCascadeSteps,
          loadedEntitiesCount: twinPkg
            ? twinPkg.buildings.length + twinPkg.criticalInfrastructure.length + twinPkg.powerAssets.length
            : 2,
          provenanceSummary: twinPkg
            ? twinPkg.provenanceSummary
            : {
                verifiedCount: city.provenance.sourceType === 'VERIFIED_EXTERNAL' ? 1 : 0,
                modeledCount: city.provenance.sourceType === 'MODELED' ? 1 : 0,
                syntheticCount: city.provenance.sourceType === 'SYNTHETIC' ? 1 : 0,
              },
          viewport: {
            ...updated.viewport,
            center: city.centerCoordinates,
            boundingBox: city.boundingBox,
            zoom: 11.5,
          },
        },
        eventLog: [
          ...get().eventLog,
          {
            id: generateId('evt'),
            type: 'SYSTEM_INIT' as const,
            tick: get().clock.tick,
            timestamp: tickToTimestamp(get().clock.tick),
            message: `Geo-Twin navigated to ${city.name} [Provenance: ${city.provenance.sourceType}]`,
            severity: 'INFO' as const,
            relatedAssetIds: [],
            data: { cityId: city.id, provenance: city.provenance.sourceType },
          },
        ].slice(-500),
      });

      return true;
    } catch (err: any) {
      const updated = get().geoTwin ?? DEFAULT_GEO_TWIN_STATE;
      set({
        geoTwin: {
          ...updated,
          locationResolutionStatus: 'ERROR',
          errorMessage: err.message || `Failed to resolve location "${query}".`,
        },
      });
      return false;
    }
  },

  setMapEngineStatus: (status: MapEngineStatus, error?: string) => {
    const current = get().geoTwin ?? DEFAULT_GEO_TWIN_STATE;
    set({
      geoTwin: {
        ...current,
        mapEngineStatus: status,
        errorMessage: error ?? current.errorMessage,
      },
    });
  },

  computeSpatialAllocations: () => {
    const current = get().geoTwin ?? DEFAULT_GEO_TWIN_STATE;
    if (!current.selectedCity) return;
    const mapper = new GeoElectricalMapper(
      get().topology,
      current.selectedCity,
      [],
      [],
      current.criticalInfrastructure ?? [],
    );
    const result = mapper.executeMapping();

    const geoImpact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      get().topology,
      {
        ...current,
        serviceRegions: result.serviceRegions,
        loadClusters: result.loadClusters,
        electricalGeoMappings: result.references,
      },
      current.criticalInfrastructure ?? [],
      get().activeCascade,
      get().clock.tick,
    );

    set({
      geoTwin: {
        ...current,
        serviceRegions: result.serviceRegions,
        loadClusters: result.loadClusters,
        electricalGeoMappings: result.references,
        simulationImpact: geoImpact,
        activeGeoCascadeSteps: geoImpact.latestCascadeSteps,
      },
    });
  },

  injectGeoFault: (geoEntityId: string, failureType?: FailureType) => {
    const state = get();
    const geoTwin = state.geoTwin;
    if (!geoTwin) return;

    const target = GeoSimulationCoordinator.resolveGeoFaultTarget(
      geoEntityId,
      geoTwin,
      state.topology,
    );
    if (!target) return;

    const resolvedType: FailureType =
      failureType ?? (target.assetType === 'substation' ? 'SUBSTATION_FAILURE' : 'LINE_FAILURE');
    get().injectFault(resolvedType, [target.targetAssetId]);
  },

  refreshGeoSimulationImpact: () => {
    const state = get();
    if (!state.geoTwin) return;
    const geoImpact = computeGeoSimulationImpactFromState(
      state.topology,
      state.geoTwin,
      state.activeCascade,
      state.clock.tick,
    );
    set({
      geoTwin: {
        ...state.geoTwin,
        simulationImpact: geoImpact.simulationImpact,
        activeGeoCascadeSteps: geoImpact.activeGeoCascadeSteps,
      },
    });
  },
}));
