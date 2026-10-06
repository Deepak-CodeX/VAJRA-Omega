// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Geo-Electrical State Adapter
// ═══════════════════════════════════════════════════════════════════════
// Single authoritative bridge between the Electrical Simulation Engine
// and the Geo-Twin Geographic Visualization.
//
// Architecture:
//   CANONICAL ASSET GRAPH
//           ↓
//   ELECTRICAL SIMULATION ENGINE
//           ↓
//   SIMULATION STATE
//           ↓
//   GEO-ELECTRICAL STATE ADAPTER (This Module)
//           ↓
//   GEOGRAPHIC FEATURE OPERATIONAL STATE
//           ↓
//   MAPLIBRE RENDERER
// ═══════════════════════════════════════════════════════════════════════

import type {
  GridTopology,
  Substation,
  TransmissionLine,
  Generator as GridGenerator,
  CascadeRecord,
  RecoveryPlan,
  GeoTwinState,
} from '@/types';
import type {
  GeoPowerAsset,
  CriticalInfrastructure,
  Building,
  EstimatedServiceRegion,
  SpatialLoadCluster,
  SpatialLoadZone,
  GeoSimulationImpact,
} from '@/types/geo';
import { tickToTimestamp } from '@/lib/utils';
import { MapEngineAdapter } from './mapEngineAdapter';

// ─── Supported Operational States (Phase 4.8 Section 3) ───────────────

export type OperationalState =
  | 'NORMAL'
  | 'WARNING'
  | 'OVERLOADED'
  | 'TRIPPED'
  | 'FAILED'
  | 'RECOVERING'
  | 'SIMULATED';

export type DisplayOperationalState =
  | 'NORMAL'
  | 'SIMULATED WARNING'
  | 'SIMULATED OVERLOAD'
  | 'SIMULATED TRIPPED'
  | 'SIMULATED FAILED'
  | 'SIMULATED RECOVERING'
  | 'MODELED / SIMULATED';

// ─── Semantic Color Constants (VAJRA Semantic Hierarchy) ──────────────

export const SEMANTIC_COLORS = {
  GREEN: '#10b981',       // Healthy / Normal operational state
  BLUE_CORE: '#0284c7',   // Verified public infrastructure core (substations)
  BLUE_LINE: '#38bdf8',   // Transmission / grid infrastructure corridor
  BLUE_INFRA: '#3b82f6',  // Critical infrastructure public facility
  YELLOW: '#eab308',      // Warning (loading >= 85%, minor voltage deviation)
  ORANGE: '#f97316',      // Overload (loading >= 100%)
  RED: '#ef4444',         // Failed / Tripped asset
  PURPLE: '#a855f7',      // Simulated / Modelled state
  CYAN_RECOVERY: '#00e5c8', // Active blackstart / recovering state
} as const;

// ─── Feature Operational State Interface ─────────────────────────────

export interface GeoFeatureOperationalState {
  featureId: string;
  canonicalAssetId: string;
  simulationAssetId: string;
  operationalState: OperationalState;
  displayStatus: DisplayOperationalState | string;
  semanticColor: string;
  strokeColor?: string;
  healthColor?: string;
  loadingPercent?: number;
  voltagePU?: number;
  frequencyHz?: number;
  capacityMW?: number;
  currentFlowMW?: number;
  servedMW?: number;
  unservedMW?: number;
  isRecovering: boolean;
  isTripped: boolean;
  isOverloaded: boolean;
  isSimulated: boolean;
  provenanceClassification: string;
  lastSynchronizedTick: number;
  timestamp: string;

  // Phase 5: Electrical Flow Model & Provenance
  fromSubstationId?: string;
  toSubstationId?: string;
  sourceSubstationId?: string;
  destinationSubstationId?: string;
  sourceSubstationName?: string;
  destinationSubstationName?: string;
  activePowerFlowMW?: number;
  signedFlowMW?: number;
  flowDirection?: 'A_TO_B' | 'B_TO_A' | 'ZERO';
  geometryType?: 'SCHEMATIC' | 'INFERRED' | 'VERIFIED_PUBLIC';
  flowLineWidth?: number;
  flowColor?: string;
  isGenerator?: boolean;
  generatorOutputMW?: number;
  generatorType?: string;
  suppliedLoadRegions?: string[];
  supplyingSubstations?: { id: string; name: string; flowMW: number }[];
  upstreamSubstations?: { id: string; name: string; flowMW: number }[];
  downstreamSubstations?: { id: string; name: string; flowMW: number }[];
}

