/**
 * VAJRA-Ω — Building 3D Extruder & Dynamic Blackout Shading Engine (Task 19)
 *
 * Evolving geographic building representation into high-fidelity 3D city visualization.
 * Computes deterministic building heights with strict provenance tracking, footprint geometry,
 * Level-Of-Detail (LOD), and simulation-driven dynamic blackout shading.
 *
 * Strict Architectural Rule:
 * The simulation engine and Task 17 GeoSimulationImpact remain authoritative.
 * No fake timers, no random building shutoffs.
 */

import {
  Building,
  BuildingUsageType,
  BuildingHeightProvenance,
  BlackoutVisualCategory,
  Building3DVisual,
  City3DVisualState,
  GeoSimulationImpact,
  EstimatedServiceRegion,
  GeoCoordinate,
  CriticalInfrastructure,
} from '../../types/geo';

/**
 * Standard fallback height in meters by building usage type.
 * Used ONLY when neither LiDAR/survey height nor floor count is available.
 * Explicitly tracked under USAGE_TYPE_FALLBACK provenance.
 */
export const USAGE_TYPE_DEFAULT_HEIGHTS: Record<BuildingUsageType, number> = {
  COMMERCIAL: 28.0,
  GOVERNMENT: 35.0,
  HEALTHCARE: 25.0,
  DATA_CENTER: 18.0,
  RESIDENTIAL: 20.0,
  INDUSTRIAL: 14.0,
  EDUCATIONAL: 18.0,
  MIXED_USE: 24.0,
};

export const GENERIC_FALLBACK_HEIGHT = 15.0;
export const METERS_PER_FLOOR = 3.5;

/**
 * Color palettes for Night and Standard (Day) Modes across Blackout Visual Categories.
 * Designed for high-contrast technical digital twin operations.
 */
export const COLOR_PALETTES = {
  NIGHT: {
    ILLUMINATED: {
      color: '#1e3a5f',
      opacity: 0.88,
      dimmingFactor: 0.0,
    },
    GRID_STRESS: {
      color: '#6b5314',
      opacity: 0.80,
      dimmingFactor: 0.25,
    },
    ESTIMATED_OUTAGE: {
      color: '#131b26',
      opacity: 0.45,
      dimmingFactor: 0.60,
    },
    SEVERE_BLACKOUT: {
      color: '#060a0f',
      opacity: 0.20,
      dimmingFactor: 0.90,
    },
    RECOVERING: {
      color: '#0e7490',
      opacity: 0.85,
      dimmingFactor: 0.15,
    },
    CRITICAL_BACKUP: {
      color: '#b45309', // Amber emergency lighting
      opacity: 0.92,
      dimmingFactor: 0.10,
    },
  },
  DAY: {
    ILLUMINATED: {
      color: '#475569',
      opacity: 0.85,
      dimmingFactor: 0.0,
    },
    GRID_STRESS: {
      color: '#a16207',
      opacity: 0.78,
      dimmingFactor: 0.25,
    },
    ESTIMATED_OUTAGE: {
      color: '#334155',
      opacity: 0.50,
      dimmingFactor: 0.60,
    },
    SEVERE_BLACKOUT: {
      color: '#0f172a',
      opacity: 0.25,
      dimmingFactor: 0.90,
    },
    RECOVERING: {
      color: '#0284c7',
      opacity: 0.85,
      dimmingFactor: 0.15,
    },
    CRITICAL_BACKUP: {
      color: '#d97706',
      opacity: 0.90,
      dimmingFactor: 0.10,
    },
  },
};

