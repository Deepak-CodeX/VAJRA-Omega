// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Task #19 Verification Script
// High-Fidelity 3D City Visualization + Dynamic Grid Blackout Shading
// ═══════════════════════════════════════════════════════════════════════

import { Building3DExtruder, COLOR_PALETTES, USAGE_TYPE_DEFAULT_HEIGHTS } from '../simulation/geo/building3DExtruder';
import { GeoSimulationCoordinator } from '../simulation/geo/geoSimulationCoordinator';
import { DeterministicGeoDataProvider } from '../simulation/geo/deterministicGeoTwin';
import { RealGeoDataProvider } from '../simulation/geo/realGeoDataProvider';
import { CityResolver } from '../simulation/geo/geoProvider';
import { VERIFIED_INDIAN_CITIES } from '../simulation/geo/verifiedIndianCities';
import { MapEngineAdapter } from '../simulation/geo/mapEngineAdapter';
import { useVajraStore } from '../store/vajraStore';
import type {
  Building,
  CriticalInfrastructure,
  EstimatedServiceRegion,
  GeoSimulationImpact,
} from '../types/geo';

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

async function runTask19Tests() {
  console.log('\n═══ Test Suite: Task #19 — High-Fidelity 3D City Visualization + Dynamic Blackout ═══\n');

  // ─── 1. Building Height Extraction ───────────────────────────────────
  console.log('─── 1. Building Height Extraction ───');
  {
    const bldgWithHeight: Building = {
      id: 'bldg-1',
      name: 'Delhi Telecom Tower',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'COMMERCIAL',
      coordinates: { latitude: 28.6139, longitude: 77.209 },
      heightMeters: 55,
      floorCount: 15,
      estimatedPeakDemandMW: 2.5,
      isCriticalPowerCustomer: false,
      provenance: {
        sourceType: 'VERIFIED_EXTERNAL',
        confidence: 'HIGH',
        sourceReference: 'Delhi Municipal Survey',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: true,
      },
    };

    const extracted = Building3DExtruder.extractHeightWithProvenance(bldgWithHeight);
    assert(extracted.heightMeters === 55, 'Preserves explicit height of 55m');
    assert(extracted.provenance === 'VERIFIED_SURVEY', 'Identifies verified survey provenance');
    assert(extracted.isEstimated === false, 'Flags height as verified (not estimated)');
  }

  // ─── 2. Missing Height Handling ─────────────────────────────────────
  console.log('─── 2. Missing Height Handling ───');
  {
    // Floor count fallback
    const bldgFloor: Building = {
      id: 'bldg-floor',
      name: 'Residential Tower A',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'RESIDENTIAL',
      coordinates: { latitude: 28.62, longitude: 77.21 },
      floorCount: 10,
      estimatedPeakDemandMW: 1.2,
      isCriticalPowerCustomer: false,
      provenance: {
        sourceType: 'MODELED',
        confidence: 'MEDIUM',
        sourceReference: 'Census',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
    };
    const resFloor = Building3DExtruder.extractHeightWithProvenance(bldgFloor);
    assert(resFloor.heightMeters === 35, 'Derives 35m from 10 floors (10 * 3.5m)');
    assert(resFloor.provenance === 'FLOOR_COUNT_ESTIMATE', 'Tags provenance as FLOOR_COUNT_ESTIMATE');
    assert(resFloor.isEstimated === true, 'Correctly flags as estimated');

    // Usage type fallback
    const bldgUsage: Building = {
      id: 'bldg-gov',
      name: 'Secretariat Office',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'GOVERNMENT',
      coordinates: { latitude: 28.61, longitude: 77.2 },
      estimatedPeakDemandMW: 3.0,
      isCriticalPowerCustomer: true,
      provenance: {
        sourceType: 'SYNTHETIC',
        confidence: 'LOW',
        sourceReference: 'Default',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
    };
    const resUsage = Building3DExtruder.extractHeightWithProvenance(bldgUsage);
    assert(resUsage.heightMeters === USAGE_TYPE_DEFAULT_HEIGHTS.GOVERNMENT, 'Uses standardized government fallback (35m)');
    assert(resUsage.provenance === 'USAGE_TYPE_FALLBACK', 'Tags provenance as USAGE_TYPE_FALLBACK');
  }

  // ─── 3. Provenance Preservation ─────────────────────────────────────
  console.log('─── 3. Provenance Preservation ───');
  {
    const bldgSynthetic: Building = {
      id: 'bldg-syn',
      name: 'Unknown Structure',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'MIXED_USE',
      coordinates: { latitude: 28.6, longitude: 77.2 },
      estimatedPeakDemandMW: 0.5,
      isCriticalPowerCustomer: false,
      provenance: {
        sourceType: 'SYNTHETIC',
        confidence: 'LOW',
        sourceReference: 'Generic',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
    };
    const resSyn = Building3DExtruder.extractHeightWithProvenance(bldgSynthetic);
    assert(resSyn.isEstimated === true, 'Synthetic building is never flagged as verified');
    assert(resSyn.provenance !== 'VERIFIED_SURVEY', 'Synthetic provenance distinct from verified survey');
  }

  // ─── 4. 3D State Derivation ─────────────────────────────────────────
  console.log('─── 4. 3D State Derivation ───');
  {
    const pointBldg: Building = {
      id: 'pt-1',
      name: 'Substation Control Center',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'INDUSTRIAL',
      coordinates: { latitude: 28.6139, longitude: 77.209 },
      heightMeters: 14,
      estimatedPeakDemandMW: 0.8,
      isCriticalPowerCustomer: true,
      provenance: {
        sourceType: 'MODELED',
        confidence: 'MEDIUM',
        sourceReference: 'VAJRA',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
    };
    const polygon = Building3DExtruder.generateExtrusionPolygon(pointBldg);
    assert(polygon.length === 5, 'Point building expanded to 5-vertex closed polygon ring');
    assert(polygon[0][0] === polygon[4][0] && polygon[0][1] === polygon[4][1], 'Extrusion ring is strictly closed');
  }

  // ─── 5. Blackout Intensity Derivation ───────────────────────────────
  console.log('─── 5. Blackout Intensity Derivation ───');
  {
    assert(COLOR_PALETTES.NIGHT.ILLUMINATED.dimmingFactor === 0.0, 'ILLUMINATED dimming factor is 0%');
    assert(COLOR_PALETTES.NIGHT.GRID_STRESS.dimmingFactor === 0.25, 'GRID_STRESS dimming factor is 25%');
    assert(COLOR_PALETTES.NIGHT.ESTIMATED_OUTAGE.dimmingFactor === 0.60, 'ESTIMATED_OUTAGE dimming factor is 60%');
    assert(COLOR_PALETTES.NIGHT.SEVERE_BLACKOUT.dimmingFactor === 0.90, 'SEVERE_BLACKOUT dimming factor is 90%');
    assert(COLOR_PALETTES.NIGHT.RECOVERING.dimmingFactor === 0.15, 'RECOVERING dimming factor is 15%');
  }

  // ─── 6. Normal-State Rendering State ────────────────────────────────
  console.log('─── 6. Normal-State Rendering State ───');
  {
    const bldg: Building = {
      id: 'bldg-delhi-1',
      name: 'Commercial Complex',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'COMMERCIAL',
      coordinates: { latitude: 28.61, longitude: 77.21 },
      inferredFeederSubstationId: 'sub-1',
      estimatedPeakDemandMW: 1.5,
      isCriticalPowerCustomer: false,
      provenance: {
        sourceType: 'VERIFIED_EXTERNAL',
        confidence: 'HIGH',
        sourceReference: 'Ref',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: true,
      },
    };

    const mockRegion: EstimatedServiceRegion = {
      id: 'reg-1',
      substationId: 'sub-1',
      substationName: 'North Substation',
      centerCoordinates: { latitude: 28.61, longitude: 77.21 },
      boundaryPolygon: [],
      areaSqKm: 12,
      associatedLoadIds: [],
      totalEstimatedDemandMW: 120,
      determinationMethod: 'VORONOI_PROXIMITY',
      isVerifiedFeederTerritory: false,
      provenance: {
        sourceType: 'MODELED',
        confidence: 'MEDIUM',
        sourceReference: 'Spatial',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
      disclaimer: 'Spatial proximity estimate',
    };

    const mockImpact: GeoSimulationImpact = {
      tick: 1,
      timestamp: '2026-10-04T12:00:00Z',
      totalCityDemandMW: 120,
      totalCityServedMW: 120,
      totalCityUnservedMW: 0,
      cityServiceFraction: 1.0,
      blackoutZoneCount: 0,
      criticalFacilitiesAtRisk: 0,
      serviceRegionImpacts: {
        'reg-1': {
          regionId: 'reg-1',
          substationId: 'sub-1',
          substationName: 'North Substation',
          substationStatus: 'ONLINE',
          servedDemandMW: 120,
          unservedDemandMW: 0,
          totalDemandMW: 120,
          blackoutFraction: 0.0,
          blackoutState: 'NORMAL',
          affectedConsumerCount: 0,
          criticalFacilitiesAffectedCount: 0,
          powerQualityIndex: 1.0,
        },
      },
      criticalInfraStatus: {},
      corridorImpacts: {},
      latestCascadeSteps: [],
    };

    const visual = Building3DExtruder.deriveBlackoutVisual(bldg, mockImpact, [mockRegion]);
    assert(visual.blackoutCategory === 'ILLUMINATED', 'Normal state derives ILLUMINATED category');
    assert(visual.dimmingFactor === 0.0, 'Normal state has 0.0 dimming factor');
    assert(visual.colorHex === COLOR_PALETTES.NIGHT.ILLUMINATED.color, 'Uses nocturnal illuminated building color');
  }

  // ─── 7. Stressed-State Rendering State ──────────────────────────────
  console.log('─── 7. Stressed-State Rendering State ───');
  {
    const bldg: Building = {
      id: 'bldg-stress',
      name: 'Tech Center',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'COMMERCIAL',
      coordinates: { latitude: 28.61, longitude: 77.21 },
      inferredFeederSubstationId: 'sub-stress',
      estimatedPeakDemandMW: 2.0,
      isCriticalPowerCustomer: false,
      provenance: {
        sourceType: 'MODELED',
        confidence: 'MEDIUM',
        sourceReference: 'Ref',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
    };
    const region: EstimatedServiceRegion = {
      id: 'reg-stress',
      substationId: 'sub-stress',
      substationName: 'Stressed Substation',
      centerCoordinates: { latitude: 28.61, longitude: 77.21 },
      boundaryPolygon: [],
      areaSqKm: 10,
      associatedLoadIds: [],
      totalEstimatedDemandMW: 100,
      determinationMethod: 'VORONOI_PROXIMITY',
      isVerifiedFeederTerritory: false,
      provenance: {
        sourceType: 'MODELED',
        confidence: 'MEDIUM',
        sourceReference: 'Spatial',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
      disclaimer: 'Spatial',
    };
    const impact: GeoSimulationImpact = {
      tick: 2,
      timestamp: '2026-10-04T12:00:01Z',
      totalCityDemandMW: 100,
      totalCityServedMW: 100,
      totalCityUnservedMW: 0,
      cityServiceFraction: 1.0,
      blackoutZoneCount: 0,
      criticalFacilitiesAtRisk: 0,
      serviceRegionImpacts: {
        'reg-stress': {
          regionId: 'reg-stress',
          substationId: 'sub-stress',
          substationName: 'Stressed Substation',
          substationStatus: 'WARNING',
          servedDemandMW: 100,
          unservedDemandMW: 0,
          totalDemandMW: 100,
          blackoutFraction: 0.05,
          blackoutState: 'NORMAL',
          affectedConsumerCount: 50,
          criticalFacilitiesAffectedCount: 0,
          powerQualityIndex: 0.88, // Stressed voltage
        },
      },
      criticalInfraStatus: {},
      corridorImpacts: {},
      latestCascadeSteps: [],
    };
    const visual = Building3DExtruder.deriveBlackoutVisual(bldg, impact, [region]);
    assert(visual.blackoutCategory === 'GRID_STRESS', 'Voltage depression derives GRID_STRESS category');
    assert(visual.dimmingFactor === 0.25, 'GRID_STRESS has 0.25 dimming factor');
    assert(visual.colorHex === COLOR_PALETTES.NIGHT.GRID_STRESS.color, 'Applies amber stress color');
  }

  // ─── 8. Affected-State Rendering State ──────────────────────────────
  console.log('─── 8. Affected-State Rendering State ───');
  {
    const bldg: Building = {
      id: 'bldg-curtail',
      name: 'Residential Block C',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'RESIDENTIAL',
      coordinates: { latitude: 28.61, longitude: 77.21 },
      inferredFeederSubstationId: 'sub-curtail',
      estimatedPeakDemandMW: 1.0,
      isCriticalPowerCustomer: false,
      provenance: {
        sourceType: 'MODELED',
        confidence: 'MEDIUM',
        sourceReference: 'Ref',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
    };
    const region: EstimatedServiceRegion = {
      id: 'reg-curtail',
      substationId: 'sub-curtail',
      substationName: 'Curtailment Substation',
      centerCoordinates: { latitude: 28.61, longitude: 77.21 },
      boundaryPolygon: [],
      areaSqKm: 15,
      associatedLoadIds: [],
      totalEstimatedDemandMW: 80,
      determinationMethod: 'VORONOI_PROXIMITY',
      isVerifiedFeederTerritory: false,
      provenance: {
        sourceType: 'MODELED',
        confidence: 'MEDIUM',
        sourceReference: 'Spatial',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
      disclaimer: 'Spatial',
    };
    const impact: GeoSimulationImpact = {
      tick: 3,
      timestamp: '2026-10-04T12:00:02Z',
      totalCityDemandMW: 80,
      totalCityServedMW: 50,
      totalCityUnservedMW: 30,
      cityServiceFraction: 0.625,
      blackoutZoneCount: 1,
      criticalFacilitiesAtRisk: 0,
      serviceRegionImpacts: {
        'reg-curtail': {
          regionId: 'reg-curtail',
          substationId: 'sub-curtail',
          substationName: 'Curtailment Substation',
          substationStatus: 'WARNING',
          servedDemandMW: 50,
          unservedDemandMW: 30,
          totalDemandMW: 80,
          blackoutFraction: 0.375,
          blackoutState: 'PARTIAL_CURTAILMENT',
          affectedConsumerCount: 4500,
          criticalFacilitiesAffectedCount: 0,
          powerQualityIndex: 0.75,
        },
      },
      criticalInfraStatus: {},
      corridorImpacts: {},
      latestCascadeSteps: [],
    };
    const visual = Building3DExtruder.deriveBlackoutVisual(bldg, impact, [region]);
    assert(visual.blackoutCategory === 'ESTIMATED_OUTAGE', 'Partial curtailment derives ESTIMATED_OUTAGE category');
    assert(visual.dimmingFactor === 0.60, 'ESTIMATED_OUTAGE has 0.60 dimming factor');
  }

  // ─── 9. Unserved-State Rendering State ──────────────────────────────
  console.log('─── 9. Unserved-State Rendering State ───');
  {
    const bldg: Building = {
      id: 'bldg-blackout',
      name: 'Downtown Commercial',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'COMMERCIAL',
      coordinates: { latitude: 28.61, longitude: 77.21 },
      inferredFeederSubstationId: 'sub-blackout',
      estimatedPeakDemandMW: 2.0,
      isCriticalPowerCustomer: false,
      provenance: {
        sourceType: 'MODELED',
        confidence: 'MEDIUM',
        sourceReference: 'Ref',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
    };
    const region: EstimatedServiceRegion = {
      id: 'reg-blackout',
      substationId: 'sub-blackout',
      substationName: 'Blackout Substation',
      centerCoordinates: { latitude: 28.61, longitude: 77.21 },
      boundaryPolygon: [],
      areaSqKm: 15,
      associatedLoadIds: [],
      totalEstimatedDemandMW: 100,
      determinationMethod: 'VORONOI_PROXIMITY',
      isVerifiedFeederTerritory: false,
      provenance: {
        sourceType: 'MODELED',
        confidence: 'MEDIUM',
        sourceReference: 'Spatial',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
      disclaimer: 'Spatial',
    };
    const impact: GeoSimulationImpact = {
      tick: 4,
      timestamp: '2026-10-04T12:00:03Z',
      totalCityDemandMW: 100,
      totalCityServedMW: 0,
      totalCityUnservedMW: 100,
      cityServiceFraction: 0.0,
      blackoutZoneCount: 1,
      criticalFacilitiesAtRisk: 1,
      serviceRegionImpacts: {
        'reg-blackout': {
          regionId: 'reg-blackout',
          substationId: 'sub-blackout',
          substationName: 'Blackout Substation',
          substationStatus: 'FAILED',
          servedDemandMW: 0,
          unservedDemandMW: 100,
          totalDemandMW: 100,
          blackoutFraction: 1.0,
          blackoutState: 'TOTAL_BLACKOUT',
          affectedConsumerCount: 20000,
          criticalFacilitiesAffectedCount: 1,
          powerQualityIndex: 0.0,
        },
      },
      criticalInfraStatus: {},
      corridorImpacts: {},
      latestCascadeSteps: [],
    };
    const visual = Building3DExtruder.deriveBlackoutVisual(bldg, impact, [region]);
    assert(visual.blackoutCategory === 'SEVERE_BLACKOUT', 'Total blackout derives SEVERE_BLACKOUT category');
    assert(visual.dimmingFactor === 0.90, 'SEVERE_BLACKOUT has 0.90 dimming factor');
    assert(visual.opacity === COLOR_PALETTES.NIGHT.SEVERE_BLACKOUT.opacity, 'Opacity reduces to deep dark blackout');
  }

  // ─── 10. Recovering-State Rendering State ───────────────────────────
  console.log('─── 10. Recovering-State Rendering State ───');
  {
    const bldg: Building = {
      id: 'bldg-rec',
      name: 'North Hospital Wing',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'HEALTHCARE',
      coordinates: { latitude: 28.61, longitude: 77.21 },
      inferredFeederSubstationId: 'sub-rec',
      estimatedPeakDemandMW: 1.5,
      isCriticalPowerCustomer: true,
      provenance: {
        sourceType: 'MODELED',
        confidence: 'MEDIUM',
        sourceReference: 'Ref',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
    };
    const region: EstimatedServiceRegion = {
      id: 'reg-rec',
      substationId: 'sub-rec',
      substationName: 'Restoring Substation',
      centerCoordinates: { latitude: 28.61, longitude: 77.21 },
      boundaryPolygon: [],
      areaSqKm: 12,
      associatedLoadIds: [],
      totalEstimatedDemandMW: 100,
      determinationMethod: 'VORONOI_PROXIMITY',
      isVerifiedFeederTerritory: false,
      provenance: {
        sourceType: 'MODELED',
        confidence: 'MEDIUM',
        sourceReference: 'Spatial',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
      disclaimer: 'Spatial',
    };
    const impact: GeoSimulationImpact = {
      tick: 5,
      timestamp: '2026-10-04T12:00:04Z',
      totalCityDemandMW: 100,
      totalCityServedMW: 80,
      totalCityUnservedMW: 20,
      cityServiceFraction: 0.8,
      blackoutZoneCount: 0,
      criticalFacilitiesAtRisk: 0,
      serviceRegionImpacts: {
        'reg-rec': {
          regionId: 'reg-rec',
          substationId: 'sub-rec',
          substationName: 'Restoring Substation',
          substationStatus: 'RECOVERING',
          servedDemandMW: 80,
          unservedDemandMW: 20,
          totalDemandMW: 100,
          blackoutFraction: 0.2,
          blackoutState: 'PARTIAL_CURTAILMENT',
          affectedConsumerCount: 1000,
          criticalFacilitiesAffectedCount: 0,
          powerQualityIndex: 0.92,
        },
      },
      criticalInfraStatus: {},
      corridorImpacts: {},
      latestCascadeSteps: [],
    };
    const visual = Building3DExtruder.deriveBlackoutVisual(bldg, impact, [region]);
    assert(visual.blackoutCategory === 'RECOVERING', 'Restoring substation derives RECOVERING category');
    assert(visual.dimmingFactor === 0.15, 'RECOVERING has 0.15 dimming factor');
    assert(visual.uncertaintyLabel.includes('Restoration In Progress'), 'Uncertainty label reflects active restoration');
  }

  // ─── 11. Simulation -> Blackout Synchronization ────────────────────
  console.log('─── 11. Simulation -> Blackout Synchronization ───');
  {
    const store = useVajraStore.getState();
    store.initialize(42);
    await store.selectGeoCity('city-delhi');
    const demoProvider = new DeterministicGeoDataProvider();
    const pkg = await demoProvider.loadCityTwin('city-delhi');
    assert(pkg !== null && pkg.buildings.length > 0, 'Loaded Delhi city twin packages');

    const geoTwin = useVajraStore.getState().geoTwin!;
    const impactInitial = GeoSimulationCoordinator.computeGeoSimulationImpact(
      useVajraStore.getState().topology,
      geoTwin,
      pkg!.criticalInfrastructure,
      null,
      1,
    );

    // Initial state: illuminated
    const initialVisuals = Building3DExtruder.deriveCityVisualState(
      pkg!.city.id,
      pkg!.city.name,
      pkg!.buildings,
      impactInitial,
      geoTwin.serviceRegions,
    );
    assert(initialVisuals.blackoutCount === 0, 'Initial city state has 0 blackout buildings');
    assert(initialVisuals.illuminatedCount > 0, 'Initial city state has illuminated buildings');

    // Trigger failure in electrical network
    const targetRegion = geoTwin.serviceRegions[0];
    store.injectGeoFault(targetRegion.id, 'SUBSTATION_FAILURE');

    const impactFailed = GeoSimulationCoordinator.computeGeoSimulationImpact(
      useVajraStore.getState().topology,
      useVajraStore.getState().geoTwin!,
      pkg!.criticalInfrastructure,
      useVajraStore.getState().activeCascade,
      2,
    );
    const failedVisuals = Building3DExtruder.deriveCityVisualState(
      pkg!.city.id,
      pkg!.city.name,
      pkg!.buildings,
      impactFailed,
      geoTwin.serviceRegions,
    );
    assert(
      failedVisuals.blackoutCount > 0 || failedVisuals.outageCount > 0 || failedVisuals.stressedCount > 0,
      'Simulation failure directly propagates to geographic building dimming',
    );
  }

  // ─── 12. Cascade -> Geographic Impact Synchronization ──────────────
  console.log('─── 12. Cascade -> Geographic Impact Synchronization ───');
  {
    const store = useVajraStore.getState();
    store.initialize(42);
    await store.selectGeoCity('city-delhi');
    const demoProvider = new DeterministicGeoDataProvider();
    const pkg = await demoProvider.loadCityTwin('city-delhi');

    const targetSub = useVajraStore.getState().topology.substations[0];
    const mockCascade = {
      id: 'casc-1',
      timestamp: '2026-10-04T12:00:00Z',
      totalSteps: 1,
      totalLoadShedMW: 100,
      affectedSubstations: [targetSub.id],
      affectedTransmissionLines: [],
      isStable: true,
      steps: [
        {
          stepIndex: 1,
          tick: 1,
          timestamp: '2026-10-04T12:00:00Z',
          action: 'PRIMARY_TRIP',
          triggerAssetId: targetSub.id,
          triggerAssetName: targetSub.name,
          triggerReason: 'Overcurrent',
          affectedAssetId: targetSub.id,
          affectedAssetName: targetSub.name,
          consequence: 'De-energized',
          loadRedistributedMW: 100,
          unservedLoadMW: 100,
          affectedConsumers: 5000,
          gridFrequencyAfterHz: 49.8,
        },
      ],
    };

    const impact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      useVajraStore.getState().topology,
      useVajraStore.getState().geoTwin!,
      pkg!.criticalInfrastructure,
      mockCascade as any,
      1,
    );

    assert(impact.latestCascadeSteps.length > 0, 'Mapped cascade steps to geographic spatial coordinates');
    assert(impact.latestCascadeSteps[0].triggerAssetId === targetSub.id, 'Spatial step preserves trigger electrical asset ID');
  }

  // ─── 13. Recovery -> Illumination Restoration ──────────────────────
  console.log('─── 13. Recovery -> Illumination Restoration ───');
  {
    const store = useVajraStore.getState();
    store.initialize(42);
    await store.selectGeoCity('city-delhi');
    const demoProvider = new DeterministicGeoDataProvider();
    const pkg = await demoProvider.loadCityTwin('city-delhi');

    // Fail first substation via geo interface
    const targetRegion = useVajraStore.getState().geoTwin!.serviceRegions[0];
    store.injectGeoFault(targetRegion.id, 'SUBSTATION_FAILURE');

    const failedImpact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      useVajraStore.getState().topology,
      useVajraStore.getState().geoTwin!,
      pkg!.criticalInfrastructure,
      null,
      2,
    );
    const postFail = Building3DExtruder.deriveCityVisualState(
      pkg!.city.id,
      pkg!.city.name,
      pkg!.buildings,
      failedImpact,
      useVajraStore.getState().geoTwin!.serviceRegions,
    );

    // Execute recovery
    store.reset();
    await store.selectGeoCity('city-delhi');
    const recoveredImpact = GeoSimulationCoordinator.computeGeoSimulationImpact(
      useVajraStore.getState().topology,
      useVajraStore.getState().geoTwin!,
      pkg!.criticalInfrastructure,
      null,
      3,
    );
    const postRecover = Building3DExtruder.deriveCityVisualState(
      pkg!.city.id,
      pkg!.city.name,
      pkg!.buildings,
      recoveredImpact,
      useVajraStore.getState().geoTwin!.serviceRegions,
    );

    assert(postRecover.averageDimming < postFail.averageDimming || postRecover.blackoutCount === 0, 'Recovery restores full geographic illumination');
  }

  // ─── 14. Critical Infrastructure Uncertainty ───────────────────────
  console.log('─── 14. Critical Infrastructure Uncertainty ───');
  {
    const hospitalBldg: Building = {
      id: 'infra-hosp-1',
      name: 'AIIMS Emergency Medical Center',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'HEALTHCARE',
      coordinates: { latitude: 28.5672, longitude: 77.21 },
      heightMeters: 32,
      estimatedPeakDemandMW: 3.5,
      isCriticalPowerCustomer: true,
      inferredFeederSubstationId: 'sub-blackout',
      provenance: {
        sourceType: 'VERIFIED_EXTERNAL',
        confidence: 'HIGH',
        sourceReference: 'Survey',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: true,
      },
    };

    const criticalHospital: CriticalInfrastructure = {
      id: 'infra-hosp-1',
      name: 'AIIMS Emergency Medical Center',
      entityType: 'CRITICAL_INFRASTRUCTURE',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      infraType: 'HOSPITAL',
      coordinates: { latitude: 28.5672, longitude: 77.21 },
      priorityTier: 'TIER_1_LIFE_SAFETY',
      emergencyBackupGenerationMW: 4.0,
      requiresDualFeed: true,
      provenance: {
        sourceType: 'VERIFIED_EXTERNAL',
        confidence: 'HIGH',
        sourceReference: 'Health Dept',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: true,
      },
    };

    const impactWithBackup: GeoSimulationImpact = {
      tick: 6,
      timestamp: '2026-10-04T12:00:05Z',
      totalCityDemandMW: 100,
      totalCityServedMW: 0,
      totalCityUnservedMW: 100,
      cityServiceFraction: 0.0,
      blackoutZoneCount: 1,
      criticalFacilitiesAtRisk: 1,
      serviceRegionImpacts: {
        'reg-blackout': {
          regionId: 'reg-blackout',
          substationId: 'sub-blackout',
          substationName: 'Blackout Substation',
          substationStatus: 'FAILED',
          servedDemandMW: 0,
          unservedDemandMW: 100,
          totalDemandMW: 100,
          blackoutFraction: 1.0,
          blackoutState: 'TOTAL_BLACKOUT',
          affectedConsumerCount: 20000,
          criticalFacilitiesAffectedCount: 1,
          powerQualityIndex: 0.0,
        },
      },
      criticalInfraStatus: {
        'infra-hosp-1': {
          infraId: 'infra-hosp-1',
          infraName: 'AIIMS Emergency Medical Center',
          infraType: 'HOSPITAL',
          priorityTier: 'TIER_1_LIFE_SAFETY',
          powerSupplyState: 'BACKUP_ACTIVE',
          backupGenerationMW: 4.0,
          backupCoveragePercent: 100,
          coordinates: hospitalBldg.coordinates,
        },
      },
      corridorImpacts: {},
      latestCascadeSteps: [],
    };

    const visual = Building3DExtruder.deriveBlackoutVisual(
      hospitalBldg,
      impactWithBackup,
      [],
      [criticalHospital],
    );

    assert(visual.criticalBackupActive === true, 'Critical facility with active generator flags criticalBackupActive = true');
    assert(visual.dimmingFactor < 0.5, 'Critical facility on backup is NOT blacked out (dimming < 50%)');
    assert(visual.uncertaintyLabel.includes('EMERGENCY BACKUP ACTIVE'), 'Uncertainty label specifies emergency backup active');
  }

  // ─── 15. City-Independent Behavior ─────────────────────────────────
  console.log('─── 15. City-Independent Behavior ───');
  {
    const realProvider = new RealGeoDataProvider();
    for (const cityMeta of Object.values(VERIFIED_INDIAN_CITIES)) {
      const pkg = await realProvider.loadCityTwin(cityMeta.id);
      assert(pkg !== null, `Successfully loaded city package for ${cityMeta.name}`);
      assert(pkg!.buildings.length >= 0, `${cityMeta.name} buildings array accessible`);

      const fc = Building3DExtruder.buildGeoJSONFeatureCollection(pkg!.buildings);
      assert(fc.type === 'FeatureCollection', `Generated valid GeoJSON FeatureCollection for ${cityMeta.name}`);
      assert(fc.features.length === pkg!.buildings.length, `Feature count matches building count for ${cityMeta.name}`);
    }
  }

  // ─── 16. City Switching ─────────────────────────────────────────────
  console.log('─── 16. City Switching ───');
  {
    const store = useVajraStore.getState();

    // Select Mumbai
    await store.selectGeoCity('city-mumbai');
    assert(useVajraStore.getState().geoTwin?.selectedCity?.id === 'city-mumbai', 'Selected city set to Mumbai');

    // Select Bengaluru
    await store.selectGeoCity('city-bengaluru');
    assert(useVajraStore.getState().geoTwin?.selectedCity?.id === 'city-bengaluru', 'Selected city cleanly switched to Bengaluru');
  }

  // ─── 17. Reset Behavior ─────────────────────────────────────────────
  console.log('─── 17. Reset Behavior ───');
  {
    const store = useVajraStore.getState();
    store.reset();
    assert(store.clock.tick === 0, 'Simulation clock reset to 0');
    assert(store.metrics.failedAssetCount === 0, 'Failed asset count reset to 0');
  }

  // ─── 18. Stale State Prevention ─────────────────────────────────────
  console.log('─── 18. Stale State Prevention ───');
  {
    const resolver = new CityResolver([new DeterministicGeoDataProvider()]);
    const tokenBefore = resolver.getCurrentGenerationToken();
    await resolver.resolveLocation('delhi');
    const tokenAfter = resolver.getCurrentGenerationToken();
    assert(tokenAfter > tokenBefore, 'Async operations increment requestGenerationToken to reject stale responses');
  }

  // ─── 19. Reduced-Motion Behavior ───────────────────────────────────
  console.log('─── 19. Reduced-Motion Behavior ───');
  {
    const bldg: Building = {
      id: 'bldg-rm',
      name: 'Accessible Complex',
      entityType: 'BUILDING',
      scaleLevel: 'BUILDING_INFRASTRUCTURE',
      usageType: 'COMMERCIAL',
      coordinates: { latitude: 28.61, longitude: 77.21 },
      estimatedPeakDemandMW: 1.0,
      isCriticalPowerCustomer: false,
      provenance: {
        sourceType: 'MODELED',
        confidence: 'MEDIUM',
        sourceReference: 'Ref',
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
      },
    };
    const cityState = Building3DExtruder.deriveCityVisualState(
      'city-test',
      'Test City',
      [bldg],
      undefined,
      undefined,
      undefined,
      true,
      true, // reducedMotion
    );
    assert(cityState.reducedMotion === true, 'Preserves reduced motion preference flag');
  }

  // ─── 20. Existing Task 18 Regression Behavior ──────────────────────
  console.log('─── 20. Existing Task 18 Regression Behavior ───');
  {
    const store = useVajraStore.getState();
    assert(typeof store.searchGeoCities === 'function', 'store.searchGeoCities exists');
    assert(typeof store.selectGeoEntity === 'function', 'store.selectGeoEntity exists');
    assert(typeof store.toggleGeoLayer === 'function', 'store.toggleGeoLayer exists');

    const adapter = new MapEngineAdapter();
    assert(typeof adapter.flyToCity === 'function', 'MapEngineAdapter.flyToCity exists');
    assert(typeof adapter.setBuilding3DExtrusion === 'function', 'MapEngineAdapter.setBuilding3DExtrusion exists');
    assert(typeof adapter.setNightMode === 'function', 'MapEngineAdapter.setNightMode exists');
    assert(typeof adapter.update3DBuildings === 'function', 'MapEngineAdapter.update3DBuildings exists');
  }

  console.log(`\n══════════════════════════════════════════════════════`);
  console.log(`TASK 19 TESTS COMPLETE: ${passed} passed, ${failed} failed`);
  console.log(`══════════════════════════════════════════════════════\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTask19Tests().catch((err) => {
  console.error('Task 19 tests uncaught exception:', err);
  process.exit(1);
});