// ─── Full Geo-Twin Synchronized State Snapshot ────────────────────────

export interface GeoTwinSynchronizedState {
  tick: number;
  timestamp: string;
  cityId: string;
  substations: Record<string, GeoFeatureOperationalState>;
  transmissionCorridors: Record<string, GeoFeatureOperationalState>;
  serviceRegions: Record<string, GeoFeatureOperationalState>;
  loadClusters: Record<string, GeoFeatureOperationalState>;
  loadZones: Record<string, GeoFeatureOperationalState>;
  criticalInfrastructure: Record<string, GeoFeatureOperationalState>;
  gridHealth: {
    overallState: OperationalState;
    displayStatus: string;
    healthColor: string;
    totalDemandMW: number;
    totalServedMW: number;
    totalUnservedMW: number;
    serviceFraction: number;
    trippedSubstationsCount: number;
    overloadedLinesCount: number;
    criticalFacilitiesAtRiskCount: number;
    isCascadeActive: boolean;
  };
}

// ─── GeoElectricalStateAdapter Class ──────────────────────────────────

export class GeoElectricalStateAdapter {
  /**
   * Primary entry point: Synchronizes simulation state into deterministic
   * geographic feature operational states.
   */
  public static synchronize(
    topology: GridTopology,
    geoTwin: GeoTwinState,
    cityAssets: {
      powerAssets: GeoPowerAsset[];
      criticalInfrastructure: CriticalInfrastructure[];
      buildings: Building[];
      serviceRegions?: EstimatedServiceRegion[];
      loadClusters?: SpatialLoadCluster[];
      loadZones?: SpatialLoadZone[];
    },
    cityId: string,
    tick: number = 0,
    recoveryPlans: RecoveryPlan[] = [],
    activeCascade?: CascadeRecord | null,
  ): GeoTwinSynchronizedState {
    const timestamp = tickToTimestamp(tick);

    // Build lookup maps for electrical assets
    const subMap = new Map(topology.substations.map((s) => [s.id, s]));
    const lineMap = new Map(topology.transmissionLines.map((l) => [l.id, l]));
    const genMap = new Map(topology.generators.map((g) => [g.id, g]));

    // Check active recovery plan targets
    const activeRecoveryPlan = recoveryPlans.find(
      (p) => p.status === 'EXECUTING' || p.status === 'PROPOSED',
    );
    const recoveringAssetIds = new Set<string>();
    if (activeRecoveryPlan) {
      for (const action of activeRecoveryPlan.actions) {
        if (!action.executed && action.targetAssetIds) {
          for (const targetId of action.targetAssetIds) {
            recoveringAssetIds.add(targetId);
          }
        }
      }
    }

    // Fast lookup for electrical ↔ geo mapping
    const elecToGeo = new Map<string, string>();
    const geoToElec = new Map<string, string>();
    if (geoTwin.electricalGeoMappings) {
      for (const m of geoTwin.electricalGeoMappings) {
        elecToGeo.set(m.electricalAssetId, m.geoEntityId);
        geoToElec.set(m.geoEntityId, m.electricalAssetId);
      }
    }

    // Helper for deterministic asset ID resolution
    function resolveSubstation(geoAsset: GeoPowerAsset): Substation | undefined {
      // 1. Direct ID in topology
      let sub = subMap.get(geoAsset.id);
      if (sub) return sub;

      // 2. electricalAssetId on geoAsset
      if (geoAsset.electricalAssetId) {
        sub = subMap.get(geoAsset.electricalAssetId);
        if (sub) return sub;
      }

      // 3. Mapping bridge lookup
      const elecId = geoToElec.get(geoAsset.id);
      if (elecId) {
        sub = subMap.get(elecId);
        if (sub) return sub;
      }

      // 4. Fuzzy / canonical ID normalization (e.g. del-sub-badarpur-400kv <-> sub-del-badarpur-400kv)
      const cleanId = geoAsset.id.replace(/^(del-|mum-|blr-|chn-|kol-|pun-|srt-|bhp-|ind-)/, '');
      const altId = `sub-${geoAsset.id}`;
      for (const s of topology.substations) {
        if (s.id.includes(cleanId) || geoAsset.id.includes(s.id) || s.id === altId) {
          return s;
        }
      }
      return undefined;
    }

    function resolveGenerator(geoAsset: GeoPowerAsset): GridGenerator | undefined {
      let gen = genMap.get(geoAsset.id);
      if (gen) return gen;

      if (geoAsset.electricalAssetId) {
        gen = genMap.get(geoAsset.electricalAssetId);
        if (gen) return gen;
      }

      const elecId = geoToElec.get(geoAsset.id);
      if (elecId) {
        gen = genMap.get(elecId);
        if (gen) return gen;
      }

      const cleanId = geoAsset.id.replace(/^(del-|mum-|blr-|chn-|kol-|pun-|srt-|bhp-|ind-)/, '');
      for (const g of topology.generators) {
        if (g.name === geoAsset.name || g.id.includes(cleanId) || geoAsset.id.includes(g.id)) {
          return g;
        }
      }
      return undefined;
    }

    function resolveLine(geoAsset: GeoPowerAsset): TransmissionLine | undefined {
      let line = lineMap.get(geoAsset.id);
      if (line) return line;

      if (geoAsset.electricalAssetId) {
        line = lineMap.get(geoAsset.electricalAssetId);
        if (line) return line;
      }

      const elecId = geoToElec.get(geoAsset.id);
      if (elecId) {
        line = lineMap.get(elecId);
        if (line) return line;
      }

      // Match by endpoints or name
      for (const l of topology.transmissionLines) {
        if (l.name === geoAsset.name || geoAsset.id.includes(l.id) || l.id.includes(geoAsset.id)) {
          return l;
        }
      }
      return undefined;
    }

    // ─── 1. Synchronize Substations & Nodes ────────────────────────────
    const substations: Record<string, GeoFeatureOperationalState> = {};
    let trippedSubsCount = 0;

    const subAssets = cityAssets.powerAssets.filter((a) => a.category !== 'TRANSMISSION_LINE');
    for (const a of subAssets) {
      const simSub = resolveSubstation(a);
      const simGen = !simSub ? resolveGenerator(a) : undefined;
      const simNode = simSub || simGen;
      const isSimulated = a.provenance?.isVerifiedRealWorld === false || a.provenance?.sourceType === 'SYNTHETIC';
      const isRecovering = !!simNode && recoveringAssetIds.has(simNode.id);

      let opState: OperationalState = 'NORMAL';
      let displayStatus: DisplayOperationalState = 'NORMAL';
      let semanticColor: string = SEMANTIC_COLORS.BLUE_CORE;
      let strokeColor: string = SEMANTIC_COLORS.GREEN;
      let isTripped = false;
      let isOverloaded = false;

      const isFailedOrIsolated = simNode ? (simNode.status === 'FAILED' || simNode.status === 'ISOLATED') : false;

      const subLoading = simSub && simSub.capacityMW > 0
        ? (simSub.currentLoadMW / simSub.capacityMW) * 100
        : simGen && simGen.capacityMW > 0
        ? (simGen.currentOutputMW / simGen.capacityMW) * 100
        : ((simNode as any)?.loadingPercent ?? 65);

      if (isSimulated) {
        opState = 'SIMULATED';
        displayStatus = 'MODELED / SIMULATED';
        semanticColor = SEMANTIC_COLORS.PURPLE;
        strokeColor = '#c084fc';
      } else if (isRecovering) {
        opState = 'RECOVERING';
        displayStatus = 'SIMULATED RECOVERING';
        semanticColor = SEMANTIC_COLORS.CYAN_RECOVERY;
        strokeColor = '#5eead4';
      } else if (isFailedOrIsolated) {
        opState = 'TRIPPED';
        displayStatus = 'SIMULATED TRIPPED';
        semanticColor = SEMANTIC_COLORS.RED;
        strokeColor = '#fca5a5';
        isTripped = true;
        trippedSubsCount++;
      } else if (subLoading >= 100) {
        opState = 'OVERLOADED';
        displayStatus = 'SIMULATED OVERLOAD';
        semanticColor = SEMANTIC_COLORS.ORANGE;
        strokeColor = '#fed7aa';
        isOverloaded = true;
      } else if (subLoading >= 85 || (simSub && Math.abs(simSub.voltagePU - 1.0) > 0.05)) {
        opState = 'WARNING';
        displayStatus = 'SIMULATED WARNING';
        semanticColor = SEMANTIC_COLORS.YELLOW;
        strokeColor = '#fef08a';
      }

      substations[a.id] = {
        featureId: a.id,
        canonicalAssetId: a.id,
        simulationAssetId: simNode?.id ?? a.electricalAssetId ?? a.id,
        operationalState: opState,
        displayStatus,
        semanticColor,
        strokeColor,
        healthColor: isTripped ? SEMANTIC_COLORS.RED : isOverloaded ? SEMANTIC_COLORS.ORANGE : opState === 'WARNING' ? SEMANTIC_COLORS.YELLOW : SEMANTIC_COLORS.GREEN,
        loadingPercent: subLoading,
        voltagePU: simSub?.voltagePU ?? 1.0,
        frequencyHz: simSub?.frequencyHz ?? 50.0,
        capacityMW: a.nominalCapacityMW,
        isRecovering,
        isTripped,
        isOverloaded,
        isSimulated,
        provenanceClassification: a.provenance?.sourceType ?? 'CURRENT_PUBLIC',
        lastSynchronizedTick: tick,
        timestamp,
        isGenerator: a.category === 'GENERATOR' || !!simGen,
        generatorOutputMW: simGen ? simGen.currentOutputMW : undefined,
        generatorType: simGen ? simGen.type : undefined,
        suppliedLoadRegions: (cityAssets.serviceRegions ?? geoTwin.serviceRegions ?? [])
          .filter((r) => r.substationId === a.id || r.substationId === a.electricalAssetId)
          .map((r) => r.substationName || r.id),
      };
    }

    // ─── 2. Synchronize Transmission Corridors (Flow, Direction, Magnitude) ─
    const transmissionCorridors: Record<string, GeoFeatureOperationalState> = {};
    let overloadedLinesCount = 0;

    const lineAssets = cityAssets.powerAssets.filter((a) => a.category === 'TRANSMISSION_LINE');
    for (const a of lineAssets) {
      const simLine = resolveLine(a);
      const isSimulated = a.provenance?.isVerifiedRealWorld === false || a.provenance?.sourceType === 'SYNTHETIC';
      const isRecovering = !!simLine && recoveringAssetIds.has(simLine.id);

      let opState: OperationalState = 'NORMAL';
      let displayStatus: DisplayOperationalState = 'NORMAL';
      let semanticColor: string = SEMANTIC_COLORS.BLUE_LINE;
      let isTripped = false;
      let isOverloaded = false;

      const loadingPercent = simLine?.loadingPercent ?? 60;
      const signedFlowMW = simLine ? Math.round(simLine.currentFlowMW * 10) / 10 : Math.round(loadingPercent * 4 * 10) / 10;
      const activePowerFlowMW = Math.abs(signedFlowMW);

      // Deterministic flow direction
      const flowDirection: 'A_TO_B' | 'B_TO_A' | 'ZERO' =
        activePowerFlowMW < 0.05
          ? 'ZERO'
          : signedFlowMW >= 0
          ? 'A_TO_B'
          : 'B_TO_A';

      const fromId = simLine?.fromId ?? a.id.split('--')[0]?.replace('line-', '')?.replace('inferred-', '') ?? '';
      const toId = simLine?.toId ?? a.id.split('--')[1] ?? '';

      const sourceSubId = flowDirection === 'B_TO_A' ? toId : fromId;
      const destSubId = flowDirection === 'B_TO_A' ? fromId : toId;

      const sourceName = subAssets.find((s) => s.id === sourceSubId || s.electricalAssetId === sourceSubId)?.name ?? sourceSubId;
      const destName = subAssets.find((s) => s.id === destSubId || s.electricalAssetId === destSubId)?.name ?? destSubId;

      if (isSimulated) {
        opState = 'SIMULATED';
        displayStatus = 'MODELED / SIMULATED';
        semanticColor = SEMANTIC_COLORS.PURPLE;
      } else if (isRecovering) {
        opState = 'RECOVERING';
        displayStatus = 'SIMULATED RECOVERING';
        semanticColor = SEMANTIC_COLORS.CYAN_RECOVERY;
      } else if (simLine?.status === 'FAILED') {
        opState = 'TRIPPED';
        displayStatus = 'SIMULATED TRIPPED';
        semanticColor = SEMANTIC_COLORS.RED;
        isTripped = true;
      } else if (loadingPercent >= 100) {
        opState = 'OVERLOADED';
        displayStatus = 'SIMULATED OVERLOAD';
        semanticColor = SEMANTIC_COLORS.ORANGE;
        isOverloaded = true;
        overloadedLinesCount++;
      } else if (loadingPercent >= 85) {
        opState = 'WARNING';
        displayStatus = 'SIMULATED WARNING';
        semanticColor = SEMANTIC_COLORS.YELLOW;
      }

      // Visual encoding: deterministic width scaled by loading magnitude
      const flowLineWidth = Math.max(1.8, Math.min(6.5, 1.8 + (loadingPercent / 100) * 4.2));

      // Operational flow color (Green = normal flow on blue infrastructure, Orange = overload, Red = tripped)
      const flowColor = isTripped
        ? SEMANTIC_COLORS.RED
        : isOverloaded
        ? SEMANTIC_COLORS.ORANGE
        : loadingPercent >= 85
        ? SEMANTIC_COLORS.YELLOW
        : isRecovering
        ? SEMANTIC_COLORS.CYAN_RECOVERY
        : isSimulated
        ? SEMANTIC_COLORS.PURPLE
        : SEMANTIC_COLORS.GREEN;

      transmissionCorridors[a.id] = {
        featureId: a.id,
        canonicalAssetId: a.id,
        simulationAssetId: simLine?.id ?? a.electricalAssetId ?? a.id,
        operationalState: opState,
        displayStatus,
        semanticColor,
        healthColor: isTripped ? SEMANTIC_COLORS.RED : isOverloaded ? SEMANTIC_COLORS.ORANGE : opState === 'WARNING' ? SEMANTIC_COLORS.YELLOW : SEMANTIC_COLORS.GREEN,
        loadingPercent,
        capacityMW: simLine?.capacityMW ?? a.nominalCapacityMW ?? 400,
        currentFlowMW: signedFlowMW,
        activePowerFlowMW,
        signedFlowMW,
        flowDirection,
        fromSubstationId: fromId,
        toSubstationId: toId,
        sourceSubstationId: sourceSubId,
        destinationSubstationId: destSubId,
        sourceSubstationName: sourceName,
        destinationSubstationName: destName,
        geometryType: a.id.includes('inferred') ? 'INFERRED' : 'SCHEMATIC',
        flowLineWidth,
        flowColor,
        isRecovering,
        isTripped,
        isOverloaded,
        isSimulated,
        provenanceClassification: a.provenance?.sourceType ?? 'VERIFIED_EXTERNAL',
        lastSynchronizedTick: tick,
        timestamp,
      };
    }

    // Now populate upstream and downstream connections for substations
    for (const [subId, subState] of Object.entries(substations)) {
      const upstream: { id: string; name: string; flowMW: number }[] = [];
      const downstream: { id: string; name: string; flowMW: number }[] = [];

      for (const lineState of Object.values(transmissionCorridors)) {
        if (lineState.isTripped) continue;
        const lineFlow = lineState.activePowerFlowMW ?? 0;
        if (lineFlow < 0.1) continue;

        if (lineState.destinationSubstationId === subId || lineState.destinationSubstationId === subState.simulationAssetId) {
          upstream.push({
            id: lineState.sourceSubstationId ?? '',
            name: lineState.sourceSubstationName ?? lineState.sourceSubstationId ?? '',
            flowMW: lineFlow,
          });
        } else if (lineState.sourceSubstationId === subId || lineState.sourceSubstationId === subState.simulationAssetId) {
          downstream.push({
            id: lineState.destinationSubstationId ?? '',
            name: lineState.destinationSubstationName ?? lineState.destinationSubstationId ?? '',
            flowMW: lineFlow,
          });
        }
      }

      // Add generators feeding this substation as upstream sources
      for (const gen of topology.generators) {
        if (gen.status === 'ONLINE' && (gen.connectedTo.includes(subId) || gen.connectedTo.includes(subState.simulationAssetId))) {
          upstream.unshift({
            id: gen.id,
            name: gen.name,
            flowMW: gen.currentOutputMW,
          });
        }
      }

      subState.upstreamSubstations = upstream;
      subState.downstreamSubstations = downstream;
    }

    // ─── 3. Synchronize Service Regions (Who Supplies This Region) ────
    const serviceRegions: Record<string, GeoFeatureOperationalState> = {};
    const regions = cityAssets.serviceRegions ?? geoTwin.serviceRegions ?? [];

    for (const r of regions) {
      const associatedSubState = Object.values(substations).find(
        (s) => s.canonicalAssetId === r.substationId || s.simulationAssetId === r.substationId,
      );
      const isSubFailed = associatedSubState ? associatedSubState.isTripped : false;

      let opState: OperationalState = 'NORMAL';
      let displayStatus: DisplayOperationalState = 'NORMAL';
      let semanticColor = '#0f172a';
      let strokeColor = '#1e293b';

      if (isSubFailed) {
        opState = 'FAILED';
        displayStatus = 'SIMULATED TRIPPED';
        semanticColor = SEMANTIC_COLORS.RED;
        strokeColor = SEMANTIC_COLORS.RED;
      } else if (associatedSubState?.isOverloaded) {
        opState = 'OVERLOADED';
        displayStatus = 'SIMULATED OVERLOAD';
        semanticColor = SEMANTIC_COLORS.ORANGE;
        strokeColor = SEMANTIC_COLORS.ORANGE;
      } else if (associatedSubState?.operationalState === 'WARNING') {
        opState = 'WARNING';
        displayStatus = 'SIMULATED WARNING';
        semanticColor = SEMANTIC_COLORS.YELLOW;
        strokeColor = SEMANTIC_COLORS.YELLOW;
      }

      const demandMW = r.totalEstimatedDemandMW ?? 80;
      const unservedMW = isSubFailed ? demandMW : 0;
      const servedMW = isSubFailed ? 0 : demandMW;

      serviceRegions[r.id] = {
        featureId: r.id,
        canonicalAssetId: r.id,
        simulationAssetId: r.substationId,
        operationalState: opState,
        displayStatus,
        semanticColor,
        strokeColor,
        isRecovering: associatedSubState?.isRecovering ?? false,
        isTripped: isSubFailed,
        isOverloaded: associatedSubState?.isOverloaded ?? false,
        isSimulated: true, // Always Modeled/Inferred
        provenanceClassification: 'MODELED',
        lastSynchronizedTick: tick,
        timestamp,
        servedMW,
        unservedMW,
        capacityMW: demandMW,
        supplyingSubstations: associatedSubState
          ? [
              {
                id: associatedSubState.canonicalAssetId,
                name: subAssets.find((s) => s.id === associatedSubState.canonicalAssetId)?.name ?? associatedSubState.canonicalAssetId,
                flowMW: servedMW,
              },
            ]
          : [],
      };
    }

    // ─── 4. Synchronize Load Clusters & Load Zones ────────────────────
    const loadClusters: Record<string, GeoFeatureOperationalState> = {};
    const clusters = cityAssets.loadClusters ?? geoTwin.loadClusters ?? [];
    for (const c of clusters) {
      // Find nearest service region to check power supply
      const matchingRegion = Object.values(serviceRegions).find((r) => r.isTripped);
      const isClusterCurtailment = !!matchingRegion && c.totalDemandMW > 150;

      loadClusters[c.id] = {
        featureId: c.id,
        canonicalAssetId: c.id,
        simulationAssetId: c.id,
        operationalState: isClusterCurtailment ? 'WARNING' : 'NORMAL',
        displayStatus: isClusterCurtailment ? 'SIMULATED WARNING' : 'MODELED / SIMULATED',
        semanticColor: isClusterCurtailment ? SEMANTIC_COLORS.YELLOW : SEMANTIC_COLORS.BLUE_CORE,
        strokeColor: isClusterCurtailment ? SEMANTIC_COLORS.YELLOW : SEMANTIC_COLORS.GREEN,
        isRecovering: false,
        isTripped: false,
        isOverloaded: isClusterCurtailment,
        isSimulated: true,
        provenanceClassification: 'MODELED',
        servedMW: isClusterCurtailment ? c.totalDemandMW * 0.8 : c.totalDemandMW,
        unservedMW: isClusterCurtailment ? c.totalDemandMW * 0.2 : 0,
        lastSynchronizedTick: tick,
        timestamp,
      };
    }

    const loadZones: Record<string, GeoFeatureOperationalState> = {};
    const zones = cityAssets.loadZones ?? geoTwin.loadZones ?? [];
    for (const z of zones) {
      loadZones[z.id] = {
        featureId: z.id,
        canonicalAssetId: z.id,
        simulationAssetId: z.id,
        operationalState: 'NORMAL',
        displayStatus: 'MODELED / SIMULATED',
        semanticColor: '#6366f1',
        isRecovering: false,
        isTripped: false,
        isOverloaded: false,
        isSimulated: true,
        provenanceClassification: 'MODELED',
        lastSynchronizedTick: tick,
        timestamp,
      };
    }

    // ─── 5. Synchronize Critical Infrastructure ───────────────────────
    const criticalInfrastructure: Record<string, GeoFeatureOperationalState> = {};
    let criticalAtRiskCount = 0;

    for (const infra of cityAssets.criticalInfrastructure) {
      // Check if feeding substation is tripped
      const feedSubId = infra.servedBySubstationId;
      const feedSub = feedSubId ? substations[feedSubId] ?? Object.values(substations).find((s) => s.simulationAssetId === feedSubId) : undefined;
      const isFeedTripped = feedSub ? feedSub.isTripped : false;

      let opState: OperationalState = 'NORMAL';
      let displayStatus = 'NORMAL';
      let semanticColor: string = SEMANTIC_COLORS.BLUE_INFRA;
      let strokeColor: string = SEMANTIC_COLORS.GREEN;

      if (isFeedTripped) {
        if ((infra.emergencyBackupGenerationMW ?? 0) > 0) {
          opState = 'WARNING';
          displayStatus = 'SIMULATED BACKUP ACTIVE';
          semanticColor = SEMANTIC_COLORS.YELLOW;
          strokeColor = '#fef08a';
        } else {
          opState = 'TRIPPED';
          displayStatus = 'SIMULATED OUTAGE';
          semanticColor = SEMANTIC_COLORS.RED;
          strokeColor = '#fca5a5';
        }
        criticalAtRiskCount++;
      }

      criticalInfrastructure[infra.id] = {
        featureId: infra.id,
        canonicalAssetId: infra.id,
        simulationAssetId: feedSubId ?? infra.id,
        operationalState: opState,
        displayStatus,
        semanticColor,
        strokeColor,
        isRecovering: feedSub?.isRecovering ?? false,
        isTripped: isFeedTripped,
        isOverloaded: false,
        isSimulated: false,
        provenanceClassification: 'VERIFIED_EXTERNAL',
        lastSynchronizedTick: tick,
        timestamp,
      };
    }

    // ─── 6. Compute Aggregate Grid Health ─────────────────────────────
    let totalDemandMW = 0;
    let totalServedMW = 0;
    let totalUnservedMW = 0;

    for (const r of Object.values(serviceRegions)) {
      totalDemandMW += (r.servedMW ?? 0) + (r.unservedMW ?? 0);
      totalServedMW += r.servedMW ?? 0;
      totalUnservedMW += r.unservedMW ?? 0;
    }
    if (totalDemandMW === 0) {
      totalDemandMW = 250;
      totalServedMW = 250;
    }

    const serviceFraction = totalDemandMW > 0 ? totalServedMW / totalDemandMW : 1.0;
    const isCascadeActive = (activeCascade?.affectedAssetIds?.length ?? 0) > 0 || trippedSubsCount > 0;

    let overallState: OperationalState = 'NORMAL';
    let healthColor: string = SEMANTIC_COLORS.GREEN;
    let displayStatus = 'NORMAL OPERATION';

    if (trippedSubsCount > 0 || serviceFraction < 0.75) {
      overallState = 'TRIPPED';
      healthColor = SEMANTIC_COLORS.RED;
      displayStatus = 'SIMULATED CASCADE FAILURE';
    } else if (overloadedLinesCount > 0 || serviceFraction < 0.95) {
      overallState = 'OVERLOADED';
      healthColor = SEMANTIC_COLORS.ORANGE;
      displayStatus = 'SIMULATED OVERLOAD CONTINGENCY';
    } else if (recoveringAssetIds.size > 0) {
      overallState = 'RECOVERING';
      healthColor = SEMANTIC_COLORS.CYAN_RECOVERY;
      displayStatus = 'SIMULATED BLACKSTART RECOVERY';
    }

    return {
      tick,
      timestamp,
      cityId,
      substations,
      transmissionCorridors,
      serviceRegions,
      loadClusters,
      loadZones,
      criticalInfrastructure,
      gridHealth: {
        overallState,
        displayStatus,
        healthColor,
        totalDemandMW: Math.round(totalDemandMW * 10) / 10,
        totalServedMW: Math.round(totalServedMW * 10) / 10,
        totalUnservedMW: Math.round(totalUnservedMW * 10) / 10,
        serviceFraction: Math.round(serviceFraction * 1000) / 1000,
        trippedSubstationsCount: trippedSubsCount,
        overloadedLinesCount,
        criticalFacilitiesAtRiskCount: criticalAtRiskCount,
        isCascadeActive,
      },
    };
  }

