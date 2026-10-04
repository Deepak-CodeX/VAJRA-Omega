// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Power Grid Digital Twin — Type Definitions
// ═══════════════════════════════════════════════════════════════════════

// ─── Asset Status ────────────────────────────────────────────────────

export type AssetStatus =
  | 'ONLINE'
  | 'WARNING'
  | 'OVERLOADED'
  | 'FAILED'
  | 'ISOLATED'
  | 'RECOVERING'
  | 'OFFLINE';

// ─── Generator Types ─────────────────────────────────────────────────

export type GeneratorType = 'solar' | 'wind' | 'thermal';

export interface Generator {
  id: string;
  name: string;
  type: GeneratorType;
  capacityMW: number;
  currentOutputMW: number;
  /** 0..1 — probability the unit is available at this tick */
  availability: number;
  /** 0..1 — conversion efficiency */
  efficiency: number;
  status: AssetStatus;
  /** For solar: irradiance factor 0..1; for wind: wind-speed factor 0..1; thermal: fuel factor */
  resourceFactor: number;
  /** Grid position for visualization */
  position: GridPosition;
  /** Connected substation IDs */
  connectedTo: string[];
  /** Ramp rate MW/min — how fast output can change */
  rampRateMW: number;
  /** Task 16: Non-destructive reference to geographic entity / coordinates */
  geoRef?: import('./geo').ElectricalGeoReference;
  geoEntityId?: string;
}

// ─── Substation ──────────────────────────────────────────────────────

export type SubstationType = 'transmission' | 'distribution';

export interface Substation {
  id: string;
  name: string;
  type: SubstationType;
  capacityMW: number;
  currentLoadMW: number;
  /** Per-unit voltage: 1.0 = nominal */
  voltagePU: number;
  /** Hz — nominal is 50.0 */
  frequencyHz: number;
  status: AssetStatus;
  position: GridPosition;
  /** IDs of connected transmission lines */
  connectedLines: string[];
  /** IDs of connected loads (distribution substations only) */
  connectedLoads: string[];
  /** IDs of connected generators (transmission substations only) */
  connectedGenerators: string[];
  /** Task 16: Non-destructive reference to geographic entity / coordinates */
  geoRef?: import('./geo').ElectricalGeoReference;
  geoEntityId?: string;
}

// ─── Transmission Line ──────────────────────────────────────────────

export interface TransmissionLine {
  id: string;
  name: string;
  fromId: string;
  toId: string;
  capacityMW: number;
  currentFlowMW: number;
  /** currentFlowMW / capacityMW — computed */
  loadingPercent: number;
  /** Ohmic losses in MW — simplified as percentage of flow */
  lossesMW: number;
  status: AssetStatus;
  /** Length in km (for loss calculation) */
  lengthKm: number;
  /** Task 16: Non-destructive reference to geographic entity / coordinates */
  geoRef?: import('./geo').ElectricalGeoReference;
  geoEntityId?: string;
  /** Multi-segment geographical corridor coordinates (preserves spatial geometry separately from circuit topology) */
  pathCoordinates?: import('./geo').GeoCoordinate[];
}

// ─── Battery Energy Storage ─────────────────────────────────────────

export interface Battery {
  id: string;
  name: string;
  capacityMWh: number;
  /** Current energy stored in MWh */
  stateOfChargeMWh: number;
  /** 0..1 — SOC as fraction */
  socPercent: number;
  /** Maximum charge rate MW */
  maxChargeRateMW: number;
  /** Maximum discharge rate MW */
  maxDischargeRateMW: number;
  /** Current charge/discharge: positive = discharging, negative = charging */
  currentFlowMW: number;
  status: AssetStatus;
  position: GridPosition;
  /** Connected substation */
  connectedTo: string;
  /** Round-trip efficiency 0..1 */
  efficiency: number;
  /** Task 16: Non-destructive reference to geographic entity / coordinates */
  geoRef?: import('./geo').ElectricalGeoReference;
  geoEntityId?: string;
}

// ─── Load (Consumer) ────────────────────────────────────────────────

export type LoadType = 'residential' | 'industrial' | 'commercial' | 'ev_charging';

