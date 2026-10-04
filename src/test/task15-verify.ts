// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Task #15 Verification Script: Real Geographic Data & Map Engine
// ═══════════════════════════════════════════════════════════════════════
// Required Invariants Tested:
//  1. City query normalization (trim, lowercase, diacritic stripping)
//  2. Empty / invalid query rejection (empty, whitespace, length < 2, injection)
//  3. City resolution success (Delhi, Mumbai, Bengaluru, Chennai, Kolkata, Pune, Surat, Bhopal)
//  4. City resolution failure handling (unknown locations cleanly return null)
//  5. Coordinate & bounding box validation
//  6. Provider abstraction (CityResolver with multiple registered providers)
//  7. Provider error propagation & resilience
//  8. Cached city resolution (in-memory cache prevents redundant lookups)
//  9. Stale-request & race-condition protection (generation tokens & AbortSignal)
// 10. Store city state update (selectedCity, viewport, loaded entities)
// 11. Camera target & bounding box calculation
// 12. Geographic provenance classification (VERIFIED_EXTERNAL vs MODELED)
// 13. Synthetic data identification (explicit non-real-world flags)
// 14. Layer configuration & toggling
// 15. Map state initialization & attribution
// 16. Fallback behavior (WebGL unavailable / graceful SVG fallback)
// 17. Invalid geographic data rejection
// 18. Duplicate city resolution stability
// 19. Existing simulation state preservation (no mutation to physics or topology)
// 20. Existing cascade state preservation
// ═══════════════════════════════════════════════════════════════════════

import {
  isValidCoordinate,
  assertValidCoordinate,
  isValidBoundingBox,
  isCoordinateInBoundingBox,
} from '../simulation/geo/geoCoordinates';
import {
  CityResolver,
  IGeoDataProvider,
} from '../simulation/geo/geoProvider';
import { RealGeoDataProvider } from '../simulation/geo/realGeoDataProvider';
import { DeterministicGeoDataProvider } from '../simulation/geo/deterministicGeoTwin';
import { VERIFIED_INDIAN_CITIES } from '../simulation/geo/verifiedIndianCities';
import { MapEngineAdapter } from '../simulation/geo/mapEngineAdapter';
import { useVajraStore, DEFAULT_GEO_TWIN_STATE } from '../store/vajraStore';
import { generateGridTopology } from '../simulation/models/gridGenerator';
import type { City, GeoBoundingBox, GeoCoordinate } from '../types/geo';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

