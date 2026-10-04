// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Voronoi Service-Region Inference Engine (Task 16)
// ═══════════════════════════════════════════════════════════════════════
// Generates deterministic spatial proximity regions around substations.
//
// MANDATORY SCIENTIFIC INVARIANT:
// Nearest-neighbor distance does NOT prove electrical connectivity.
// Voronoi allocation does NOT prove feeder topology.
// The resulting polygon represents "geographically nearest-substation region",
// NOT "verified electrical feeder territory".
//
// All regions have isVerifiedFeederTerritory: false and explicit disclaimers.
// ═══════════════════════════════════════════════════════════════════════

import type {
  GeoCoordinate,
  GeoBoundingBox,
  EstimatedServiceRegion,
  DataProvenance,
} from '@/types/geo';
import type { Substation, Load } from '@/types';
import { isValidCoordinate, isValidBoundingBox } from './geoCoordinates';

export interface VoronoiSubstationInput {
  id: string;
  name: string;
  coordinates: GeoCoordinate;
  voltageKV?: number;
  capacityMW?: number;
}

export interface VoronoiLoadInput {
  id: string;
  name?: string;
  coordinates: GeoCoordinate;
  demandMW: number;
}

const EPSILON = 1e-9;
const METERS_PER_DEGREE_LAT = 110540;

/**
 * Deterministic Voronoi Service Region Generator.
 * Uses Sutherland-Hodgman convex polygon clipping against half-planes formed by
 * perpendicular bisectors between substation pairs in metric projection.
 */
export class ServiceRegionGenerator {
  public static readonly DISCLAIMER =
    'Estimated nearest-substation spatial proximity region. Does NOT represent verified electrical feeder boundary.';

  /**
   * Generates deterministic Voronoi service regions for substations within a bounded study area.
   */
  public static generateRegions(
    substations: (VoronoiSubstationInput | Substation)[],
    studyBoundingBox: GeoBoundingBox,
    loads: (VoronoiLoadInput | Load)[] = [],
  ): EstimatedServiceRegion[] {
    if (!isValidBoundingBox(studyBoundingBox)) {
      throw new Error('Invalid study bounding box provided for Voronoi generation');
    }

    // 1. Sanitize, filter, and extract valid substation coordinates
    const validSubs: VoronoiSubstationInput[] = [];
    for (const sub of substations) {
      let coords: GeoCoordinate | undefined;
      let name: string = sub.name;
      let id: string = sub.id;

      if ('coordinates' in sub && isValidCoordinate((sub as VoronoiSubstationInput).coordinates)) {
        coords = (sub as VoronoiSubstationInput).coordinates;
      } else if ('geoRef' in sub && sub.geoRef && isValidCoordinate(sub.geoRef.coordinates)) {
        coords = sub.geoRef.coordinates;
      }

      if (coords && isValidCoordinate(coords)) {
        validSubs.push({
          id,
          name,
          coordinates: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            elevationMeters: coords.elevationMeters,
          },
        });
      }
    }

    // 2. Deterministic sort by ID to guarantee identical output regardless of input ordering
    validSubs.sort((a, b) => a.id.localeCompare(b.id));

    // Handle empty case
    if (validSubs.length === 0) {
      return [];
    }

    // 3. Remove duplicate coordinates (keep first deterministically)
    const uniqueSubs: VoronoiSubstationInput[] = [];
    const seenCoordinates = new Set<string>();

    for (const s of validSubs) {
      // Keyed to 6 decimal places (~0.1m precision)
      const coordKey = `${s.coordinates.latitude.toFixed(6)}_${s.coordinates.longitude.toFixed(6)}`;
      if (!seenCoordinates.has(coordKey)) {
        seenCoordinates.add(coordKey);
        uniqueSubs.push(s);
      }
    }

    // Bounding box initial polygon (clockwise)
    const bboxPolygon: GeoCoordinate[] = [
      { latitude: studyBoundingBox.minLatitude, longitude: studyBoundingBox.minLongitude },
      { latitude: studyBoundingBox.maxLatitude, longitude: studyBoundingBox.minLongitude },
      { latitude: studyBoundingBox.maxLatitude, longitude: studyBoundingBox.maxLongitude },
      { latitude: studyBoundingBox.minLatitude, longitude: studyBoundingBox.maxLongitude },
    ];

