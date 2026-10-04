// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Geo-Aware City-Scale Simulation Coordinator (Task 17)
// ═══════════════════════════════════════════════════════════════════════
// Bridges the live simulation engine state (Graph C) and electrical topology (Graph B)
// with the geographic twin (Graph A) into actionable spatial impacts:
//  - Live regional blackout fractions & power deficits
//  - Live transmission corridor loading and thermal stress
//  - Critical civic infrastructure power supply & emergency backup tracking
//  - Spatial mapping of cascade propagation steps
//  - Geographic fault injection resolution
//
// Invariant:
// This coordinator performs non-destructive spatial calculations.
// The authoritative electrical solver remains the sole source of truth for grid physics.
// ═══════════════════════════════════════════════════════════════════════

import type {
  GridTopology,
  SimulationState,
  CascadeRecord,
  CascadeStep,
} from '@/types';
import type {
  GeoTwinState,
  GeoSimulationImpact,
  ServiceRegionSimulationImpact,
  CriticalInfraSimulationStatus,
  TransmissionCorridorImpact,
  GeoCascadeSpatialStep,
  CriticalInfrastructure,
  GeoCoordinate,
} from '@/types/geo';
import { tickToTimestamp } from '@/lib/utils';
import { isValidCoordinate } from './geoCoordinates';
import { ServiceRegionGenerator } from './serviceRegionGenerator';

