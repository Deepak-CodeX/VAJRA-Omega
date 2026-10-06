// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Spatial Load Clustering Engine (Task 16)
// ═══════════════════════════════════════════════════════════════════════
// Groups nearby electrical/geographic loads into explainable spatial zones.
//
// Invariant:
// Proximity clustering is an analytical grouping mechanism.
// It does NOT alter electrical circuit topology, transformer loading,
// or substation feeder assignments in the authoritative simulation state.
// ═══════════════════════════════════════════════════════════════════════

import type {
  GeoCoordinate,
  SpatialLoadCluster,
  SpatialLoadZone,
  ConfidenceLevel,
  MappingType,
} from '@/types/geo';
import type { Load } from '@/types';
import {
  computeGeoDistanceMeters,
  isValidCoordinate,
} from './geoCoordinates';

export interface ClusterableLoad {
  id: string;
  name: string;
  coordinates: GeoCoordinate;
  demandMW: number;
  category: 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL' | 'CRITICAL' | 'EV' | 'MIXED';
  isCritical: boolean;
  assignedSubstationId?: string;
}

export class LoadClusterer {
  public static readonly DEFAULT_CLUSTER_RADIUS_METERS = 2500; // 2.5 km locality threshold

  /**
   * Transforms heterogeneous Load or building inputs into standardized ClusterableLoad items.
   */
  public static extractClusterableLoads(
    loads: Load[],
    geoCoordinatesMap?: Map<string, GeoCoordinate>,
  ): ClusterableLoad[] {
    const clusterables: ClusterableLoad[] = [];

    for (const load of loads) {
      let coords: GeoCoordinate | undefined;

      if (load.geoRef && isValidCoordinate(load.geoRef.coordinates)) {
        coords = load.geoRef.coordinates;
      } else if (geoCoordinatesMap && geoCoordinatesMap.has(load.id)) {
        coords = geoCoordinatesMap.get(load.id);
      }

      if (coords && isValidCoordinate(coords)) {
        // Map LoadType to SpatialLoadCluster category
        let category: ClusterableLoad['category'] = 'MIXED';
        if (load.type === 'residential') category = 'RESIDENTIAL';
        else if (load.type === 'commercial') category = 'COMMERCIAL';
        else if (load.type === 'industrial') category = 'INDUSTRIAL';
        else if (load.type === 'ev_charging') category = 'EV';

        const isCritical = load.priority === 'critical' || load.name.toLowerCase().includes('hospital') || load.name.toLowerCase().includes('water');
        if (isCritical) {
          category = 'CRITICAL';
        }

        clusterables.push({
          id: load.id,
          name: load.name,
          coordinates: coords,
          demandMW: load.demandMW || load.baseDemandMW || 0,
          category,
          isCritical,
          assignedSubstationId: load.connectedTo,
        });
      }
    }

    return clusterables;
  }