export type LoadPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Load {
  id: string;
  name: string;
  type: LoadType;
  /** Demand in MW */
  demandMW: number;
  /** Base demand before time-of-day adjustment */
  baseDemandMW: number;
  priority: LoadPriority;
  /** Whether this load is currently receiving power */
  connected: boolean;
  status: AssetStatus;
  position: GridPosition;
  /** Connected substation */
  connectedTo: string;
  /** Number of consumers represented */
  consumerCount: number;
  /** Task 16: Non-destructive reference to geographic entity / coordinates */
  geoRef?: import('./geo').ElectricalGeoReference;
  geoEntityId?: string;
}

// ─── Grid Position (for 2D visualization) ───────────────────────────

export interface GridPosition {
  x: number;
  y: number;
}

// ─── Grid Topology ──────────────────────────────────────────────────

export interface GridTopology {
  generators: Generator[];
  substations: Substation[];
  transmissionLines: TransmissionLine[];
  batteries: Battery[];
  loads: Load[];
}

// ─── Power Balance ──────────────────────────────────────────────────

export interface PowerBalance {
  /** Total generation output MW */
  totalGenerationMW: number;
  /** Total consumer demand MW */
  totalDemandMW: number;
  /** Net battery contribution MW (positive = discharging into grid) */
  totalBatteryFlowMW: number;
  /** Total transmission losses MW */
  totalLossesMW: number;
  /** Generation + battery - demand - losses */
  netBalanceMW: number;
  /** Solar generation MW */
  solarGenerationMW: number;
  /** Wind generation MW */
  windGenerationMW: number;
  /** Thermal generation MW */
  thermalGenerationMW: number;
  /** Renewable as fraction of total generation */
  renewableFraction: number;
}

// ─── System Metrics ─────────────────────────────────────────────────

export interface SystemMetrics {
  /** Total installed generation capacity MW */
  totalCapacityMW: number;
  /** Total generation MW */
  totalGenerationMW: number;
  /** Total demand MW */
  totalDemandMW: number;
  /** Load served as percent of demand */
  loadServedPercent: number;
  /** Unserved load MW */
  unservedLoadMW: number;
  /** Renewable generation as percent of total */
  renewablePercent: number;
  /** Average battery SOC percent */
  avgBatterySOCPercent: number;
  /** Average line loading percent */
  avgLineLoadingPercent: number;
  /** Maximum line loading percent */
  maxLineLoadingPercent: number;
  /** Number of failed assets */
  failedAssetCount: number;
  /** Number of affected consumers (disconnected) */
  affectedConsumers: number;
  /** Critical loads served as percent */
  criticalLoadsServedPercent: number;
  /** System frequency Hz */
  systemFrequencyHz: number;
  /** System voltage health 0..1 */
  voltageHealthIndex: number;
  /** Frequency deviation from nominal (50 Hz) */
  frequencyDeviationHz: number;
  /** Total transmission losses MW */
  totalLossesMW: number;
}

// ─── Anomaly ────────────────────────────────────────────────────────

export type AnomalyType =
  | 'LINE_OVERLOAD'
  | 'SUBSTATION_OVERLOAD'
  | 'FREQUENCY_DEVIATION'
  | 'VOLTAGE_ANOMALY'
  | 'GENERATION_SHORTFALL'
  | 'CASCADING_FAILURE_RISK'
  | 'DEMAND_SPIKE'
  | 'BATTERY_CRITICAL';

export type AnomalySeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  assetId: string;
  assetName: string;
  message: string;
  value: number;
  threshold: number;
  detectedAtTick: number;
  resolved: boolean;
  resolvedAtTick?: number;
}

// ─── Event Log ──────────────────────────────────────────────────────

export type EventType =
  | 'SYSTEM_INIT'
  | 'FAILURE_INJECTED'
  | 'FAILURE_DETECTED'
  | 'CASCADE_STARTED'
  | 'CASCADE_STEP'
  | 'ANOMALY_DETECTED'
  | 'ANOMALY_RESOLVED'
  | 'RECOVERY_STARTED'
  | 'RECOVERY_ACTION'
  | 'RECOVERY_COMPLETE'
  | 'LOAD_DISCONNECTED'
  | 'LOAD_RESTORED'
  | 'BATTERY_DISPATCHED'
  | 'GENERATION_CHANGE'
  | 'GRID_STABILIZED'
  | 'SCENARIO_STARTED'
  | 'SCENARIO_ENDED';