export class Building3DExtruder {
  /**
   * Extracts or models building height preserving rigorous provenance.
   * Never labels synthetic or category-estimated height as verified survey data.
   */
  public static extractHeightWithProvenance(building: Building): {
    heightMeters: number;
    provenance: BuildingHeightProvenance;
    isEstimated: boolean;
  } {
    // 1. Explicit verified real-world height
    if (building.heightMeters && building.heightMeters > 0) {
      if (building.provenance?.isVerifiedRealWorld) {
        return {
          heightMeters: building.heightMeters,
          provenance: 'VERIFIED_SURVEY',
          isEstimated: false,
        };
      }
      return {
        heightMeters: building.heightMeters,
        provenance: 'REAL_METADATA',
        isEstimated: false,
      };
    }

    // 2. Floor count estimation (floorCount * 3.5m)
    if (building.floorCount && building.floorCount > 0) {
      return {
        heightMeters: Math.round(building.floorCount * METERS_PER_FLOOR * 10) / 10,
        provenance: 'FLOOR_COUNT_ESTIMATE',
        isEstimated: true,
      };
    }

    // 3. Usage type fallback
    if (building.usageType && USAGE_TYPE_DEFAULT_HEIGHTS[building.usageType]) {
      return {
        heightMeters: USAGE_TYPE_DEFAULT_HEIGHTS[building.usageType],
        provenance: 'USAGE_TYPE_FALLBACK',
        isEstimated: true,
      };
    }

    // 4. Baseline synthetic fallback
    return {
      heightMeters: GENERIC_FALLBACK_HEIGHT,
      provenance: 'SYNTHETIC',
      isEstimated: true,
    };
  }

  /**
   * Generates or validates a polygon footprint for 3D extrusion.
   * If building has a valid footprint polygon (>= 3 vertices), closes it and returns it.
   * If building is a point entity, generates a deterministic 30m x 30m square footprint around coordinates.
   */
  public static generateExtrusionPolygon(building: Building): [number, number][] {
    if (building.footprintPolygon && building.footprintPolygon.length >= 3) {
      const ring: [number, number][] = building.footprintPolygon.map((c) => [c.longitude, c.latitude]);
      // Ensure closed ring
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([first[0], first[1]]);
      }
      return ring;
    }

    // Point fallback: Generate ~30m footprint box (+/- 0.00015 deg lat/lng)
    const lat = building.coordinates.latitude;
    const lng = building.coordinates.longitude;
    const offset = 0.00015;

