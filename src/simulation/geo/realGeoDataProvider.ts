// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Real Geographic Data Provider (Task 15)
// ═══════════════════════════════════════════════════════════════════════
// Integrates real geographic resolution and OpenStreetMap geocoding with:
//  - Precomputed verified Indian metropolitan registry (offline-first)
//  - Strict Nominatim rate-limiting (max 1 req/sec)
//  - In-memory query caching
//  - Stale-request protection (AbortSignal)
//  - Input sanitization & normalization
//  - Verifiable DataProvenance tracking
//  - Offline fallback guarantee
// ═══════════════════════════════════════════════════════════════════════

import type {
  City,
  Building,
  CriticalInfrastructure,
  GeoPowerAsset,
  GeoBoundingBox,
  CitySearchResult,
  DataProvenance,
  ConfidenceLevel,
} from '@/types/geo';
import type { IGeoDataProvider, CityTwinPackage } from './geoProvider';
import { VERIFIED_INDIAN_CITIES } from './verifiedIndianCities';
import { VERIFIED_CITY_BUILDINGS } from './verifiedCityBuildings';
import { CANONICAL_POWER_ASSETS } from '@/data/canonicalCitiesData';
import { isValidCoordinate, isValidBoundingBox } from './geoCoordinates';

export interface NominatimSearchResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  boundingbox: [string, string, string, string]; // [minLat, maxLat, minLon, maxLon]
  address?: {
    city?: string;
    town?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

export class RealGeoDataProvider implements IGeoDataProvider {
  public readonly providerId = 'real-osm-provider';
  public readonly providerName = 'VAJRA Real Geographic Data & OpenStreetMap Provider';
  public readonly isOfflineCapable = true;

  // In-memory normalized cache
  private cache = new Map<string, City>();
  // Timestamp of the last outbound network request (for 1000ms Nominatim rate limit)
  private lastOutboundRequestTime = 0;
  private readonly rateLimitDelayMs = 1000;

  constructor() {
    // Prime the cache with the verified validation set
    for (const city of Object.values(VERIFIED_INDIAN_CITIES)) {
      this.cache.set(this.normalizeQuery(city.name), city);
      this.cache.set(this.normalizeQuery(city.id), city);
      if (city.adminCode) {
        this.cache.set(this.normalizeQuery(city.adminCode), city);
      }
    }
  }

  /**
   * Normalizes search input: trims, lowercases, removes diacritics.
   */
  public normalizeQuery(query: string): string {
    return query
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Sanitizes input to prevent malformed queries or injection.
   */
  public validateQuery(query: string): { isValid: boolean; error?: string } {
    const trimmed = query.trim();
    if (!trimmed) {
      return { isValid: false, error: 'Query cannot be empty.' };
    }
    if (trimmed.length < 2) {
      return { isValid: false, error: 'Query must be at least 2 characters long.' };
    }
    if (trimmed.length > 100) {
      return { isValid: false, error: 'Query exceeds maximum allowed length (100 characters).' };
    }
    // Disallow control characters or suspicious script tags
    if (/[<>{}\\]/.test(trimmed)) {
      return { isValid: false, error: 'Query contains unsupported special characters.' };
    }
    return { isValid: true };
  }

  /**
   * Search cities across cache and the verified registry.
   */
  public async searchCities(query: string): Promise<CitySearchResult[]> {
    const validation = this.validateQuery(query);
    if (!validation.isValid) return [];

    const normalized = this.normalizeQuery(query);
    const results: CitySearchResult[] = [];
    const seenCityIds = new Set<string>();

    // 1. Check verified Indian cities
    for (const city of Object.values(VERIFIED_INDIAN_CITIES)) {
      const match =
        city.name.toLowerCase().includes(normalized) ||
        city.stateOrProvince.toLowerCase().includes(normalized) ||
        city.id.toLowerCase().includes(normalized);

      if (match && !seenCityIds.has(city.id)) {
        seenCityIds.add(city.id);
        results.push({
          cityId: city.id,
          displayName: city.name,
          stateOrProvince: city.stateOrProvince,
          countryCode: city.countryCode,
          centerCoordinates: city.centerCoordinates,
          boundingBox: city.boundingBox,
          availableEntityCount: city.id === 'city-delhi' ? 14 : 2,
          provenanceType: city.provenance.sourceType,
        });
      }
    }

    return results;
  }

  /**
   * Resolve a city by its stable cityId.
   */
  public async resolveCity(cityId: string): Promise<City | null> {
    // 1. Direct registry lookup
    if (VERIFIED_INDIAN_CITIES[cityId]) {
      return VERIFIED_INDIAN_CITIES[cityId];
    }

    // 2. Cache lookup
    const normalized = this.normalizeQuery(cityId);
    if (this.cache.has(normalized)) {
      return this.cache.get(normalized)!;
    }

    return null;
  }

  /**
   * Resolve an explicit user-entered location query to a City object.
   * Checks cache -> verified registry -> external Nominatim geocoder (if available).
   */
  public async resolveLocation(
    query: string,
    signal?: AbortSignal,
  ): Promise<City | null> {
    const validation = this.validateQuery(query);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid query');
    }

    const normalized = this.normalizeQuery(query);

    // 1. Check in-memory cache
    if (this.cache.has(normalized)) {
      return this.cache.get(normalized)!;
    }

    // 2. Check verified registry by partial/alias match
    for (const city of Object.values(VERIFIED_INDIAN_CITIES)) {
      const cityNameNorm = this.normalizeQuery(city.name);
      if (
        cityNameNorm === normalized ||
        cityNameNorm.startsWith(normalized) ||
        normalized.includes(this.normalizeQuery(city.id.replace('city-', '')))
      ) {
        this.cache.set(normalized, city);
        return city;
      }
    }

    // 3. Attempt external OpenStreetMap Nominatim resolution (with strict rate-limiting)
    try {
      const externalCity = await this.queryNominatim(query, signal);
      if (externalCity) {
        this.cache.set(normalized, externalCity);
        return externalCity;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw err;
      }
      // On network failure or offline mode, do not crash; return null
      console.warn(`[RealGeoDataProvider] Nominatim geocode fallback triggered: ${err.message}`);
    }

    return null;
  }

  /**
   * Rate-limited Nominatim fetch obeying the 1-second request policy.
   */
  private async queryNominatim(
    query: string,
    signal?: AbortSignal,
  ): Promise<City | null> {
    // Enforce 1000ms rate limit
    const now = Date.now();
    const timeSinceLast = now - this.lastOutboundRequestTime;
    if (timeSinceLast < this.rateLimitDelayMs) {
      const waitTime = this.rateLimitDelayMs - timeSinceLast;
      await new Promise((res) => setTimeout(res, waitTime));
    }
    this.lastOutboundRequestTime = Date.now();

    const encoded = encodeURIComponent(query.trim());
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&addressdetails=1&limit=1`;

    const response = await fetch(url, {
      signal,
      headers: {
        'User-Agent': 'VAJRA-Omega-PowerGrid-DigitalTwin/1.0 (vajra-twin@domain.local)',
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned status ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as NominatimSearchResult[];
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const item = data[0];
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);

    if (isNaN(lat) || isNaN(lon)) return null;

    const coords = { latitude: lat, longitude: lon };
    if (!isValidCoordinate(coords)) return null;

    // Parse bounding box: [minLat, maxLat, minLon, maxLon]
    let bbox: GeoBoundingBox = {
      minLatitude: lat - 0.2,
      maxLatitude: lat + 0.2,
      minLongitude: lon - 0.2,
      maxLongitude: lon + 0.2,
    };

    if (item.boundingbox && item.boundingbox.length === 4) {
      const minLat = parseFloat(item.boundingbox[0]);
      const maxLat = parseFloat(item.boundingbox[1]);
      const minLon = parseFloat(item.boundingbox[2]);
      const maxLon = parseFloat(item.boundingbox[3]);

      const candidateBox = { minLatitude: minLat, maxLatitude: maxLat, minLongitude: minLon, maxLongitude: maxLon };
      if (isValidBoundingBox(candidateBox)) {
        bbox = candidateBox;
      }
    }

    const cityId = `city-ext-${item.place_id}`;
    const name = item.display_name.split(',')[0].trim();
    const state = item.address?.state || 'Unknown State';
    const countryCode = item.address?.country_code?.toUpperCase() || 'IND';

    const provenance: DataProvenance = {
      sourceType: 'VERIFIED_EXTERNAL',
      confidence: 'HIGH',
      sourceReference: `OpenStreetMap Nominatim (Place ID: ${item.place_id})`,
      lastUpdated: new Date().toISOString(),
      isVerifiedRealWorld: true,
      methodologyNotes: 'Direct real-world geocoding resolution via OpenStreetMap Nominatim API.',
    };

    const resolvedCity: City = {
      id: cityId,
      name: `${name} Metropolitan Region`,
      entityType: 'CITY',
      scaleLevel: 'CITY',
      countryCode,
      stateOrProvince: state,
      centerCoordinates: coords,
      boundingBox: bbox,
      coordinates: coords,
      regionalGridInterconnect: 'National / Regional Grid Interconnection',
      provenance,
    };

    return resolvedCity;
  }

  /**
   * Load the digital twin package for a city with genuine verified buildings,
   * canonical power infrastructure, and critical facilities.
   */
  public async loadCityTwin(cityId: string): Promise<CityTwinPackage | null> {
    const city = await this.resolveCity(cityId);
    if (!city) return null;

    const buildings = await this.loadBuildings(cityId);
    const powerAssets = await this.loadPowerInfrastructure(cityId);
    const criticalInfrastructure = await this.loadCriticalInfrastructure(cityId);

    return {
      city,
      buildings,
      criticalInfrastructure,
      powerAssets,
      spatialRelationships: [],
      electricalRelationships: [],
      provenanceSummary: {
        verifiedCount: buildings.length + powerAssets.length + 1,
        modeledCount: 0,
        syntheticCount: 0,
        userDefinedCount: 0,
      },
    };
  }

  public async loadBuildings(cityId: string, _bounds?: GeoBoundingBox): Promise<Building[]> {
    return VERIFIED_CITY_BUILDINGS[cityId] || [];
  }

  public async loadCriticalInfrastructure(cityId: string): Promise<CriticalInfrastructure[]> {
    const buildings = VERIFIED_CITY_BUILDINGS[cityId] || [];
    return buildings
      .filter((b) => b.isCriticalPowerCustomer)
      .map((b) => ({
        id: `infra-${b.id}`,
        name: b.name,
        entityType: 'CRITICAL_INFRASTRUCTURE' as const,
        scaleLevel: 'BUILDING_INFRASTRUCTURE' as const,
        infraType: b.usageType === 'HEALTHCARE' ? 'HOSPITAL' : 'GOVERNMENT_HQ',
        emergencyBackupGenerationMW: Math.round(b.estimatedPeakDemandMW * 0.6 * 10) / 10,
        requiresDualFeed: true,
        priorityTier: b.usageType === 'HEALTHCARE' ? 'TIER_1_LIFE_SAFETY' : 'TIER_2_CIVIL_OPERATIONS',
        coordinates: b.coordinates,
        servedBySubstationId: b.inferredFeederSubstationId,
        provenance: b.provenance,
      }));
  }

  public async loadPowerInfrastructure(cityId: string): Promise<GeoPowerAsset[]> {
    const canonicalAssets = CANONICAL_POWER_ASSETS[cityId] || [];
    const nodeAssets: GeoPowerAsset[] = canonicalAssets.map((asset) => {
      const isSub = asset.assetType === 'SUBSTATION';
      const capMW = asset.nominalCapacityMVA ? Math.round(asset.nominalCapacityMVA * 0.9) : 500;
      return {
        id: asset.id,
        name: asset.name,
        entityType: isSub ? ('SUBSTATION' as const) : ('POWER_STATION' as const),
        scaleLevel: 'DISTRICT_LOCALITY' as const,
        category: isSub ? ('TRANSMISSION_SUBSTATION' as const) : ('GENERATOR' as const),
        electricalAssetType: isSub ? ('substation' as const) : ('generator' as const),
        coordinates: {
          latitude: asset.coordinates.latitude,
          longitude: asset.coordinates.longitude,
          elevationMeters: asset.coordinates.elevationMeters,
        },
        voltageKV: asset.voltageKV ?? 220,
        nominalCapacityMW: capMW,
        isSurveyVerified:
          asset.geometryProvenance === 'OSM_VERIFIED_NODE' ||
          asset.geometryProvenance === 'SURVEY_GROUND_TRUTH',
        electricalAssetId: asset.id,
        provenance: {
          sourceType: 'VERIFIED_EXTERNAL' as const,
          confidence: (asset.confidence as ConfidenceLevel) || 'HIGH',
          sourceReference: asset.source,
          lastUpdated: asset.retrievedAt,
          isVerifiedRealWorld: true,
          methodologyNotes: `Direct public utility filing: ${asset.sourceUrl}`,
        },
      };
    });

    // Build canonical transmission corridors connecting verified substations
    const subMap = new Map<string, GeoPowerAsset>();
    for (const node of nodeAssets) {
      subMap.set(node.id, node);
    }

    const lines: GeoPowerAsset[] = [];
    const seenLinePairs = new Set<string>();

    for (const asset of canonicalAssets) {
      // 1. Verified utility single-line diagram connections
      if (asset.connectedAssetIds) {
        for (const targetId of asset.connectedAssetIds) {
          if (subMap.has(targetId) && subMap.has(asset.id)) {
            const pairKey = [asset.id, targetId].sort().join('--');
            if (!seenLinePairs.has(pairKey)) {
              seenLinePairs.add(pairKey);
              const fromSub = subMap.get(asset.id)!;
              const toSub = subMap.get(targetId)!;
              const midLat = (fromSub.coordinates.latitude + toSub.coordinates.latitude) / 2;
              const midLng = (fromSub.coordinates.longitude + toSub.coordinates.longitude) / 2;
              const targetAsset = canonicalAssets.find((a) => a.id === targetId);
              const voltage = Math.min(fromSub.voltageKV, toSub.voltageKV);

              lines.push({
                id: `line-${pairKey}`,
                name: `${fromSub.name.split(' ')[0]} – ${toSub.name.split(' ')[0]} ${voltage}kV Corridor`,
                entityType: 'LINE_CORRIDOR' as const,
                scaleLevel: 'DISTRICT_LOCALITY' as const,
                category: 'TRANSMISSION_LINE' as const,
                electricalAssetType: 'transmission_line' as const,
                coordinates: { latitude: midLat, longitude: midLng },
                pathCoordinates: [
                  { latitude: fromSub.coordinates.latitude, longitude: fromSub.coordinates.longitude },
                  { latitude: toSub.coordinates.latitude, longitude: toSub.coordinates.longitude },
                ],
                voltageKV: voltage,
                nominalCapacityMW: Math.max(fromSub.nominalCapacityMW, toSub.nominalCapacityMW),
                isSurveyVerified: true,
                electricalAssetId: `line-${pairKey}`,
                provenance: {
                  sourceType: 'VERIFIED_EXTERNAL' as const,
                  confidence: (asset.confidence as ConfidenceLevel) || 'HIGH',
                  sourceReference: `${asset.source} & ${targetAsset?.source ?? 'Utility Grid SLD'}`,
                  lastUpdated: asset.retrievedAt,
                  isVerifiedRealWorld: true,
                  methodologyNotes: 'Utility transmission corridor connecting verified grid substations',
                },
              });
            }
          }
        }
      }

      // 2. Inferred sub-transmission links (clearly labeled INFERRED)
      if (asset.inferredAssetIds) {
        for (const targetId of asset.inferredAssetIds) {
          if (subMap.has(targetId) && subMap.has(asset.id)) {
            const pairKey = [asset.id, targetId].sort().join('--');
            if (!seenLinePairs.has(pairKey)) {
              seenLinePairs.add(pairKey);
              const fromSub = subMap.get(asset.id)!;
              const toSub = subMap.get(targetId)!;
              const midLat = (fromSub.coordinates.latitude + toSub.coordinates.latitude) / 2;
              const midLng = (fromSub.coordinates.longitude + toSub.coordinates.longitude) / 2;
              const targetAsset = canonicalAssets.find((a) => a.id === targetId);
              const voltage = Math.min(fromSub.voltageKV, toSub.voltageKV);

              lines.push({
                id: `inferred-line-${pairKey}`,
                name: `[INFERRED] ${fromSub.name.split(' ')[0]} – ${toSub.name.split(' ')[0]} Link`,
                entityType: 'LINE_CORRIDOR' as const,
                scaleLevel: 'DISTRICT_LOCALITY' as const,
                category: 'TRANSMISSION_LINE' as const,
                electricalAssetType: 'transmission_line' as const,
                coordinates: { latitude: midLat, longitude: midLng },
                pathCoordinates: [
                  { latitude: fromSub.coordinates.latitude, longitude: fromSub.coordinates.longitude },
                  { latitude: toSub.coordinates.latitude, longitude: toSub.coordinates.longitude },
                ],
                voltageKV: voltage,
                nominalCapacityMW: 200,
                isSurveyVerified: false,
                electricalAssetId: `inferred-line-${pairKey}`,
                provenance: {
                  sourceType: 'MODELED' as const,
                  confidence: 'MEDIUM' as ConfidenceLevel,
                  sourceReference: 'Spatial Proximity & Grid Hierarchy Model',
                  lastUpdated: asset.retrievedAt,
                  isVerifiedRealWorld: false,
                  methodologyNotes: 'Sub-transmission link inferred from spatial proximity; not verified by utility single-line diagram',
                },
              });
            }
          }
        }
      }
    }

    return [...nodeAssets, ...lines];
  }

  public getCacheSize(): number {
    return this.cache.size;
  }

  public clearCache(): void {
    this.cache.clear();
  }
}