  /**
   * Applies the synchronized state to the MapLibre engine via MapEngineAdapter.
   * Incremental: Updates GeoJSON source data without rebuilding layers or map instances.
   */
  public static applyToMapAdapter(
    adapter: MapEngineAdapter,
    syncState: GeoTwinSynchronizedState,
    cityAssets: {
      powerAssets: GeoPowerAsset[];
      criticalInfrastructure: CriticalInfrastructure[];
      buildings: Building[];
      serviceRegions?: EstimatedServiceRegion[];
    },
    geoSimulationImpact?: GeoSimulationImpact,
    selectedEntityId?: string | null,
  ): void {
    if (!adapter) return;

    // 1. Build substation status lookup map for setPowerAssets
    const subStatuses: Record<string, string> = {};
    for (const [id, state] of Object.entries(syncState.substations)) {
      subStatuses[id] = state.operationalState;
      if (state.simulationAssetId) {
        subStatuses[state.simulationAssetId] = state.operationalState;
      }
    }

    // 2. Build transmission corridor impacts lookup
    const corridorImpacts: Record<string, import('@/types/geo').TransmissionCorridorImpact> = {};
    for (const [id, state] of Object.entries(syncState.transmissionCorridors)) {
      corridorImpacts[id] = {
        lineId: state.simulationAssetId,
        lineName: id,
        fromSubstationId: state.fromSubstationId ?? '',
        toSubstationId: state.toSubstationId ?? '',
        status: state.isTripped ? 'FAILED' : 'ONLINE',
        currentFlowMW: state.currentFlowMW ?? 0,
        capacityMW: state.capacityMW ?? 400,
        loadingPercent: state.loadingPercent ?? 60,
        isOverloaded: state.isOverloaded,
        isTripped: state.isTripped,
      };
      if (state.simulationAssetId) {
        corridorImpacts[state.simulationAssetId] = corridorImpacts[id];
      }
    }

    // 3. Update Power Assets (Substations + Transmission Corridors with Flow, Direction, Particles)
    adapter.setPowerAssets(
      cityAssets.powerAssets,
      corridorImpacts,
      subStatuses,
      syncState,
      selectedEntityId,
      syncState.tick,
    );

    // 4. Update Critical Infrastructure
    adapter.setCriticalInfrastructure(
      cityAssets.criticalInfrastructure,
      geoSimulationImpact?.criticalInfraStatus,
    );

    // 5. Update Service Regions with live blackout states
    if (cityAssets.serviceRegions && cityAssets.serviceRegions.length > 0) {
      adapter.setServiceRegions(
        cityAssets.serviceRegions,
        geoSimulationImpact?.serviceRegionImpacts,
      );
    }

    // 6. Update 3D buildings blackout dimming
    if (cityAssets.buildings && cityAssets.buildings.length > 0) {
      adapter.update3DBuildings(
        cityAssets.buildings,
        geoSimulationImpact,
        cityAssets.serviceRegions,
        cityAssets.criticalInfrastructure,
        true,
      );
    }
  }
}