  /**
   * Deterministic greedy radius-based spatial clustering.
   * Sorts candidate loads by stable ID, iteratively binds unvisited neighbors within threshold radius.
   */
  public static clusterLoads(
    loads: ClusterableLoad[],
    maxRadiusMeters: number = LoadClusterer.DEFAULT_CLUSTER_RADIUS_METERS,
  ): SpatialLoadCluster[] {
    if (loads.length === 0) {
      return [];
    }

    // 1. Deterministic sort by ID to ensure repeatable cluster formation
    const sortedLoads = [...loads].sort((a, b) => a.id.localeCompare(b.id));

    // Handle single load case
    if (sortedLoads.length === 1) {
      const sole = sortedLoads[0];
      return [
        {
          id: `cluster-${sole.id}`,
          name: `Spatial Cluster ${sole.name}`,
          centroid: sole.coordinates,
          radiusMeters: 0,
          totalDemandMW: Math.round(sole.demandMW * 10) / 10,
          loadCategory: sole.category,
          containsCriticalLoad: sole.isCritical,
          memberLoadIds: [sole.id],
          assignedSubstationId: sole.assignedSubstationId,
          clusteringMetric: `Single load cluster for ${sole.id}`,
        },
      ];
    }

    const clusters: SpatialLoadCluster[] = [];
    const visited = new Set<string>();

    for (let i = 0; i < sortedLoads.length; i++) {
      const seed = sortedLoads[i];
      if (visited.has(seed.id)) continue;

      const clusterMembers: ClusterableLoad[] = [seed];
      visited.add(seed.id);

      // Find all unvisited loads within maxRadiusMeters of seed
      for (let j = i + 1; j < sortedLoads.length; j++) {
        const candidate = sortedLoads[j];
        if (visited.has(candidate.id)) continue;

        const dist = computeGeoDistanceMeters(seed.coordinates, candidate.coordinates);
        if (dist <= maxRadiusMeters) {
          clusterMembers.push(candidate);
          visited.add(candidate.id);
        }
      }

      // Compute weighted or arithmetic centroid
      let sumLat = 0;
      let sumLon = 0;
      let totalMW = 0;
      let hasCritical = false;
      const categories = new Set<string>();

      for (const member of clusterMembers) {
        sumLat += member.coordinates.latitude;
        sumLon += member.coordinates.longitude;
        totalMW += member.demandMW;
        categories.add(member.category);
        if (member.isCritical) hasCritical = true;
      }

      const count = clusterMembers.length;
      const centroid: GeoCoordinate = {
        latitude: sumLat / count,
        longitude: sumLon / count,
      };

      // Compute max distance from centroid to any member for actual radius
      let maxDistMeters = 0;
      for (const member of clusterMembers) {
        const d = computeGeoDistanceMeters(centroid, member.coordinates);
        if (d > maxDistMeters) maxDistMeters = d;
      }

      // Determine category: if all same, use that category; if hasCritical, CRITICAL; else MIXED
      let clusterCategory: SpatialLoadCluster['loadCategory'] = 'MIXED';
      if (hasCritical) {
        clusterCategory = 'CRITICAL';
      } else if (categories.size === 1) {
        clusterCategory = clusterMembers[0].category;
      }

      // Pick dominant substation
      const subCounts = new Map<string, number>();
      for (const m of clusterMembers) {
        if (m.assignedSubstationId) {
          subCounts.set(m.assignedSubstationId, (subCounts.get(m.assignedSubstationId) || 0) + 1);
        }
      }
      let dominantSub: string | undefined;
      let maxSubCount = 0;
      for (const [subId, cnt] of subCounts.entries()) {
        if (cnt > maxSubCount) {
          dominantSub = subId;
          maxSubCount = cnt;
        }
      }

      clusters.push({
        id: `cluster-${seed.id}-${clusters.length + 1}`,
        name: `Load Cluster [${clusterCategory}] (${count} loads)`,
        centroid,
        radiusMeters: Math.round(maxDistMeters),
        totalDemandMW: Math.round(totalMW * 10) / 10,
        loadCategory: clusterCategory,
        containsCriticalLoad: hasCritical,
        memberLoadIds: clusterMembers.map((m) => m.id),
        assignedSubstationId: dominantSub,
        clusteringMetric: `Deterministic spatial proximity (radius <= ${maxRadiusMeters}m, actual radius: ${Math.round(maxDistMeters)}m)`,
      });
    }

    return clusters;
  }

  /**
   * Generates formal SpatialLoadZone representations for higher-level city/district planning.
   */
  public static createLoadZonesFromClusters(
    clusters: SpatialLoadCluster[],
    cityId: string,
  ): SpatialLoadZone[] {
    return clusters.map((c) => {
      // Generate geodetic boundary polygon ring around cluster centroid
      const radiusM = Math.max(1200, c.radiusMeters || 1500);
      const points = 16;
      const boundaryPolygon: GeoCoordinate[] = [];
      const latRad = (c.centroid.latitude * Math.PI) / 180;
      const earthRadius = 6371000;
      const latDelta = (radiusM / earthRadius) * (180 / Math.PI);
      const lngDelta = (radiusM / (earthRadius * Math.cos(latRad))) * (180 / Math.PI);

      for (let i = 0; i < points; i++) {
        const angle = (i * 2 * Math.PI) / points;
        boundaryPolygon.push({
          latitude: c.centroid.latitude + latDelta * Math.sin(angle),
          longitude: c.centroid.longitude + lngDelta * Math.cos(angle),
        });
      }
      boundaryPolygon.push(boundaryPolygon[0]); // Close ring

      return {
        id: `zone-${c.id}`,
        name: c.name,
        entityType: 'ZONE',
        scaleLevel: 'DISTRICT_LOCALITY',
        coordinates: c.centroid,
        boundaryPolygon,
        parentId: cityId,
        associatedElectricalAssetIds: c.memberLoadIds,
        associatedSubstationId: c.assignedSubstationId,
        estimatedDemandMW: c.totalDemandMW,
        criticality: c.containsCriticalLoad ? 'CRITICAL' : 'MEDIUM',
        loadCategory: c.loadCategory,
        mappingType: 'SPATIAL_INFERENCE' as MappingType,
        confidence: 'MEDIUM' as ConfidenceLevel,
        provenance: {
          sourceType: 'MODELED',
          confidence: 'MEDIUM',
          sourceReference: `Deterministic Spatial Clustering for ${cityId}`,
          lastUpdated: new Date().toISOString(),
          isVerifiedRealWorld: false,
          methodologyNotes: c.clusteringMetric,
        },
      };
    });
  }
}