export class GeoSimulationCoordinator {
  /**
   * Computes the live geo-simulation impact by projecting authoritative electrical
   * simulation state onto the active geographic twin model.
   */
  public static computeGeoSimulationImpact(
    topology: GridTopology,
    geoTwin: GeoTwinState,
    criticalInfra: CriticalInfrastructure[] = [],
    activeCascade?: CascadeRecord | null,
    tick: number = 0,
  ): GeoSimulationImpact {
    const serviceRegionImpacts: Record<string, ServiceRegionSimulationImpact> = {};
    const criticalInfraStatus: Record<string, CriticalInfraSimulationStatus> = {};
    const corridorImpacts: Record<string, TransmissionCorridorImpact> = {};

    let totalCityDemandMW = 0;
    let totalCityServedMW = 0;
    let totalCityUnservedMW = 0;
    let blackoutZoneCount = 0;
    let criticalFacilitiesAtRisk = 0;

    // Build fast lookup maps
    const subMap = new Map(topology.substations.map((s) => [s.id, s]));
    const lineMap = new Map(topology.transmissionLines.map((l) => [l.id, l]));
    const loadMap = new Map(topology.loads.map((l) => [l.id, l]));
    const geoRefByElec = new Map(geoTwin.electricalGeoMappings.map((m) => [m.electricalAssetId, m]));

    // ─── 1. Compute Service Region Impacts ──────────────────────────────
    for (const region of geoTwin.serviceRegions) {
      const sub = subMap.get(region.substationId);
      const isSubFailed = !sub || sub.status === 'FAILED' || sub.status === 'ISOLATED';

      // Find all loads mapped to this region or fed by this substation
      const regionLoads = region.associatedLoadIds
        .map((id) => loadMap.get(id))
        .filter((l): l is import('@/types').Load => l !== undefined);

      let regionServedMW = 0;
      let regionUnservedMW = 0;
      let affectedConsumers = 0;

      for (const load of regionLoads) {
        const loadMW = load.demandMW || load.baseDemandMW || 0;
        if (!isSubFailed && load.connected && load.status !== 'FAILED') {
          regionServedMW += loadMW;
        } else {
          regionUnservedMW += loadMW;
          affectedConsumers += load.consumerCount || 0;
        }
      }

      // If substation failed and no loads were directly tracked, use region's baseline demand
      if (isSubFailed && regionLoads.length === 0) {
        regionUnservedMW = region.totalEstimatedDemandMW || 50;
        affectedConsumers = Math.round(regionUnservedMW * 250);
      }

      const totalRegionDemand = regionServedMW + regionUnservedMW;
      const blackoutFraction =
        totalRegionDemand > 0
          ? Math.max(0, Math.min(1.0, regionUnservedMW / totalRegionDemand))
          : isSubFailed
          ? 1.0
          : 0;

      let blackoutState: ServiceRegionSimulationImpact['blackoutState'] = 'NORMAL';
      if (blackoutFraction >= 0.75 || isSubFailed) {
        blackoutState = 'TOTAL_BLACKOUT';
        blackoutZoneCount++;
      } else if (blackoutFraction > 0.05) {
        blackoutState = 'PARTIAL_CURTAILMENT';
      }

      // Power quality calculation: nominal is 1.0 p.u. voltage, 50 Hz frequency
      const voltPU = sub ? sub.voltagePU : 0;
      const freqDev = sub ? Math.abs(sub.frequencyHz - 50.0) : 5.0;
      const powerQualityIndex = isSubFailed
        ? 0
        : Math.max(0, Math.min(1.0, voltPU * (1 - Math.min(0.5, freqDev / 5.0))));

      // Count critical facilities inside this region
      let criticalInRegionCount = 0;
      for (const infra of criticalInfra) {
        if (
          isValidCoordinate(infra.coordinates) &&
          region.boundaryPolygon &&
          ServiceRegionGenerator.isPointInPolygon(infra.coordinates, region.boundaryPolygon)
        ) {
          if (blackoutFraction > 0.1 || isSubFailed) {
            criticalInRegionCount++;
          }
        }
      }

      serviceRegionImpacts[region.id] = {
        regionId: region.id,
        substationId: region.substationId,
        substationName: region.substationName,
        substationStatus: sub?.status ?? 'FAILED',
        servedDemandMW: Math.round(regionServedMW * 10) / 10,
        unservedDemandMW: Math.round(regionUnservedMW * 10) / 10,
        totalDemandMW: Math.round(totalRegionDemand * 10) / 10,
        blackoutFraction: Math.round(blackoutFraction * 100) / 100,
        blackoutState,
        affectedConsumerCount: affectedConsumers,
        criticalFacilitiesAffectedCount: criticalInRegionCount,
        powerQualityIndex: Math.round(powerQualityIndex * 100) / 100,
      };

      totalCityDemandMW += totalRegionDemand;
      totalCityServedMW += regionServedMW;
      totalCityUnservedMW += regionUnservedMW;
    }

    // ─── 2. Compute Critical Infrastructure Status ───────────────────────
    for (const infra of criticalInfra) {
      // Determine feeding substation or containing service region
      let feedSubId = infra.servedBySubstationId;
      let isPowered = true;
      let activeRegion: import('@/types/geo').EstimatedServiceRegion | undefined;

      // 1. Try finding substation directly in electrical topology by ID
      let sub = feedSubId ? subMap.get(feedSubId) : undefined;

      // 2. If not found by ID, look up in electricalGeoMappings
      if (!sub && feedSubId && geoTwin.electricalGeoMappings) {
        const assoc = geoTwin.electricalGeoMappings.find(
          (m) => m.geoEntityId === feedSubId || m.electricalAssetId === feedSubId,
        );
        if (assoc) {
          sub = subMap.get(assoc.electricalAssetId);
          feedSubId = assoc.electricalAssetId;
        }
      }

      // 3. If not found, check topology substations by geoEntityId or geoRef
      if (!sub && feedSubId) {
        const matchedSub = topology.substations.find(
          (s) => s.geoEntityId === feedSubId || (s.geoRef && s.geoRef.geoEntityId === feedSubId),
        );
        if (matchedSub) {
          sub = matchedSub;
          feedSubId = matchedSub.id;
        }
      }

      // 4. Fallback: check containing service region polygon
      if (!sub) {
        activeRegion = geoTwin.serviceRegions.find(
          (r) =>
            isValidCoordinate(infra.coordinates) &&
            ServiceRegionGenerator.isPointInPolygon(infra.coordinates, r.boundaryPolygon),
        );
        if (activeRegion) {
          feedSubId = activeRegion.substationId;
          sub = subMap.get(activeRegion.substationId);
        }
      }

      // 5. Determine whether it is powered
      if (sub) {
        if (sub.status === 'FAILED' || sub.status === 'ISOLATED') {
          isPowered = false;
        } else if (activeRegion) {
          const regImpact = serviceRegionImpacts[activeRegion.id];
          if (regImpact && regImpact.blackoutFraction > 0.6) {
            isPowered = false;
          }
        }
      } else {
        // If unassociated, facility remains powered unless widespread city blackout (>60%)
        const cityBlackout = totalCityDemandMW > 0 && (totalCityUnservedMW / totalCityDemandMW) > 0.6;
        if (cityBlackout) {
          isPowered = false;
        }
      }

      let powerSupplyState: CriticalInfraSimulationStatus['powerSupplyState'] = 'NORMAL_GRID';
      const backupMW = infra.emergencyBackupGenerationMW || 0;
      const estimatedNeedMW = 10; // Nominal facility demand baseline
      const coveragePercent = Math.min(100, Math.round((backupMW / estimatedNeedMW) * 100));

      if (!isPowered) {
        if (backupMW > 0) {
          powerSupplyState = 'BACKUP_ACTIVE';
        } else {
          powerSupplyState = 'ISOLATED_BLACKOUT';
        }
        criticalFacilitiesAtRisk++;
      }

      criticalInfraStatus[infra.id] = {
        infraId: infra.id,
        infraName: infra.name,
        infraType: infra.infraType,
        priorityTier: infra.priorityTier,
        powerSupplyState,
        backupGenerationMW: backupMW,
        backupCoveragePercent: coveragePercent,
        feedSubstationId: feedSubId,
        coordinates: infra.coordinates,
      };
    }

    // ─── 3. Compute Transmission Corridor Impacts ───────────────────────
    for (const line of topology.transmissionLines) {
      const geoRef = geoRefByElec.get(line.id);
      const isTripped = line.status === 'FAILED';
      const isOverloaded = !isTripped && line.loadingPercent >= 100;

      corridorImpacts[line.id] = {
        lineId: line.id,
        lineName: line.name,
        fromSubstationId: line.fromId,
        toSubstationId: line.toId,
        status: line.status,
        currentFlowMW: Math.round(line.currentFlowMW * 10) / 10,
        capacityMW: line.capacityMW,
        loadingPercent: Math.round(line.loadingPercent * 10) / 10,
        isOverloaded,
        isTripped,
        pathCoordinates: line.pathCoordinates ?? geoRef?.pathCoordinates,
      };
    }

    // ─── 4. Map Cascade Steps to Spatial Events ──────────────────────────
    const latestCascadeSteps: GeoCascadeSpatialStep[] = [];
    if (activeCascade && activeCascade.steps) {
      for (const step of activeCascade.steps) {
        const triggerGeo = geoRefByElec.get(step.triggerAssetId)?.coordinates;
        const affectedGeo = geoRefByElec.get(step.affectedAssetId)?.coordinates;
        const matchingRegion = geoTwin.serviceRegions.find(
          (r) => r.substationId === step.affectedAssetId,
        );

        // Find critical facilities impacted by this step
        const affectedInfra: string[] = [];
        if (matchingRegion) {
          for (const infra of criticalInfra) {
            if (
              isValidCoordinate(infra.coordinates) &&
              ServiceRegionGenerator.isPointInPolygon(infra.coordinates, matchingRegion.boundaryPolygon)
            ) {
              affectedInfra.push(infra.name);
            }
          }
        }

        latestCascadeSteps.push({
          stepIndex: step.stepIndex ?? latestCascadeSteps.length + 1,
          timestamp: step.timestamp ?? tickToTimestamp(step.tick),
          action: step.action ?? step.triggerReason,
          triggerAssetId: step.triggerAssetId,
          triggerAssetName: step.triggerAssetName ?? step.triggerAssetId,
          triggerCoordinates: triggerGeo,
          affectedAssetId: step.affectedAssetId,
          affectedAssetName: step.affectedAssetName ?? step.affectedAssetId,
          affectedCoordinates: affectedGeo,
          affectedRegionId: matchingRegion?.id,
          unservedLoadMW: step.unservedLoadMW ?? step.loadRedistributedMW,
          affectedConsumers: step.affectedConsumers ?? 0,
          criticalFacilitiesAffected: affectedInfra,
        });
      }
    }

    const cityServiceFraction =
      totalCityDemandMW > 0
        ? Math.max(0, Math.min(1.0, totalCityServedMW / totalCityDemandMW))
        : 1.0;

    return {
      tick,
      timestamp: tickToTimestamp(tick),
      totalCityDemandMW: Math.round(totalCityDemandMW * 10) / 10,
      totalCityServedMW: Math.round(totalCityServedMW * 10) / 10,
      totalCityUnservedMW: Math.round(totalCityUnservedMW * 10) / 10,
      cityServiceFraction: Math.round(cityServiceFraction * 1000) / 1000,
      blackoutZoneCount,
      criticalFacilitiesAtRisk,
      serviceRegionImpacts,
      criticalInfraStatus,
      corridorImpacts,
      latestCascadeSteps,
    };
  }

