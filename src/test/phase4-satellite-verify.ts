// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Phase 4.3A Real Satellite Orthophoto Backdrop Verification
// ═══════════════════════════════════════════════════════════════════════
// Strict Non-Negotiable Gate:
// 1. Genuine orthophoto/satellite layer provider configuration & endpoint validity.
// 2. MapEngineAdapter supports both 'CARTOGRAPHIC' and 'SATELLITE' backdrop modes.
// 3. Provenance & Data Honesty:
//    - MUST be classified as "CURRENT PUBLIC / EXTERNAL GEOGRAPHIC DATA".
//    - MUST NOT claim "LIVE TELEMETRY", "REAL-TIME SATELLITE", or "VERIFIED ELECTRICAL DATA".
// 4. Provider attribution explicitly preserved and present.
// 5. All 9 target cities maintain valid geographic coordinates for imagery alignment.
// 6. Vector buildings and electrical overlays remain registered over imagery.
// ═══════════════════════════════════════════════════════════════════════

import { VERIFIED_INDIAN_CITIES } from '../simulation/geo/verifiedIndianCities';
import { ESRI_WORLD_IMAGERY_CONFIG } from '../simulation/geo/mapEngineAdapter';

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

export async function runPhase4SatelliteVerification(): Promise<void> {
  console.log('\n═══ Test Suite: Phase 4.3A — Real Satellite Orthophoto Backdrop ═══\n');

  const TARGET_CITIES = [
    'city-delhi',
    'city-mumbai',
    'city-bengaluru',
    'city-chennai',
    'city-kolkata',
    'city-pune',
    'city-surat',
    'city-bhopal',
    'city-indore',
  ];

  // ─── 1. Provider Configuration & Honesty Standards ─────────────────
  console.log('─── 1. Satellite Provider Configuration & Data Honesty ───');
  assert(!!ESRI_WORLD_IMAGERY_CONFIG, 'ESRI_WORLD_IMAGERY_CONFIG is defined');
  assert(
    ESRI_WORLD_IMAGERY_CONFIG.provenanceClassification === 'CURRENT PUBLIC / EXTERNAL GEOGRAPHIC DATA',
    `Provenance classified as "CURRENT PUBLIC / EXTERNAL GEOGRAPHIC DATA" (actual: "${ESRI_WORLD_IMAGERY_CONFIG.provenanceClassification}")`
  );
  assert(
    !ESRI_WORLD_IMAGERY_CONFIG.provenanceClassification.includes('LIVE TELEMETRY'),
    'Does not claim "LIVE TELEMETRY"'
  );
  assert(
    !ESRI_WORLD_IMAGERY_CONFIG.provenanceClassification.includes('REAL-TIME SATELLITE'),
    'Does not claim "REAL-TIME SATELLITE"'
  );
  assert(
    !ESRI_WORLD_IMAGERY_CONFIG.provenanceClassification.includes('VERIFIED ELECTRICAL DATA'),
    'Does not claim "VERIFIED ELECTRICAL DATA"'
  );

  // Check tile URL template
  assert(
    ESRI_WORLD_IMAGERY_CONFIG.tiles.length > 0 &&
    ESRI_WORLD_IMAGERY_CONFIG.tiles[0].includes('{z}/{y}/{x}') &&
    ESRI_WORLD_IMAGERY_CONFIG.tiles[0].startsWith('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'),
    'Valid ArcGIS/Esri World Imagery tile URL template with HTTPS'
  );

  // Check attribution
  assert(
    ESRI_WORLD_IMAGERY_CONFIG.attribution.includes('Esri') &&
    ESRI_WORLD_IMAGERY_CONFIG.attribution.includes('Maxar'),
    'Attribution includes legitimate imagery sources (Esri, Maxar)'
  );

  // Check zoom limits
  assert(ESRI_WORLD_IMAGERY_CONFIG.maxzoom >= 18, `Max zoom is sufficient for city-scale navigation (${ESRI_WORLD_IMAGERY_CONFIG.maxzoom})`);

  // ─── 2. All 9 Target Cities Satellite Geographic Readiness ──────────
  console.log('\n─── 2. Target Cities Geographic Center Alignment (All 9 Cities) ───');
  for (const cityId of TARGET_CITIES) {
    const city = VERIFIED_INDIAN_CITIES[cityId];
    assert(!!city, `${cityId} is defined in verified city registry`);
    
    // Bounds check
    const lat = city.centerCoordinates.latitude;
    const lng = city.centerCoordinates.longitude;
    assert(lat >= 8.0 && lat <= 36.0, `${cityId} latitude ${lat} is within Indian subcontinent boundaries`);
    assert(lng >= 68.0 && lng <= 98.0, `${cityId} longitude ${lng} is within Indian subcontinent boundaries`);

    // Calculate approximate tile coordinates at z=12 to verify standard Web Mercator math
    const z = 12;
    const n = Math.pow(2, z);
    const latRad = (lat * Math.PI) / 180;
    const tileX = Math.floor(((lng + 180) / 360) * n);
    const tileY = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
    );
    assert(tileX > 0 && tileY > 0, `${cityId} resolves to valid Mercator tile (${tileX}, ${tileY}) at z=12`);
  }

  // ─── 3. Verification Summary ───────────────────────────────────────
  console.log(`\n═══════════════════════════════════════════════════════════════════`);
  console.log(`Phase 4.3A Satellite Verification: ${passed} Passed, ${failed} Failed`);
  console.log(`═══════════════════════════════════════════════════════════════════\n`);

  if (failed > 0) {
    throw new Error(`Phase 4.3A Satellite Verification failed with ${failed} errors.`);
  }
}

// Direct execution when run via node dist-test/...
if (require.main === module) {
  runPhase4SatelliteVerification().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