    // Reference center for local metric projection
    const midLat = (studyBoundingBox.minLatitude + studyBoundingBox.maxLatitude) / 2;
    const midLon = (studyBoundingBox.minLongitude + studyBoundingBox.maxLongitude) / 2;
    const metersPerDegreeLon = 111320 * Math.cos((midLat * Math.PI) / 180);

    const projectToMetric = (coord: GeoCoordinate) => ({
      x: (coord.longitude - midLon) * metersPerDegreeLon,
      y: (coord.latitude - midLat) * METERS_PER_DEGREE_LAT,
    });

    const unprojectFromMetric = (x: number, y: number): GeoCoordinate => ({
      latitude: midLat + y / METERS_PER_DEGREE_LAT,
      longitude: midLon + x / metersPerDegreeLon,
    });

    // 4. Handle Single Substation case: Entire bounding box belongs to this substation
    if (uniqueSubs.length === 1) {
      const soleSub = uniqueSubs[0];
      const area = this.computePolygonAreaSqKm(bboxPolygon, projectToMetric);
      const associatedLoads = this.filterLoadsInPolygon(loads, bboxPolygon);
      const totalDemand = associatedLoads.reduce((sum, l) => sum + (l.demandMW || 0), 0);

      return [
        {
          id: `service-region-${soleSub.id}`,
          substationId: soleSub.id,
          substationName: soleSub.name,
          centerCoordinates: soleSub.coordinates,
          boundaryPolygon: bboxPolygon,
          areaSqKm: Math.round(area * 100) / 100,
          associatedLoadIds: associatedLoads.map((l) => l.id),
          totalEstimatedDemandMW: Math.round(totalDemand * 10) / 10,
          determinationMethod: 'BOUNDED_PERIMETER',
          isVerifiedFeederTerritory: false,
          provenance: this.createProvenance(soleSub.id),
          disclaimer: ServiceRegionGenerator.DISCLAIMER,
        },
      ];
    }

    // 5. Multiple substations: Compute Voronoi cells via half-plane intersection
    const regions: EstimatedServiceRegion[] = [];
    const metricSubs = uniqueSubs.map((s) => ({
      ...s,
      metricPos: projectToMetric(s.coordinates),
    }));

    for (let i = 0; i < metricSubs.length; i++) {
      const targetSub = metricSubs[i];
      let currentPolygon = [...bboxPolygon];

      for (let j = 0; j < metricSubs.length; j++) {
        if (i === j) continue;
        const otherSub = metricSubs[j];

        // Perpendicular bisector half-plane equation:
        // A*x + B*y + C <= 0
        // A = 2 * (x_j - x_i)
        // B = 2 * (y_j - y_i)
        // C = (x_i^2 + y_i^2) - (x_j^2 + y_j^2)
        const A = 2 * (otherSub.metricPos.x - targetSub.metricPos.x);
        const B = 2 * (otherSub.metricPos.y - targetSub.metricPos.y);
        const C =
          targetSub.metricPos.x * targetSub.metricPos.x +
          targetSub.metricPos.y * targetSub.metricPos.y -
          (otherSub.metricPos.x * otherSub.metricPos.x + otherSub.metricPos.y * otherSub.metricPos.y);

        currentPolygon = this.clipPolygonWithHalfPlane(
          currentPolygon,
          A,
          B,
          C,
          projectToMetric,
          unprojectFromMetric,
        );

        if (currentPolygon.length < 3) break;
      }

      if (currentPolygon.length >= 3) {
        const area = this.computePolygonAreaSqKm(currentPolygon, projectToMetric);
        const associatedLoads = this.filterLoadsInPolygon(loads, currentPolygon);
        const totalDemand = associatedLoads.reduce((sum, l) => sum + (l.demandMW || 0), 0);

        regions.push({
          id: `service-region-${targetSub.id}`,
          substationId: targetSub.id,
          substationName: targetSub.name,
          centerCoordinates: targetSub.coordinates,
          boundaryPolygon: currentPolygon,
          areaSqKm: Math.round(area * 100) / 100,
          associatedLoadIds: associatedLoads.map((l) => l.id),
          totalEstimatedDemandMW: Math.round(totalDemand * 10) / 10,
          determinationMethod: 'VORONOI_PROXIMITY',
          isVerifiedFeederTerritory: false,
          provenance: this.createProvenance(targetSub.id),
          disclaimer: ServiceRegionGenerator.DISCLAIMER,
        });
      }
    }

