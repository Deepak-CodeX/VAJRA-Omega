// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Geographic Coordinates & Spatial Utilities
// ═══════════════════════════════════════════════════════════════════════
// Standard: WGS84 (EPSG:4326) Decimal Degrees.
// Explicitly isolated from screen pixel coordinates and simulation grid indices.
// ═══════════════════════════════════════════════════════════════════════

import type { GeoCoordinate, GeoBoundingBox } from '@/types/geo';

const EARTH_RADIUS_METERS = 6371000;

/**
 * Validates whether a coordinate conforms to standard WGS84 latitude and longitude bounds.
 * Latitude must be within [-90.0, 90.0]
 * Longitude must be within [-180.0, 180.0]
 * Optional elevation must be finite and within plausible terrestrial bounds [-500m to 15000m]
 */
export function isValidCoordinate(coord: unknown): coord is GeoCoordinate {
  if (!coord || typeof coord !== 'object') return false;
  const c = coord as Partial<GeoCoordinate>;

  if (typeof c.latitude !== 'number' || isNaN(c.latitude)) return false;
  if (typeof c.longitude !== 'number' || isNaN(c.longitude)) return false;

  if (c.latitude < -90.0 || c.latitude > 90.0) return false;
  if (c.longitude < -180.0 || c.longitude > 180.0) return false;

  if (c.elevationMeters !== undefined) {
    if (typeof c.elevationMeters !== 'number' || isNaN(c.elevationMeters)) return false;
    if (c.elevationMeters < -500 || c.elevationMeters > 15000) return false;
  }

  return true;
}

/**
 * Strict validator that throws descriptive Error if invalid.
 */
export function assertValidCoordinate(coord: unknown, context: string = 'Coordinate'): asserts coord is GeoCoordinate {
  if (!isValidCoordinate(coord)) {
    const c = coord as Partial<GeoCoordinate> | null | undefined;
    throw new Error(
      `Invalid ${context}: lat=${c?.latitude}, lon=${c?.longitude}. Latitude must be between -90 and 90, Longitude between -180 and 180.`,
    );
  }
}

/**
 * Validates a geographic bounding box.
 */
export function isValidBoundingBox(box: unknown): box is GeoBoundingBox {
  if (!box || typeof box !== 'object') return false;
  const b = box as Partial<GeoBoundingBox>;

  if (
    typeof b.minLatitude !== 'number' ||
    typeof b.maxLatitude !== 'number' ||
    typeof b.minLongitude !== 'number' ||
    typeof b.maxLongitude !== 'number'
  ) {
    return false;
  }

  if (b.minLatitude < -90 || b.maxLatitude > 90 || b.minLatitude > b.maxLatitude) return false;
  if (b.minLongitude < -180 || b.maxLongitude > 180 || b.minLongitude > b.maxLongitude) return false;

  return true;
}

/**
 * Computes exact great-circle distance between two WGS84 coordinates in meters
 * using the Haversine formula.
 */
export function computeGeoDistanceMeters(coordA: GeoCoordinate, coordB: GeoCoordinate): number {
  assertValidCoordinate(coordA, 'coordA');
  assertValidCoordinate(coordB, 'coordB');

  const lat1Rad = (coordA.latitude * Math.PI) / 180;
  const lat2Rad = (coordB.latitude * Math.PI) / 180;
  const deltaLat = ((coordB.latitude - coordA.latitude) * Math.PI) / 180;
  const deltaLon = ((coordB.longitude - coordA.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Checks whether a coordinate lies within a geographic bounding box.
 */
export function isCoordinateInBoundingBox(coord: GeoCoordinate, box: GeoBoundingBox): boolean {
  assertValidCoordinate(coord, 'coord');
  return (
    coord.latitude >= box.minLatitude &&
    coord.latitude <= box.maxLatitude &&
    coord.longitude >= box.minLongitude &&
    coord.longitude <= box.maxLongitude
  );
}

/**
 * Generates a bounding box around a center coordinate with a given radius in kilometers.
 */
export function createBoundingBoxFromCenter(center: GeoCoordinate, radiusKm: number): GeoBoundingBox {
  assertValidCoordinate(center, 'center');
  if (radiusKm <= 0) throw new Error('radiusKm must be positive');

  // Earth radius ~6371km. 1 deg latitude ~ 111km
  const latDelta = radiusKm / 111.32;
  const lonDelta = radiusKm / (111.32 * Math.cos((center.latitude * Math.PI) / 180));

  return {
    minLatitude: Math.max(-90, center.latitude - latDelta),
    maxLatitude: Math.min(90, center.latitude + latDelta),
    minLongitude: Math.max(-180, center.longitude - lonDelta),
    maxLongitude: Math.min(180, center.longitude + lonDelta),
  };
}