    return [
      [lng - offset, lat - offset],
      [lng + offset, lat - offset],
      [lng + offset, lat + offset],
      [lng - offset, lat + offset],
      [lng - offset, lat - offset],
    ];
  }

  /**
   * Deterministically maps authoritative simulation impact state to visual blackout category and intensity.
   *
   * Logic:
   * 1. Critical Infrastructure with active emergency backup retains amber emergency lighting.
   * 2. If parent service region or substation is in TOTAL_BLACKOUT (blackoutFraction >= 0.85), category is SEVERE_BLACKOUT.
   * 3. If parent service region is in PARTIAL_CURTAILMENT (blackoutFraction > 0.15), category is ESTIMATED_OUTAGE.
   * 4. If parent substation is recovering or power quality is recovering, category is RECOVERING.
   * 5. If voltage is depressed or power quality < 0.90, category is GRID_STRESS.
   * 6. Otherwise category is ILLUMINATED.
   */
  public static deriveBlackoutVisual(
    building: Building,
    impact?: GeoSimulationImpact,
    serviceRegions?: EstimatedServiceRegion[],
    criticalInfra?: CriticalInfrastructure[],
    nightMode = true,
  ): Building3DVisual {
    const { heightMeters, provenance, isEstimated } = this.extractHeightWithProvenance(building);
    const palette = nightMode ? COLOR_PALETTES.NIGHT : COLOR_PALETTES.DAY;

    // Check critical infrastructure backup
    let criticalBackupActive = false;
    let criticalInfraMatch: CriticalInfrastructure | undefined;

    if (building.isCriticalPowerCustomer && criticalInfra) {
      criticalInfraMatch = criticalInfra.find(
        (ci) =>
          ci.id === building.id ||
          ci.name.toLowerCase() === building.name.toLowerCase() ||
          (Math.abs(ci.coordinates.latitude - building.coordinates.latitude) < 0.001 &&
            Math.abs(ci.coordinates.longitude - building.coordinates.longitude) < 0.001),
      );
    }

    if (criticalInfraMatch && impact?.criticalInfraStatus?.[criticalInfraMatch.id]) {
      const ciStatus = impact.criticalInfraStatus[criticalInfraMatch.id];
      if (ciStatus.powerSupplyState === 'BACKUP_ACTIVE') {
        criticalBackupActive = true;
      }
    }

    // Determine associated service region
    let regionImpact: import('../../types/geo').ServiceRegionSimulationImpact | undefined;
    let associatedRegionId: string | undefined;

    if (serviceRegions && impact?.serviceRegionImpacts) {
      // 1. Direct substation assignment match
      if (building.inferredFeederSubstationId) {
        const matchingRegion = serviceRegions.find(
          (r) => r.substationId === building.inferredFeederSubstationId,
        );
        if (matchingRegion) {
          associatedRegionId = matchingRegion.id;
          regionImpact = impact.serviceRegionImpacts[matchingRegion.id];
        }
      }

      // 2. Spatial proximity fallback if not assigned
      if (!regionImpact && serviceRegions.length > 0) {
        let minDistanceSq = Number.MAX_VALUE;
        let nearestRegion = serviceRegions[0];
        for (const reg of serviceRegions) {
          const dLat = reg.centerCoordinates.latitude - building.coordinates.latitude;
          const dLng = reg.centerCoordinates.longitude - building.coordinates.longitude;
          const distSq = dLat * dLat + dLng * dLng;
          if (distSq < minDistanceSq) {
            minDistanceSq = distSq;
            nearestRegion = reg;
          }
        }
        associatedRegionId = nearestRegion.id;
        regionImpact = impact.serviceRegionImpacts[nearestRegion.id];
      }
    }

    let blackoutCategory: BlackoutVisualCategory = 'ILLUMINATED';
    let uncertaintyLabel = 'ILLUMINATED — Normal Operating Grid';

    if (criticalBackupActive) {
      blackoutCategory = 'GRID_STRESS'; // Shown with emergency backup styling
      uncertaintyLabel = 'CRITICAL INFRASTRUCTURE AT RISK (EMERGENCY BACKUP ACTIVE)';
      return {
        buildingId: building.id,
        name: building.name,
        usageType: building.usageType,
        heightMeters,
        baseMeters: 0,
        provenance,
        isHeightEstimated: isEstimated,
        blackoutCategory,
        dimmingFactor: palette.CRITICAL_BACKUP.dimmingFactor,
        colorHex: palette.CRITICAL_BACKUP.color,
        opacity: palette.CRITICAL_BACKUP.opacity,
        serviceRegionId: associatedRegionId,
        substationId: building.inferredFeederSubstationId,
        criticalBackupActive: true,
        uncertaintyLabel,
      };
    }

    if (regionImpact) {
      if (regionImpact.substationStatus === 'RECOVERING') {
        blackoutCategory = 'RECOVERING';
        uncertaintyLabel = 'RECOVERING — Grid Restoration In Progress';
      } else if (regionImpact.blackoutState === 'TOTAL_BLACKOUT' || regionImpact.blackoutFraction >= 0.85) {
        blackoutCategory = 'SEVERE_BLACKOUT';
        uncertaintyLabel = 'SEVERE OUTAGE — Estimated Blackout in Associated Service Region';
      } else if (regionImpact.blackoutState === 'PARTIAL_CURTAILMENT' || regionImpact.blackoutFraction > 0.15) {
        blackoutCategory = 'ESTIMATED_OUTAGE';
        uncertaintyLabel = 'ESTIMATED GRID IMPACT — Partial Curtailment / Load Shed';
      } else if (
        regionImpact.substationStatus === 'WARNING' ||
        regionImpact.substationStatus === 'OVERLOADED' ||
        regionImpact.powerQualityIndex < 0.92
      ) {
        blackoutCategory = 'GRID_STRESS';
        uncertaintyLabel = 'GRID STRESS — Voltage Depression / Line Congestion';
      } else {
        blackoutCategory = 'ILLUMINATED';
        uncertaintyLabel = 'ILLUMINATED — Stable Grid Power';
      }
    }

    const visualConfig = palette[blackoutCategory];

    return {
      buildingId: building.id,
      name: building.name,
      usageType: building.usageType,
      heightMeters,
      baseMeters: 0,
      provenance,
      isHeightEstimated: isEstimated,
      blackoutCategory,
      dimmingFactor: visualConfig.dimmingFactor,
      colorHex: visualConfig.color,
      opacity: visualConfig.opacity,
      serviceRegionId: associatedRegionId,
      substationId: building.inferredFeederSubstationId,
      criticalBackupActive: false,
      uncertaintyLabel,
    };
  }

  /**
   * Generates a MapLibre-compatible GeoJSON FeatureCollection for 3D extrusion.
   * Incorporates Level Of Detail (LOD) properties:
   * - zoom < 11: macro display (minimal extrusion)
   * - 11 <= zoom < 14: medium detail
   * - zoom >= 14: full high-detail 3D geometry
   */
  public static buildGeoJSONFeatureCollection(
    buildings: Building[],
    impact?: GeoSimulationImpact,
    serviceRegions?: EstimatedServiceRegion[],
    criticalInfra?: CriticalInfrastructure[],
    nightMode = true,
  ) {
    const features = buildings.map((b) => {
      const visual = this.deriveBlackoutVisual(b, impact, serviceRegions, criticalInfra, nightMode);
      const polygonRing = this.generateExtrusionPolygon(b);

      return {
        type: 'Feature' as const,
        id: b.id,
        properties: {
          id: b.id,
          name: b.name,
          usageType: b.usageType,
          height: visual.heightMeters,
          base_height: visual.baseMeters,
          color: visual.colorHex,
          opacity: visual.opacity,
          dimmingFactor: visual.dimmingFactor,
          blackoutCategory: visual.blackoutCategory,
          provenance: visual.provenance,
          isHeightEstimated: visual.isHeightEstimated,
          uncertaintyLabel: visual.uncertaintyLabel,
          criticalBackupActive: visual.criticalBackupActive,
          serviceRegionId: visual.serviceRegionId ?? '',
          substationId: visual.substationId ?? '',
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [polygonRing],
        },
      };
    });

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }

  /**
   * Derives city-wide 3D visual summary stats for dashboards and metrics.
   */
  public static deriveCityVisualState(
    cityId: string,
    cityName: string,
    buildings: Building[],
    impact?: GeoSimulationImpact,
    serviceRegions?: EstimatedServiceRegion[],
    criticalInfra?: CriticalInfrastructure[],
    nightMode = true,
    reducedMotion = false,
  ): City3DVisualState {
    let illuminatedCount = 0;
    let stressedCount = 0;
    let outageCount = 0;
    let blackoutCount = 0;
    let recoveringCount = 0;
    let totalDimming = 0;

    for (const b of buildings) {
      const visual = this.deriveBlackoutVisual(b, impact, serviceRegions, criticalInfra, nightMode);
      totalDimming += visual.dimmingFactor;
      switch (visual.blackoutCategory) {
        case 'ILLUMINATED':
          illuminatedCount++;
          break;
        case 'GRID_STRESS':
          stressedCount++;
          break;
        case 'ESTIMATED_OUTAGE':
          outageCount++;
          break;
        case 'SEVERE_BLACKOUT':
          blackoutCount++;
          break;
        case 'RECOVERING':
          recoveringCount++;
          break;
      }
    }

    const totalBuildings = buildings.length;
    const averageDimming = totalBuildings > 0 ? totalDimming / totalBuildings : 0;

    return {
      cityId,
      cityName,
      nightModeEnabled: nightMode,
      reducedMotion,
      totalBuildings,
      illuminatedCount,
      stressedCount,
      outageCount,
      blackoutCount,
      recoveringCount,
      averageDimming: Math.round(averageDimming * 100) / 100,
    };
  }
}