export interface EventLogEntry {
  id: string;
  type: EventType;
  tick: number;
  timestamp: string;
  message: string;
  severity: AnomalySeverity;
  relatedAssetIds: string[];
  data?: Record<string, number | string | boolean>;
}

// ─── Failure ────────────────────────────────────────────────────────

export type FailureType =
  | 'SUBSTATION_FAILURE'
  | 'LINE_FAILURE'
  | 'GENERATOR_OUTAGE'
  | 'SOLAR_COLLAPSE'
  | 'WIND_REDUCTION'
  | 'BATTERY_FAILURE'
  | 'DEMAND_SPIKE'
  | 'EV_SURGE'
  | 'MULTI_FAULT';

export interface FailureEvent {
  id: string;
  type: FailureType;
  affectedAssetIds: string[];
  tick: number;
  resolved: boolean;
  resolvedAtTick?: number;
  description: string;
}

// ─── Cascading Failure ──────────────────────────────────────────────

export type CascadeStepAction =
  | 'INITIAL_FAILURE'
  | 'LINE_OVERLOAD'
  | 'LINE_TRIP'
  | 'ISOLATE_LOAD'
  | 'REDISTRIBUTE_FLOW'
  | 'CASCADE_STABILIZED';

export interface CascadeStep {
  tick: number;
  triggerAssetId: string;
  triggerReason: string;
  affectedAssetId: string;
  affectedAssetType: 'line' | 'substation' | 'generator' | 'load';
  loadRedistributedMW: number;
  resultingLoadingPercent: number;
  // Enhanced dynamic cascade tracking:
  stepIndex?: number;
  timestamp?: string;
  action?: CascadeStepAction;
  triggerAssetName?: string;
  affectedAssetName?: string;
  loadingBefore?: number;
  loadingAfter?: number;
  unservedLoadMW?: number;
  affectedConsumers?: number;
  depth?: number;
  status?: string;
}

export type CascadeStatus = 'READY' | 'PROPAGATING' | 'STABILIZED' | 'RESOLVED' | 'COLLAPSED';

export interface CascadeRecord {
  id: string;
  startTick: number;
  endTick?: number;
  steps: CascadeStep[];
  totalUnservedLoadMW: number;
  affectedConsumers: number;
  affectedAssetIds: string[];
  resolved: boolean;
  // Enhanced tracking:
  status?: CascadeStatus;
  depth?: number;
  maxOverloadPercent?: number;
  criticalLoadsAffected?: number;
  stabilityIndex?: number;
  initialFailureType?: FailureType;
}

// ─── Recovery ───────────────────────────────────────────────────────

export type RecoveryActionType =
  | 'ISOLATE'
  | 'REROUTE'
  | 'DISPATCH_BATTERY'
  | 'INCREASE_GENERATION'
  | 'SHED_LOAD'
  | 'RESTORE_LOAD'
  | 'PRIORITIZE_CRITICAL';

export interface RecoveryAction {
  id: string;
  type: RecoveryActionType;
  description: string;
  targetAssetIds: string[];
  /** Estimated benefit in MW restored or MW overload reduced */
  estimatedBenefitMW: number;
  /** Whether this action has been executed */
  executed: boolean;
  executedAtTick?: number;
  /** Actual measured impact after execution */
  actualBenefitMW?: number;
}

export interface RecoveryPlan {
  id: string;
  generatedAtTick: number;
  failureEventId: string;
  actions: RecoveryAction[];
  /** Objective scores before recovery */
  preRecoveryMetrics: RecoveryMetrics;
  /** Objective scores after recovery (filled after execution) */
  postRecoveryMetrics?: RecoveryMetrics;
  status: 'PROPOSED' | 'EXECUTING' | 'COMPLETED' | 'PARTIAL';
}

export interface RecoveryMetrics {
  unservedLoadMW: number;
  maxOverloadPercent: number;
  affectedConsumers: number;
  criticalLoadsServed: number;
  totalCriticalLoads: number;
  batteryUtilizationPercent: number;
  renewableUtilizationPercent: number;
  /** Overall grid stability index 0..1 */
  stabilityIndex: number;
}