    return regions;
  }

  /**
   * Clips a convex polygon against a linear half-plane Ax + By + C <= 0 using Sutherland-Hodgman.
   */
  private static clipPolygonWithHalfPlane(
    polygon: GeoCoordinate[],
    A: number,
    B: number,
    C: number,
    project: (coord: GeoCoordinate) => { x: number; y: number },
    unproject: (x: number, y: number) => GeoCoordinate,
  ): GeoCoordinate[] {
    const clipped: GeoCoordinate[] = [];
    const len = polygon.length;
    if (len === 0) return clipped;

    for (let k = 0; k < len; k++) {
      const curCoord = polygon[k];
      const prevCoord = polygon[(k + len - 1) % len];

      const curPos = project(curCoord);
      const prevPos = project(prevCoord);

      const curDist = A * curPos.x + B * curPos.y + C;
      const prevDist = A * prevPos.x + B * prevPos.y + C;

      const curInside = curDist <= EPSILON;
      const prevInside = prevDist <= EPSILON;

      if (curInside) {
        if (!prevInside) {
          // Entering half-plane: compute intersection
          const denom = prevDist - curDist;
          const t = Math.abs(denom) > EPSILON ? prevDist / denom : 0.5;
          const ix = prevPos.x + t * (curPos.x - prevPos.x);
          const iy = prevPos.y + t * (curPos.y - prevPos.y);
          clipped.push(unproject(ix, iy));
        }
        clipped.push(curCoord);
      } else if (prevInside) {
        // Leaving half-plane: compute intersection
        const denom = prevDist - curDist;
        const t = Math.abs(denom) > EPSILON ? prevDist / denom : 0.5;
        const ix = prevPos.x + t * (curPos.x - prevPos.x);
        const iy = prevPos.y + t * (curPos.y - prevPos.y);
        clipped.push(unproject(ix, iy));
      }
    }

    return clipped;
  }

  /**
   * Computes polygon surface area in square kilometers using Shoelace formula on local metric projection.
   */
  public static computePolygonAreaSqKm(
    polygon: GeoCoordinate[],
    project: (coord: GeoCoordinate) => { x: number; y: number },
  ): number {
    if (polygon.length < 3) return 0;
    let sum = 0;
    const len = polygon.length;

    for (let i = 0; i < len; i++) {
      const p1 = project(polygon[i]);
      const p2 = project(polygon[(i + 1) % len]);
      sum += p1.x * p2.y - p2.x * p1.y;
    }

    const areaSqMeters = Math.abs(sum) / 2;
    return areaSqMeters / 1_000_000;
  }

  /**
   * Point in polygon test using ray-casting algorithm.
   */
  public static isPointInPolygon(point: GeoCoordinate, polygon: GeoCoordinate[]): boolean {
    if (polygon.length < 3) return false;
    let inside = false;
    const x = point.longitude;
    const y = point.latitude;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].longitude;
      const yi = polygon[i].latitude;
      const xj = polygon[j].longitude;
      const yj = polygon[j].latitude;

      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }

    return inside;
  }

  /**
   * Filters loads whose coordinate falls within the polygon boundary.
   */
  private static filterLoadsInPolygon(
    loads: (VoronoiLoadInput | Load)[],
    polygon: GeoCoordinate[],
  ): (VoronoiLoadInput | Load)[] {
    return loads.filter((load) => {
      let coords: GeoCoordinate | undefined;
      if ('coordinates' in load && isValidCoordinate(load.coordinates)) {
        coords = load.coordinates;
      } else if ('geoRef' in load && load.geoRef && isValidCoordinate(load.geoRef.coordinates)) {
        coords = load.geoRef.coordinates;
      }

      if (!coords) return false;
      return this.isPointInPolygon(coords, polygon);
    });
  }

  private static createProvenance(substationId: string): DataProvenance {
    return {
      sourceType: 'MODELED',
      confidence: 'MEDIUM',
      sourceReference: `Voronoi Spatial Allocation for Substation ${substationId}`,
      lastUpdated: new Date().toISOString(),
      isVerifiedRealWorld: false,
      methodologyNotes:
        'Deterministic Voronoi tessellation bounded by active study area. Represents spatial proximity only, not physical feeder connectivity.',
    };
  }
}