  /**
   * Resolves a clicked geographic entity (or spatial region) into its target
   * electrical asset for simulation fault injection.
   */
  public static resolveGeoFaultTarget(
    geoEntityId: string,
    geoTwin: GeoTwinState,
    topology: GridTopology,
  ): { targetAssetId: string; assetType: 'substation' | 'line' | 'generator' | 'load'; assetName: string } | null {
    // 1. Check direct electrical-geo mappings
    const directRef = geoTwin.electricalGeoMappings.find(
      (m) => m.geoEntityId === geoEntityId || m.electricalAssetId === geoEntityId,
    );
    if (directRef) {
      const elecId = directRef.electricalAssetId;
      const sub = topology.substations.find((s) => s.id === elecId);
      if (sub) return { targetAssetId: sub.id, assetType: 'substation', assetName: sub.name };

      const line = topology.transmissionLines.find((l) => l.id === elecId);
      if (line) return { targetAssetId: line.id, assetType: 'line', assetName: line.name };

      const gen = topology.generators.find((g) => g.id === elecId);
      if (gen) return { targetAssetId: gen.id, assetType: 'generator', assetName: gen.name };

      const load = topology.loads.find((l) => l.id === elecId);
      if (load) return { targetAssetId: load.id, assetType: 'load', assetName: load.name };
    }

    // 2. Check service regions
    const region = geoTwin.serviceRegions.find(
      (r) => r.id === geoEntityId || r.substationId === geoEntityId,
    );
    if (region) {
      const sub = topology.substations.find((s) => s.id === region.substationId);
      if (sub) return { targetAssetId: sub.id, assetType: 'substation', assetName: sub.name };
    }

    // 3. Check directly in topology if geoEntityId matches electrical ID
    const sub = topology.substations.find((s) => s.id === geoEntityId);
    if (sub) return { targetAssetId: sub.id, assetType: 'substation', assetName: sub.name };

    const line = topology.transmissionLines.find((l) => l.id === geoEntityId);
    if (line) return { targetAssetId: line.id, assetType: 'line', assetName: line.name };

    return null;
  }
}