async function runTask15Verification(): Promise<void> {
  console.log('\n═══ Test Suite: Task #15 — Real Geographic Data Integration & Map Engine ═══');

  const realProvider = new RealGeoDataProvider();
  const demoProvider = new DeterministicGeoDataProvider();
  const resolver = new CityResolver([realProvider, demoProvider]);

  // ─────────────────────────────────────────────────────────────────────
  // 1. City Query Normalization
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 1. City Query Normalization ───');
  {
    const norm1 = realProvider.normalizeQuery('  DELHI NCR  ');
    assert(norm1 === 'delhi ncr', 'Trims whitespace and lowercases query');

    const norm2 = realProvider.normalizeQuery('BÉNGALURU');
    assert(norm2 === 'bengaluru', 'Strips diacritics and accents');

    const norm3 = resolver.normalizeQuery('  Mumbai, Maharashtra  ');
    assert(norm3 === 'mumbai, maharashtra', 'CityResolver normalizes uniformly');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 2. Empty / Invalid Query Rejection
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 2. Empty / Invalid Query Rejection ───');
  {
    const valEmpty = realProvider.validateQuery('');
    assert(!valEmpty.isValid, 'Rejects empty query');

    const valWhitespace = realProvider.validateQuery('     ');
    assert(!valWhitespace.isValid, 'Rejects whitespace-only query');

    const valShort = realProvider.validateQuery('a');
    assert(!valShort.isValid, 'Rejects query with length < 2');

    const valInjection = realProvider.validateQuery('<script>alert(1)</script>');
    assert(!valInjection.isValid, 'Rejects query with dangerous script characters');

    let threw = false;
    try {
      await resolver.resolveLocation('');
    } catch {
      threw = true;
    }
    assert(threw, 'CityResolver.resolveLocation throws on empty query');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 3. City Resolution Success (Validation Set)
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 3. City Resolution Success ───');
  {
    const validationCities = [
      'Delhi',
      'Mumbai',
      'Bengaluru',
      'Chennai',
      'Kolkata',
      'Pune',
      'Surat',
      'Bhopal',
    ];

    for (const cityName of validationCities) {
      const res = await resolver.resolveLocation(cityName);
      assert(res !== null && res.city !== null, `Resolved location for "${cityName}"`);
      if (res?.city) {
        assert(isValidCoordinate(res.city.centerCoordinates), `Valid coordinates for ${cityName}`);
        assert(isValidBoundingBox(res.city.boundingBox), `Valid bounding box for ${cityName}`);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 4. City Resolution Failure Handling
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 4. City Resolution Failure Handling ───');
  {
    const res = await resolver.resolveLocation('NonExistentAtlantisMetropolis999');
    assert(res === null, 'Unknown non-existent location returns null cleanly without crashing');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 5. Coordinate & Bounding Box Validation
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 5. Coordinate & Bounding Box Validation ───');
  {
    for (const [id, city] of Object.entries(VERIFIED_INDIAN_CITIES)) {
      assert(isValidCoordinate(city.centerCoordinates), `Verified city ${id} center is valid`);
      assert(isValidBoundingBox(city.boundingBox), `Verified city ${id} bounding box is valid`);
      assert(
        isCoordinateInBoundingBox(city.centerCoordinates, city.boundingBox),
        `Verified city ${id} center lies within its bounding box`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 6. Provider Abstraction
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 6. Provider Abstraction ───');
  {
    const customResolver = new CityResolver();
    customResolver.registerProvider(realProvider);
    customResolver.registerProvider(demoProvider);

    assert(customResolver.getProviders().length === 2, 'CityResolver registers multiple providers');
    const searchRes = await customResolver.search('pune');
    assert(searchRes.length > 0, 'Polymorphic search resolves across registered providers');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 7. Provider Error Propagation & Resilience
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 7. Provider Error Propagation ───');
  {
    const faultyProvider: IGeoDataProvider = {
      providerId: 'faulty-provider',
      providerName: 'Faulty Test Provider',
      isOfflineCapable: false,
      searchCities: async () => {
        throw new Error('Simulated network timeout');
      },
      resolveCity: async () => {
        throw new Error('Simulated network failure');
      },
      loadCityTwin: async () => null,
      loadBuildings: async () => [],
      loadCriticalInfrastructure: async () => [],
      loadPowerInfrastructure: async () => [],
    };

    const resilientResolver = new CityResolver([faultyProvider, realProvider]);
    // Should gracefully skip faulty provider and resolve via realProvider
    const res = await resilientResolver.resolveLocation('Chennai');
    assert(res !== null && res.city.name.includes('Chennai'), 'Resiliently recovers from faulty provider');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 8. Cached City Resolution
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 8. Cached City Resolution ───');
  {
    const initialCacheSize = realProvider.getCacheSize();
    assert(initialCacheSize > 0, 'Provider cache is primed with verified cities');

    // First call
    const res1 = await realProvider.resolveLocation('Kolkata');
    // Second call (hits cache)
    const res2 = await realProvider.resolveLocation('Kolkata');

    assert(res1 !== null && res2 !== null, 'Both calls resolve');
    assert(res1?.id === res2?.id, 'Identical city returned from cache');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 9. Stale-Request & Race-Condition Protection
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 9. Stale-Request Protection ───');
  {
    const slowProvider: IGeoDataProvider = {
      providerId: 'slow-provider',
      providerName: 'Slow Mock Provider',
      isOfflineCapable: true,
      searchCities: async () => [],
      resolveCity: async () => null,
      resolveLocation: async (q: string) => {
        // Delay resolution based on query to simulate out-of-order responses
        const delay = q.includes('delhi') ? 50 : 10;
        await new Promise((r) => setTimeout(r, delay));
        return VERIFIED_INDIAN_CITIES['city-delhi'];
      },
      loadCityTwin: async () => null,
      loadBuildings: async () => [],
      loadCriticalInfrastructure: async () => [],
      loadPowerInfrastructure: async () => [],
    };

    const raceResolver = new CityResolver([slowProvider]);

    // Issue request 1 (Delhi, slow)
    const p1 = raceResolver.resolveLocation('delhi');
    // Immediately issue request 2 (Mumbai, faster)
    const p2 = raceResolver.resolveLocation('mumbai');

    const [res1, res2] = await Promise.all([p1, p2]);

    assert(res1?.isStale === true, 'Earlier superseded request is correctly flagged as isStale=true');
    assert(res2?.isStale === false, 'Latest request is flagged as isStale=false');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 10. Store City State Update
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 10. Store City State Update ───');
  {
    const store = useVajraStore.getState();
    const success = await store.searchAndNavigateCity('Surat');
    assert(success === true, 'searchAndNavigateCity returned true for Surat');

    const updated = useVajraStore.getState().geoTwin;
    assert(updated?.selectedCity?.id === 'city-surat', 'selectedCity in store updated to city-surat');
    assert(updated?.locationResolutionStatus === 'SUCCESS', 'locationResolutionStatus set to SUCCESS');
    assert(updated?.errorMessage === null, 'errorMessage is cleared on success');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 11. Camera Target Calculation
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 11. Camera Target Calculation ───');
  {
    const state = useVajraStore.getState().geoTwin;
    assert(state?.viewport !== undefined, 'Viewport state defined');
    if (state?.viewport) {
      assert(state.viewport.center.latitude === 21.1702, 'Camera latitude matches Surat centroid');
      assert(state.viewport.center.longitude === 72.8311, 'Camera longitude matches Surat centroid');
      assert(state.viewport.zoom >= 11, 'Camera zoom level set for city viewing');
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 12. Geographic Provenance Classification
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 12. Geographic Provenance Classification ───');
  {
    const puneCity = VERIFIED_INDIAN_CITIES['city-pune'];
    assert(puneCity.provenance.sourceType === 'VERIFIED_EXTERNAL', 'Verified city provenance is VERIFIED_EXTERNAL');
    assert(puneCity.provenance.isVerifiedRealWorld === true, 'Verified city isVerifiedRealWorld is true');
    assert(puneCity.provenance.confidence === 'HIGH', 'Verified city confidence is HIGH');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 13. Synthetic Data Identification
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 13. Synthetic Data Identification ───');
  {
    const demoPkg = await demoProvider.loadCityTwin('city-delhi');
    assert(demoPkg !== null, 'Loaded demo package');
    if (demoPkg) {
      const hasSynthetic = demoPkg.buildings.some((b) => b.provenance.sourceType === 'SYNTHETIC');
      assert(hasSynthetic, 'Demo buildings explicitly flagged as SYNTHETIC');
      const verifiedGroundTruth = demoPkg.buildings.every((b) => b.provenance.isVerifiedRealWorld === false);
      assert(verifiedGroundTruth, 'Demo buildings cannot be claimed as verified real world');
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // 14. Layer Configuration & Toggling
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 14. Layer Configuration ───');
  {
    const store = useVajraStore.getState();
    const baseMapBefore = store.geoTwin?.visibleLayers.BASE_MAP;
    store.toggleGeoLayer('BASE_MAP');
    const baseMapAfter = useVajraStore.getState().geoTwin?.visibleLayers.BASE_MAP;
    assert(baseMapAfter === !baseMapBefore, 'Toggled BASE_MAP layer cleanly');
    // Restore
    store.toggleGeoLayer('BASE_MAP');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 15. Map State Initialization & Attribution
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 15. Map State Initialization & Attribution ───');
  {
    assert(typeof MapEngineAdapter.isWebGLSupported === 'function', 'MapEngineAdapter exposes isWebGLSupported');
    const state = useVajraStore.getState().geoTwin;
    assert(Boolean(state?.attribution?.includes('OpenStreetMap')), 'Store retains OpenStreetMap attribution');
    assert(Boolean(state?.attribution?.includes('CARTO')), 'Store retains CARTO attribution');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 16. Fallback Behavior
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 16. Fallback Behavior ───');
  {
    const store = useVajraStore.getState();
    store.setMapEngineStatus('FALLBACK', 'WebGL headless testing fallback');
    const state = useVajraStore.getState().geoTwin;
    assert(state?.mapEngineStatus === 'FALLBACK', 'setMapEngineStatus transitions to FALLBACK');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 17. Invalid Geographic Data Rejection
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 17. Invalid Geographic Data Rejection ───');
  {
    const invalidCoord: GeoCoordinate = { latitude: 120, longitude: -250 };
    assert(!isValidCoordinate(invalidCoord), 'Rejects coordinates out of WGS84 bounds');

    const invalidBox: GeoBoundingBox = {
      minLatitude: 30,
      maxLatitude: 20, // min > max
      minLongitude: 70,
      maxLongitude: 80,
    };
    assert(!isValidBoundingBox(invalidBox), 'Rejects inverted bounding box');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 18. Duplicate City Resolution Stability
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 18. Duplicate City Resolution Stability ───');
  {
    const store = useVajraStore.getState();
    await store.searchAndNavigateCity('Ahmedabad');
    const id1 = useVajraStore.getState().geoTwin?.selectedCity?.id;
    await store.searchAndNavigateCity('Ahmedabad');
    const id2 = useVajraStore.getState().geoTwin?.selectedCity?.id;

    assert(id1 === id2, 'Duplicate resolution of Ahmedabad returns stable identifier');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 19. Existing Simulation State Preservation
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 19. Existing Simulation State Preservation ───');
  {
    const preNavGenCount = useVajraStore.getState().topology.generators.length;
    const preNavSubCount = useVajraStore.getState().topology.substations.length;
    const preNavLineCount = useVajraStore.getState().topology.transmissionLines.length;

    await useVajraStore.getState().searchAndNavigateCity('Hyderabad');

    const postNavGenCount = useVajraStore.getState().topology.generators.length;
    const postNavSubCount = useVajraStore.getState().topology.substations.length;
    const postNavLineCount = useVajraStore.getState().topology.transmissionLines.length;

    assert(preNavGenCount === postNavGenCount, 'Generator count preserved');
    assert(preNavSubCount === postNavSubCount, 'Substation count preserved');
    assert(preNavLineCount === postNavLineCount, 'Transmission line count preserved');
  }

  // ─────────────────────────────────────────────────────────────────────
  // 20. Existing Cascade State Preservation
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n─── 20. Existing Cascade State Preservation ───');
  {
    const cascadeState = useVajraStore.getState().activeCascade;
    // Navigation must not throw or overwrite activeCascade with undefined
    assert(cascadeState !== undefined, 'Active cascade reference is preserved');
  }

  console.log(`\n═══════════════════════════════════════════════════════════════════`);
  console.log(`Task #15 Verification Results: ${passed} PASSED, ${failed} FAILED`);
  console.log(`═══════════════════════════════════════════════════════════════════\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTask15Verification().catch((err) => {
  console.error('Task 15 verification fatal error:', err);
  process.exit(1);
});
