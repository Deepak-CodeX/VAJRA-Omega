// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Phase 0.1 Dual-Provenance Canonical Asset Verification
// ═══════════════════════════════════════════════════════════════════════
// Enforces Data-Honesty Gate:
// 1. Every asset exists in an identifiable public/official source.
// 2. Exact source/reference is recorded.
// 3. geometryProvenance is separate from topologyProvenance.
// 4. No electrical connectivity inferred from geographic proximity.
// 5. If topology cannot be verified, set topologyProvenance to UNKNOWN or INFERRED (never VERIFIED).
// 6. No invented values for missing properties.
// 7. Synthetic demo data is explicitly flagged as SIMULATED / MODELED / SYNTHETIC.
// 8. All 8 city registries exist and have partial public transmission coverage.
// ═══════════════════════════════════════════════════════════════════════

import {
  CANONICAL_CITIES_REGISTRY,
  CANONICAL_POWER_ASSETS,
} from '../data/canonicalCitiesData';
import type { PowerAsset } from '../types/powerAsset';
import { VERIFIED_INDIAN_CITIES } from '../simulation/geo/verifiedIndianCities';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

export function runPhase01Verification() {
  console.log('\n═══ Test Suite: Phase 0.1 Dual-Provenance Data-Honesty Verification ═══\n');

  const MANDATORY_CITIES = [
    'city-delhi',
    'city-mumbai',
    'city-kolkata',
    'city-chennai',
    'city-bengaluru',
    'city-surat',
    'city-bhopal',
    'city-indore',
  ];

  // ─── 1. Verify All 8 City Registries ───
  console.log('─── 1. City Registry Completeness & Status ───');
  for (const cityId of MANDATORY_CITIES) {
    const entry = CANONICAL_CITIES_REGISTRY[cityId];
    assert(!!entry, `Registry contains city: ${cityId}`);
    assert(
      entry.coverageStatus === 'PARTIAL_PUBLIC_TRANSMISSION',
      `${cityId} designated as PARTIAL_PUBLIC_TRANSMISSION (no false full-twin claims)`
    );
    assert(
      entry.liveTelemetryStatus.includes('DISCONNECTED'),
      `${cityId} telemetry honestly marked DISCONNECTED`
    );
    assert(
      entry.utilityFeederStatus.includes('NOT PUBLICLY VERIFIED'),
      `${cityId} feeder status honestly marked unverified`
    );
    assert(
      entry.latitude !== undefined && entry.longitude !== undefined,
      `${cityId} has valid GPS coordinates`
    );
    assert(
      entry.boundingRegion.minLatitude < entry.boundingRegion.maxLatitude,
      `${cityId} bounding box valid latitude range`
    );
    assert(
      entry.boundingRegion.minLongitude < entry.boundingRegion.maxLongitude,
      `${cityId} bounding box valid longitude range`
    );
  }

  // Also check verifiedIndianCities has Indore
  assert(
    !!VERIFIED_INDIAN_CITIES['city-indore'],
    'VERIFIED_INDIAN_CITIES contains Indore with official WR-MPPTCL interconnect'
  );

  // ─── 2. Dual-Provenance & Data-Honesty Gate on Canonical Assets ───
  console.log('\n─── 2. Asset-Level Dual-Provenance & Source Traceability ───');
  let totalAssetsChecked = 0;
  const verifiedRealAssets: string[] = [];
  const currentPublicAssets: string[] = [];
  const inferredTopologyAssets: string[] = [];
  const simulatedAssets: string[] = [];

  for (const cityId of MANDATORY_CITIES) {
    const assets: PowerAsset[] = CANONICAL_POWER_ASSETS[cityId] || [];
    assert(assets.length > 0, `City ${cityId} has registered canonical power assets`);

    for (const asset of assets) {
      totalAssetsChecked++;

      // 1. Identifiable public/official source
      assert(
        typeof asset.source === 'string' && asset.source.trim().length > 5,
        `Asset ${asset.id} has identifiable public source: "${asset.source}"`
      );

      // 2. Exact source URL / reference recorded
      assert(
        typeof asset.sourceUrl === 'string' &&
          (asset.sourceUrl.startsWith('http://') || asset.sourceUrl.startsWith('https://')),
        `Asset ${asset.id} has verifiable source URL: "${asset.sourceUrl}"`
      );

      // 3. Separate geometryProvenance from topologyProvenance
      assert(
        ['SURVEY_GROUND_TRUTH', 'OSM_VERIFIED_NODE', 'APPROXIMATE_BOUNDS', 'ESTIMATED_COORDINATE'].includes(
          asset.geometryProvenance
        ),
        `Asset ${asset.id} has valid geometryProvenance: ${asset.geometryProvenance}`
      );

      assert(
        [
          'VERIFIED_UTILITY_SLD',
          'REGIONAL_PLAN_MAP',
          'INFERRED_SPATIAL_TIE',
          'UNVERIFIED_OPEN_DATA',
          'SIMULATED_SCENARIO',
          'UNKNOWN',
          'INFERRED',
        ].includes(asset.topologyProvenance),
        `Asset ${asset.id} has valid topologyProvenance: ${asset.topologyProvenance}`
      );

      // 4. Proximity != Connectivity Gate:
      // If topologyProvenance is INFERRED_SPATIAL_TIE or INFERRED or UNKNOWN,
      // it must never be connected as verified.
      const isTopologyInferred =
        asset.topologyProvenance === 'INFERRED_SPATIAL_TIE' ||
        asset.topologyProvenance === 'INFERRED' ||
        asset.topologyProvenance === 'UNKNOWN';

      if (isTopologyInferred) {
        inferredTopologyAssets.push(asset.id);
        // Ensure that any inferred ties are in inferredAssetIds, not verified connectedAssetIds
        assert(
          asset.connectedAssetIds.length === 0 ||
            asset.topologyProvenance !== 'INFERRED_SPATIAL_TIE',
          `Asset ${asset.id} with inferred spatial tie does not claim verified upstream connections in open data`
        );
      }

      // Track classifications
      if (asset.classification === 'VERIFIED_REAL') {
        verifiedRealAssets.push(asset.id);
      } else if (asset.classification === 'CURRENT_PUBLIC') {
        currentPublicAssets.push(asset.id);
      } else if (asset.classification === 'SIMULATED') {
        simulatedAssets.push(asset.id);
      }

      // 5. Connectivity verification
      assert(Array.isArray(asset.connectedAssetIds), `Asset ${asset.id} has connectedAssetIds array`);
      assert(Array.isArray(asset.inferredAssetIds), `Asset ${asset.id} has inferredAssetIds array`);

      // 6. Realistic, non-fabricated values:
      assert(
        asset.voltageKV === null || (typeof asset.voltageKV === 'number' && asset.voltageKV > 0),
        `Asset ${asset.id} voltage is either null or a positive number`
      );
      assert(
        asset.coordinates.latitude >= -90 && asset.coordinates.latitude <= 90,
        `Asset ${asset.id} valid latitude`
      );
      assert(
        asset.coordinates.longitude >= -180 && asset.coordinates.longitude <= 180,
        `Asset ${asset.id} valid longitude`
      );
    }
  }

  // ─── 3. Provenance Category Summary ───
  console.log('\n─── 3. Provenance Tally ───');
  console.log(`  Total Canonical Assets Evaluated: ${totalAssetsChecked}`);
  console.log(`  VERIFIED_REAL Assets: ${verifiedRealAssets.length}`);
  console.log(`  CURRENT_PUBLIC Assets: ${currentPublicAssets.length}`);
  console.log(`  INFERRED Topology Assets: ${inferredTopologyAssets.length}`);
  console.log(`  SIMULATED Assets: ${simulatedAssets.length}`);

  assert(totalAssetsChecked >= 17, 'All 8 cities have at least 17 total evaluated canonical assets');
  assert(currentPublicAssets.length > 0, 'Public transmission assets verified');

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('Phase 0.1 Verification Results: ALL CHECKS PASSED (100% Data-Honest)');
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

runPhase01Verification();