// ─── Scenario ───────────────────────────────────────────────────────

export type ScenarioId =
  | 'NORMAL_OPERATION'
  | 'SUBSTATION_FAILURE'
  | 'TRANSMISSION_FAILURE'
  | 'RENEWABLE_DROP'
  | 'EXTREME_DEMAND'
  | 'EV_SURGE'
  | 'BATTERY_UNAVAILABLE'
  | 'MULTI_FAULT_CASCADE';

export interface Scenario {
  id: ScenarioId;
  name: string;
  description: string;
  failures: FailureType[];
  /** Optional specific asset IDs to fail; if empty, engine picks */
  targetAssetIds?: string[];
}

// ─── Forecast ───────────────────────────────────────────────────────

export interface ForecastPoint {
  tick: number;
  timestamp: string;
  demandMW: number;
  solarMW: number;
  windMW: number;
  confidence: number;
}

export interface DemandForecast {
  generatedAtTick: number;
  horizon: '15min' | '30min' | '1hr';
  points: ForecastPoint[];
}

// ─── Time Series & Telemetry Provenance (Phase 3) ───────────────────

export interface TimeSeriesPoint {
  tick: number;
  timestamp: string;
  value: number;
  unit?: string;
  source?: string;
  sourceType?: 'SIMULATED' | 'CURRENT_PUBLIC' | 'HISTORICAL' | 'INFERRED' | 'LIVE_SCADA';
  classification?: 'GREEN' | 'BLUE' | 'YELLOW' | 'PURPLE' | 'RED';
  confidence?: number;
}

export interface TelemetryRecord {
  tick: number;
  timestamp: string;
  generationMW: TimeSeriesPoint;
  demandMW: TimeSeriesPoint;
  frequencyHz: TimeSeriesPoint;
  voltageHealthIndex: TimeSeriesPoint;
  batterySOCPercent: TimeSeriesPoint;
  lineLoadingPercent: TimeSeriesPoint;
  renewablePercent: TimeSeriesPoint;
  unservedLoadMW: TimeSeriesPoint;
}

export interface GridTimeSeries {
  generation: TimeSeriesPoint[];
  demand: TimeSeriesPoint[];
  frequency: TimeSeriesPoint[];
  voltage: TimeSeriesPoint[];
  batterySOC: TimeSeriesPoint[];
  lineLoading: TimeSeriesPoint[];
  renewablePercent: TimeSeriesPoint[];
  unservedLoad: TimeSeriesPoint[];
}

// ─── Simulation Clock ───────────────────────────────────────────────

export type SimulationSpeed = 0.5 | 1 | 2 | 5 | 10;

export interface SimulationClock {
  /** Whether the simulation is running */
  isRunning: boolean;
  /** Speed multiplier */
  speed: SimulationSpeed;
  /** Current tick number (each tick = 1 simulated second) */
  tick: number;
  /** Ticks per simulated minute */
  ticksPerMinute: number;
  /** Real start time */
  startedAt: number;
}

// ─── Snapshot (for before/after comparison) ──────────────────────────

export interface GridSnapshot {
  tick: number;
  timestamp: string;
  metrics: SystemMetrics;
  powerBalance: PowerBalance;
  failedAssetIds: string[];
  disconnectedLoadIds: string[];
  overloadedLineIds: string[];
  activeCascadeCount: number;
}

// ─── Complete Simulation State ──────────────────────────────────────

export interface SimulationState {
  clock: SimulationClock;
  topology: GridTopology;
  powerBalance: PowerBalance;
  metrics: SystemMetrics;
  anomalies: Anomaly[];
  eventLog: EventLogEntry[];
  failures: FailureEvent[];
  cascades: CascadeRecord[];
  recoveryPlans: RecoveryPlan[];
  forecasts: DemandForecast[];
  timeSeries: GridTimeSeries;
  activeScenario: ScenarioId | null;
  snapshots: {
    before: GridSnapshot | null;
    after: GridSnapshot | null;
  };
  activeCascade: CascadeRecord | null;
  activeCascadeStepIndex: number;
  isCascadeRunning: boolean;
  geoTwin?: import('./geo').GeoTwinState;
  initialized: boolean;
}

// ─── Geo-Twin Domain Exports ────────────────────────────────────────
export * from './geo';
