// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Human-Centric UI/UX Rebuild & Geo-Electrical Twin Verification
// ═══════════════════════════════════════════════════════════════════════

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { CANONICAL_CITIES_REGISTRY, CANONICAL_POWER_ASSETS } from '../data/canonicalCitiesData';
import { CEAProvider, OSMProvider, UtilityTelemetryProvider } from '../simulation/geo/providers/DataProvider';
import { VERIFIED_INDIAN_CITIES } from '../simulation/geo/verifiedIndianCities';

console.log('═══ Test Suite: VAJRA-Ω Human-Centric UI/UX & Reality Engine Verification ═══\n');

let passedTests = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ ${name}: ${err.message}`);
    throw err;
  }
}

// ─── 1. Initial 8 Cities Registry Verification ───────────────────────
console.log('─── 1. Initial 8 Cities Registry Verification ───');

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

MANDATORY_CITIES.forEach((cityId) => {
  test(`Registry includes mandatory city: ${cityId}`, () => {
    const entry = CANONICAL_CITIES_REGISTRY[cityId];
    assert(entry, `City ${cityId} must exist in CANONICAL_CITIES_REGISTRY`);
    assert(entry.canonicalName.length > 0, 'City must have canonical name');
    assert(entry.latitude >= 8 && entry.latitude <= 37, 'Latitude within India envelope');
    assert(entry.longitude >= 68 && entry.longitude <= 98, 'Longitude within India envelope');
    assert(entry.boundingRegion, 'Bounding region must be defined');
    assert(entry.boundingRegion.maxLatitude > entry.boundingRegion.minLatitude, 'Valid Lat bounds');
    assert(entry.boundingRegion.maxLongitude > entry.boundingRegion.minLongitude, 'Valid Lon bounds');
    assert(entry.supportedZoomLevels.min <= entry.supportedZoomLevels.max, 'Valid zoom range');
    assert(entry.dataFreshness.length > 0, 'Data freshness must be explicitly reported');
    assert(entry.regionalGridInterconnect.length > 0, 'Regional grid interconnect must be declared');
  });
});

test('Verified Indian Cities includes Indore with valid coordinates', () => {
  const indore = VERIFIED_INDIAN_CITIES['city-indore'];
  assert(indore, 'Indore must exist in VERIFIED_INDIAN_CITIES');
  assert.strictEqual(indore.centerCoordinates.latitude, 22.7196);
  assert.strictEqual(indore.centerCoordinates.longitude, 75.8577);
  assert.strictEqual(indore.centerCoordinates.elevationMeters, 553);
});

// ─── 2. Public Power Assets Provenance & Classification ──────────────
console.log('\n─── 2. Public Power Assets Provenance & Classification ───');

MANDATORY_CITIES.forEach((cityId) => {
  test(`City ${cityId} has canonical power assets with verified provenance`, () => {
    const assets = CANONICAL_POWER_ASSETS[cityId];
    assert(Array.isArray(assets) && assets.length > 0, `Assets must exist for ${cityId}`);

    assets.forEach((asset) => {
      assert(asset.id, 'Asset must have canonical ID');
      assert(asset.name, 'Asset must have name');
      assert(asset.coordinates.latitude && asset.coordinates.longitude, 'Asset must have WGS84 coords');
      assert(
        ['VERIFIED_REAL', 'CURRENT_PUBLIC', 'HISTORICAL', 'INFERRED', 'SIMULATED'].includes(
          asset.classification
        ),
        `Asset ${asset.id} must have valid classification`
      );
      assert(asset.source.length > 0, `Asset ${asset.id} must have source statement`);
      assert(asset.freshness.length > 0, `Asset ${asset.id} must declare data freshness`);
      assert(
        asset.voltageKV === null || (asset.voltageKV >= 11 && asset.voltageKV <= 765),
        `Asset ${asset.id} has realistic voltage level`
      );
    });
  });
});

// ─── 3. Data Providers & Live Telemetry Honesty ─────────────────────
console.log('\n─── 3. Data Providers & Live Telemetry Honesty ───');

test('CEAProvider classifies data as CURRENT_PUBLIC and flags live feed unavailable', async () => {
  const cea = new CEAProvider();
  assert.strictEqual(cea.sourceClassification, 'CURRENT_PUBLIC');
  assert.strictEqual(cea.isLiveFeedAvailable(), false);
  const delhiAssets = await cea.loadCityPowerAssets('city-delhi');
  assert(delhiAssets.length > 0, 'Loads Delhi EHV assets');
});

test('OSMProvider classifies data as CURRENT_PUBLIC and flags live feed unavailable', async () => {
  const osm = new OSMProvider();
  assert.strictEqual(osm.sourceClassification, 'CURRENT_PUBLIC');
  assert.strictEqual(osm.isLiveFeedAvailable(), false);
  const mumbaiAssets = await osm.loadCityPowerAssets('city-mumbai');
  assert(mumbaiAssets.length > 0, 'Loads Mumbai assets');
});

test('UtilityTelemetryProvider explicitly reports DISCONNECTED status (NO FAKE TELEMETRY)', () => {
  const tele = new UtilityTelemetryProvider();
  assert.strictEqual(tele.isLiveFeedAvailable(), false);
  const conn = tele.getConnectionStatus();
  assert.strictEqual(conn.connected, false);
  assert(conn.statusText.includes('DISCONNECTED'), 'Status text must say DISCONNECTED');
});

// ─── 4. MapLibre Expression Error Elimination ───────────────────────
console.log('\n─── 4. MapLibre Expression Error Elimination ───');

test('MapEngineAdapter does NOT use dynamic data expressions on fill-extrusion-opacity', () => {
  const adapterFilePath = path.join(__dirname, '../../src/simulation/geo/mapEngineAdapter.ts');
  const code = fs.readFileSync(adapterFilePath, 'utf8');

  // Verify that fill-extrusion-opacity does not contain ['coalesce', ['get', 'opacity'], ...]
  const hasUnsupportedExpression = code.includes(
    "'fill-extrusion-opacity': ['coalesce', ['get', 'opacity']"
  );
  assert(!hasUnsupportedExpression, 'fill-extrusion-opacity must not use dynamic feature get expression');

  // Verify that fill-extrusion-opacity is constant
  assert(code.includes("'fill-extrusion-opacity': 0.88"), 'fill-extrusion-opacity must be set to constant 0.88');
});

// ─── 5. UI/UX Shell Navigation & View Structure ─────────────────────
console.log('\n─── 5. UI/UX Shell Navigation & View Structure ───');

test('AppShell file exists and exports AppShell component', () => {
  const appShellPath = path.join(__dirname, '../../src/components/shell/AppShell.tsx');
  assert(fs.existsSync(appShellPath), 'AppShell.tsx must exist');
  const code = fs.readFileSync(appShellPath, 'utf8');
  assert(code.includes('export default function AppShell'), 'AppShell must have default export');
  assert(code.includes('overview'), 'Contains overview navigation');
  assert(code.includes('geotwin'), 'Contains geotwin navigation');
  assert(code.includes('topology'), 'Contains topology navigation');
  assert(code.includes('events'), 'Contains events navigation');
  assert(code.includes('scenarios'), 'Contains scenarios navigation');
  assert(code.includes('analytics'), 'Contains analytics navigation');
  assert(code.includes('datasources'), 'Contains datasources navigation');
});

test('ElectricalSchematicView exists and supports voltage hierarchy', () => {
  const schematicPath = path.join(__dirname, '../../src/components/grid/ElectricalSchematicView.tsx');
  assert(fs.existsSync(schematicPath), 'ElectricalSchematicView.tsx must exist');
  const code = fs.readFileSync(schematicPath, 'utf8');
  assert(code.includes('ElectricalSchematicView'), 'Must export ElectricalSchematicView');
  assert(code.includes('tierYPositions'), 'Defines voltage tier positions');
  assert(code.includes('400 kV'), 'Includes 400kV tier');
  assert(code.includes('220 kV'), 'Includes 220kV tier');
});

test('AssetInspectorDrawer exists and defines required tabs', () => {
  const drawerPath = path.join(__dirname, '../../src/components/shell/AssetInspectorDrawer.tsx');
  assert(fs.existsSync(drawerPath), 'AssetInspectorDrawer.tsx must exist');
  const code = fs.readFileSync(drawerPath, 'utf8');
  assert(code.includes('OVERVIEW'), 'Contains Overview tab');
  assert(code.includes('ELECTRICAL'), 'Contains Electrical tab');
  assert(code.includes('GEOGRAPHY'), 'Contains Geography tab');
  assert(code.includes('EVENTS'), 'Contains Events tab');
  assert(code.includes('SIMULATION'), 'Contains Simulation tab');
});

test('BottomTimelineBar exists and provides playback controls and plain language metrics', () => {
  const barPath = path.join(__dirname, '../../src/components/shell/BottomTimelineBar.tsx');
  assert(fs.existsSync(barPath), 'BottomTimelineBar.tsx must exist');
  const code = fs.readFileSync(barPath, 'utf8');
  assert(code.includes('PLAY'), 'Contains Play control');
  assert(code.includes('PAUSE'), 'Contains Pause control');
  assert(code.includes('STEP'), 'Contains Step control');
  assert(code.includes('RESET'), 'Contains Reset control');
  assert(code.includes('Hz'), 'Displays frequency in plain units');
});

console.log(`\n═══════════════════════════════════════════════════════════════════`);
console.log(`UI/UX Rebuild Verification Results: ${passedTests} PASSED, 0 FAILED`);
console.log(`═══════════════════════════════════════════════════════════════════\n`);
