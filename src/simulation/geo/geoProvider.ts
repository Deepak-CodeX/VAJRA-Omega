// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Geographic Data Provider Abstraction & City Resolver
// ═══════════════════════════════════════════════════════════════════════
// Decouples city search, geo data fetching, and twin assembly from any
// specific external vendor, mapping service, or hardcoded cities.
// ═══════════════════════════════════════════════════════════════════════

import type {
  City,
  Building,
  CriticalInfrastructure,
  GeoPowerAsset,
  GeoRelationship,
  ElectricalRelationship,
  GeoBoundingBox,
  CitySearchResult,
} from '@/types/geo';
import type { GeoProvenanceSummary } from './geoRegistry';

export interface CityTwinPackage {
  city: City;
  buildings: Building[];
  criticalInfrastructure: CriticalInfrastructure[];
  powerAssets: GeoPowerAsset[];
  spatialRelationships: GeoRelationship[];
  electricalRelationships: ElectricalRelationship[];
  provenanceSummary: GeoProvenanceSummary;
}

export interface IGeoDataProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly isOfflineCapable: boolean;

  searchCities(query: string): Promise<CitySearchResult[]>;
  resolveCity(cityId: string): Promise<City | null>;
  resolveLocation?(query: string, signal?: AbortSignal): Promise<City | null>;
  loadCityTwin(cityId: string): Promise<CityTwinPackage | null>;
  loadBuildings(cityId: string, bounds?: GeoBoundingBox): Promise<Building[]>;
  loadCriticalInfrastructure(cityId: string): Promise<CriticalInfrastructure[]>;
  loadPowerInfrastructure(cityId: string): Promise<GeoPowerAsset[]>;
}

export interface CityResolutionResult {
  city: City;
  generationToken: number;
  isStale: boolean;
}

/**
 * Universal City Resolver that normalizes user query strings, queries
 * registered providers without hardcoding city-specific branches, and protects
 * against asynchronous race conditions via monotonic generation tokens.
 */
export class CityResolver {
  private providers: IGeoDataProvider[] = [];
  private generationToken = 0;
  private activeAbortController: AbortController | null = null;

  constructor(initialProviders: IGeoDataProvider[] = []) {
    this.providers = [...initialProviders];
  }

  public registerProvider(provider: IGeoDataProvider): void {
    if (!this.providers.some((p) => p.providerId === provider.providerId)) {
      this.providers.push(provider);
    }
  }

  public getProviders(): IGeoDataProvider[] {
    return [...this.providers];
  }

  public getCurrentGenerationToken(): number {
    return this.generationToken;
  }

  /**
   * Normalize search input: strips extra whitespace, case-folds, removes diacritics.
   */
  public normalizeQuery(query: string): string {
    return query
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Search across all registered providers.
   */
  public async search(query: string): Promise<CitySearchResult[]> {
    const normalized = this.normalizeQuery(query);
    if (!normalized || normalized.length < 2) return [];

    const resultsMap = new Map<string, CitySearchResult>();

    for (const provider of this.providers) {
      try {
        const results = await provider.searchCities(normalized);
        for (const res of results) {
          if (!resultsMap.has(res.cityId)) {
            resultsMap.set(res.cityId, res);
          }
        }
      } catch (err) {
        console.error(`Provider ${provider.providerId} search failed:`, err);
      }
    }

    return Array.from(resultsMap.values());
  }

  /**
   * Resolve an explicit user-submitted location query with race-condition protection.
   * Cancels prior in-flight fetch requests and ensures earlier requests cannot
   * overwrite newer requests.
   */
  public async resolveLocation(query: string): Promise<CityResolutionResult | null> {
    const normalized = this.normalizeQuery(query);
    if (!normalized || normalized.length < 2) {
      throw new Error('Query must be at least 2 characters long.');
    }

    // Cancel prior active request
    if (this.activeAbortController) {
      this.activeAbortController.abort();
    }
    this.activeAbortController = new AbortController();
    const signal = this.activeAbortController.signal;

    // Issue new monotonic generation token
    const token = ++this.generationToken;

    // 1. Try providers with direct resolveLocation support first
    for (const provider of this.providers) {
      if (typeof provider.resolveLocation === 'function') {
        try {
          const city = await provider.resolveLocation(normalized, signal);
          if (city) {
            const isStale = token !== this.generationToken;
            return { city, generationToken: token, isStale };
          }
        } catch (err: any) {
          if (err.name === 'AbortError') {
            return null; // Cancelled
          }
          console.warn(`Provider ${provider.providerId} resolveLocation error:`, err);
        }
      }
    }

    // 2. Fall back to searchCities + resolveCity across providers
    for (const provider of this.providers) {
      try {
        const results = await provider.searchCities(normalized);
        if (results.length > 0) {
          const city = await provider.resolveCity(results[0].cityId);
          if (city) {
            const isStale = token !== this.generationToken;
            return { city, generationToken: token, isStale };
          }
        }
      } catch (err) {
        console.error(`Provider ${provider.providerId} search fallback failed:`, err);
      }
    }

    return null;
  }

  /**
   * Resolve a specific city by cityId across providers.
   */
  public async resolve(cityId: string): Promise<City | null> {
    for (const provider of this.providers) {
      try {
        const city = await provider.resolveCity(cityId);
        if (city) return city;
      } catch (err) {
        console.error(`Provider ${provider.providerId} resolution failed:`, err);
      }
    }
    return null;
  }

  /**
   * Load the complete digital twin package for a city.
   */
  public async loadTwin(cityId: string): Promise<CityTwinPackage | null> {
    for (const provider of this.providers) {
      try {
        const twin = await provider.loadCityTwin(cityId);
        if (twin) return twin;
      } catch (err) {
        console.error(`Provider ${provider.providerId} twin load failed:`, err);
      }
    }
    return null;
  }
}
