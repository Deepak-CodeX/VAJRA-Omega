// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Geographic ↔ Electrical Network Mapper (Task 16)
// ═══════════════════════════════════════════════════════════════════════
// Bridges Real Geographic Infrastructure with VAJRA's Electrical Network Model.
//
// THREE SEPARATE GRAPHS PRINCIPLE:
//  - GRAPH A: Geographic Graph (Buildings, Roads, Infrastructure, Coordinates)
//  - GRAPH B: Electrical Graph (Generators, Substations, Lines, Transformers, Batteries, Loads)
//  - GRAPH C: Simulation State (Loading, Power Flow, Failures, Cascade, Recovery)
//
// These graphs are strictly separated and communicate through explicit mapping references.
// They are NEVER merged into a single graph.
//
// SCIENTIFIC INTEGRITY INVARIANT:
// Geographic proximity is an inference mechanism, NOT proof of electrical connectivity.
// Inferred matches are NEVER labeled as verified.
// ═══════════════════════════════════════════════════════════════════════

import type {
  GridTopology,
  Substation,
  TransmissionLine,
  Generator,
  Battery,
  Load,
} from '@/types';
import type {
  GeoCoordinate,
  GeoBoundingBox,
  GeoPowerAsset,
  Building,
  CriticalInfrastructure,
  City,
  ElectricalGeoReference,
  AssetMappingClassification,
  MappingType,
  ConfidenceLevel,
  DataProvenance,
  SpatialLoadZone,
  EstimatedServiceRegion,
  SpatialLoadCluster,
} from '@/types/geo';
import { ElectricalGeoBridge } from './electricalGeoBridge';
import { ServiceRegionGenerator } from './serviceRegionGenerator';
import { LoadClusterer, type ClusterableLoad } from './loadClusterer';
import { computeGeoDistanceMeters, isValidCoordinate } from './geoCoordinates';

export interface MappingResult {
  bridge: ElectricalGeoBridge;
  references: ElectricalGeoReference[];
  serviceRegions: EstimatedServiceRegion[];
  loadClusters: SpatialLoadCluster[];
  loadZones: SpatialLoadZone[];
  unmatchedSubstations: string[];
  unmatchedTransmissionLines: string[];
}

export interface AffectedSpatialArea {
  failedAssetId: string;
  failedAssetName: string;
  geographicLocation?: GeoCoordinate;
  affectedRegion?: EstimatedServiceRegion;
  affectedLoadZones: SpatialLoadZone[];
  affectedClusters: SpatialLoadCluster[];
  affectedLoads: Load[];
  criticalInfrastructureImpacted: CriticalInfrastructure[];
  unservedDemandMW: number;
  mappingType: MappingType;
  confidence: ConfidenceLevel;
}

export class GeoElectricalMapper {
  private bridge: ElectricalGeoBridge;
  private topology: GridTopology;
  private geoPowerAssets: GeoPowerAsset[];
  private buildings: Building[];
  private criticalInfrastructure: CriticalInfrastructure[];
  private activeCity: City;
  private serviceRegions: EstimatedServiceRegion[] = [];
  private loadClusters: SpatialLoadCluster[] = [];
  private loadZones: SpatialLoadZone[] = [];

  constructor(
    topology: GridTopology,
    activeCity: City,
    geoPowerAssets: GeoPowerAsset[] = [],
    buildings: Building[] = [],
    criticalInfrastructure: CriticalInfrastructure[] = [],
  ) {
    this.topology = topology;
    this.activeCity = activeCity;
    this.geoPowerAssets = geoPowerAssets;
    this.buildings = buildings;
    this.criticalInfrastructure = criticalInfrastructure;
    this.bridge = new ElectricalGeoBridge();
  }

  /**
   * Primary entry point: Executes complete deterministic mapping pipeline.
   */
  public executeMapping(): MappingResult {
    this.bridge.clear();
    const references: ElectricalGeoReference[] = [];
    const unmatchedSubstations: string[] = [];
    const unmatchedTransmissionLines: string[] = [];

    // 1. Map Substations
    for (const sub of this.topology.substations) {
      const ref = this.mapSubstation(sub);
      if (ref) {
        this.bridge.bindAssetToGeo(ref);
        references.push(ref);
        // Non-destructively set optional geoRef on electrical asset
        sub.geoRef = ref;
        sub.geoEntityId = ref.geoEntityId;
      } else {
        unmatchedSubstations.push(sub.id);
      }
    }

    // 2. Map Generators
    for (const gen of this.topology.generators) {
      const ref = this.mapGenerator(gen);
      if (ref) {
        this.bridge.bindAssetToGeo(ref);
        references.push(ref);
        gen.geoRef = ref;
        gen.geoEntityId = ref.geoEntityId;
      }
    }

    // 3. Map Transmission Lines / Corridors
    for (const line of this.topology.transmissionLines) {
      const ref = this.mapTransmissionLine(line);
      if (ref) {
        this.bridge.bindAssetToGeo(ref);
        references.push(ref);
        line.geoRef = ref;
        line.geoEntityId = ref.geoEntityId;
        line.pathCoordinates = ref.pathCoordinates;
      } else {
        unmatchedTransmissionLines.push(line.id);
      }
    }

    // 4. Map Batteries
    for (const bat of this.topology.batteries) {
      const ref = this.mapBattery(bat);
      if (ref) {
        this.bridge.bindAssetToGeo(ref);
        references.push(ref);
        bat.geoRef = ref;
        bat.geoEntityId = ref.geoEntityId;
      }
    }

    // 5. Map Loads to geographic coordinates
    this.mapLoads();

    // 6. Generate Voronoi Estimated Service Regions (bounded to study area)
    const substationsWithCoords = this.topology.substations
      .filter((s) => s.geoRef && isValidCoordinate(s.geoRef.coordinates))
      .map((s) => ({
        id: s.id,
        name: s.name,
        coordinates: s.geoRef!.coordinates,
      }));

    this.serviceRegions = ServiceRegionGenerator.generateRegions(
      substationsWithCoords,
      this.activeCity.boundingBox,
      this.topology.loads,
    );

    // 7. Deterministic Spatial Load Clustering
    const clusterables = LoadClusterer.extractClusterableLoads(this.topology.loads);
    this.loadClusters = LoadClusterer.clusterLoads(clusterables);
    this.loadZones = LoadClusterer.createLoadZonesFromClusters(this.loadClusters, this.activeCity.id);

    return {
      bridge: this.bridge,
      references,
      serviceRegions: this.serviceRegions,
      loadClusters: this.loadClusters,
      loadZones: this.loadZones,
      unmatchedSubstations,
      unmatchedTransmissionLines,
    };
  }

  // ─── Substation Mapping Logic ───────────────────────────────────────

  private mapSubstation(sub: Substation): ElectricalGeoReference | null {
    // 1. Direct ID match in geo power assets
    const directMatch = this.geoPowerAssets.find(
      (g) => g.electricalAssetId === sub.id || g.id === sub.id,
    );
    if (directMatch && isValidCoordinate(directMatch.coordinates)) {
      const isVerified = directMatch.provenance.isVerifiedRealWorld && directMatch.isSurveyVerified;
      const classification: AssetMappingClassification = isVerified
        ? 'VERIFIED_MAPPING'
        : 'HIGH_CONFIDENCE_MATCH';
      const mappingType: MappingType = isVerified ? 'VERIFIED' : 'SOURCE_MATCHED';

      return {
        electricalAssetId: sub.id,
        geoEntityId: directMatch.id,
        coordinates: directMatch.coordinates,
        mappingType,
        classification,
        confidence: isVerified ? 'HIGH' : 'HIGH',
        source: directMatch.provenance.sourceReference,
        provenance: directMatch.provenance,
        lastUpdated: new Date().toISOString(),
        isVerified,
      };
    }

    // 2. Name-based match (case-insensitive substring)
    const normSubName = this.normalize(sub.name);
    const nameMatch = this.geoPowerAssets.find(
      (g) => g.entityType === 'SUBSTATION' && (this.normalize(g.name).includes(normSubName) || normSubName.includes(this.normalize(g.name))),
    );
    if (nameMatch && isValidCoordinate(nameMatch.coordinates)) {
      return {
        electricalAssetId: sub.id,
        geoEntityId: nameMatch.id,
        coordinates: nameMatch.coordinates,
        mappingType: 'SOURCE_MATCHED',
        classification: 'HIGH_CONFIDENCE_MATCH',
        confidence: 'HIGH',
        source: nameMatch.provenance.sourceReference,
        provenance: nameMatch.provenance,
        lastUpdated: new Date().toISOString(),
        isVerified: false,
      };
    }

    // 3. Fallback: If city center exists, create modeled spatial inference placement within city bounds
    // INVARIANT: Never label this as VERIFIED. It is strictly SPATIAL_INFERENCE / INFERRED_MATCH.
    if (this.activeCity && isValidCoordinate(this.activeCity.centerCoordinates)) {
      // Deterministic offset based on 2D grid position or sub index
      const pos = sub.position || { x: 400, y: 300 };
      const bbox = this.activeCity.boundingBox;
      const latSpan = bbox.maxLatitude - bbox.minLatitude;
      const lonSpan = bbox.maxLongitude - bbox.minLongitude;

      // Map normalized grid coordinate (0..800, 0..600) into city bounding box interior (padding 15%)
      const normX = Math.max(0.1, Math.min(0.9, (pos.x || 400) / 800));
      const normY = Math.max(0.1, Math.min(0.9, (pos.y || 300) / 600));

      const inferredCoord: GeoCoordinate = {
        latitude: bbox.minLatitude + normY * latSpan,
        longitude: bbox.minLongitude + normX * lonSpan,
      };

      const provenance: DataProvenance = {
        sourceType: 'MODELED',
        confidence: 'LOW',
        sourceReference: `Spatial inference projection for ${sub.name} in ${this.activeCity.name}`,
        lastUpdated: new Date().toISOString(),
        isVerifiedRealWorld: false,
        methodologyNotes: 'Projected from electrical schematic grid position into metropolitan study area. Spatial inference only.',
      };

      return {
        electricalAssetId: sub.id,
        geoEntityId: `geo-inferred-sub-${sub.id}`,
        coordinates: inferredCoord,
        mappingType: 'SPATIAL_INFERENCE',
        classification: 'INFERRED_MATCH',
        confidence: 'LOW',
        source: 'VAJRA Spatial Inference Engine',
        provenance,
        lastUpdated: new Date().toISOString(),
        isVerified: false,
      };
    }

    return null;
  }

  // ─── Generator Mapping Logic ────────────────────────────────────────

  private mapGenerator(gen: Generator): ElectricalGeoReference | null {
    const directMatch = this.geoPowerAssets.find(
      (g) => g.electricalAssetId === gen.id || g.id === gen.id,
    );
    if (directMatch && isValidCoordinate(directMatch.coordinates)) {
      const isVerified = directMatch.provenance.isVerifiedRealWorld && directMatch.isSurveyVerified;
      return {
        electricalAssetId: gen.id,
        geoEntityId: directMatch.id,
        coordinates: directMatch.coordinates,
        mappingType: isVerified ? 'VERIFIED' : 'SOURCE_MATCHED',
        classification: isVerified ? 'VERIFIED_MAPPING' : 'HIGH_CONFIDENCE_MATCH',
        confidence: 'HIGH',
        source: directMatch.provenance.sourceReference,
        provenance: directMatch.provenance,
        lastUpdated: new Date().toISOString(),
        isVerified,
      };
    }

    // Heuristic placement near connected substation
    const connectedSubId = gen.connectedTo[0];
    const subGeoRef = connectedSubId ? this.bridge.getGeoReference(connectedSubId) : undefined;
    const baseCoord = subGeoRef ? subGeoRef.coordinates : this.activeCity.centerCoordinates;

    if (isValidCoordinate(baseCoord)) {
      const offsetCoord: GeoCoordinate = {
        latitude: baseCoord.latitude + 0.015,
        longitude: baseCoord.longitude + 0.015,
      };
      return {
        electricalAssetId: gen.id,
        geoEntityId: `geo-inferred-gen-${gen.id}`,
        coordinates: offsetCoord,
        mappingType: 'SPATIAL_INFERENCE',
        classification: 'INFERRED_MATCH',
        confidence: 'LOW',
        source: 'VAJRA Spatial Inference',
        provenance: {
          sourceType: 'MODELED',
          confidence: 'LOW',
          sourceReference: `Spatial inference for ${gen.name}`,
          lastUpdated: new Date().toISOString(),
          isVerifiedRealWorld: false,
          methodologyNotes: 'Estimated location near connected substation.',
        },
        lastUpdated: new Date().toISOString(),
        isVerified: false,
      };
    }

    return null;
  }

  // ─── Transmission Corridor Mapping Logic ────────────────────────────

  private mapTransmissionLine(line: TransmissionLine): ElectricalGeoReference | null {
    const directMatch = this.geoPowerAssets.find(
      (g) => g.electricalAssetId === line.id || g.id === line.id,
    );

    if (directMatch && isValidCoordinate(directMatch.coordinates)) {
      const isVerified = directMatch.provenance.isVerifiedRealWorld && directMatch.isSurveyVerified;
      return {
        electricalAssetId: line.id,
        geoEntityId: directMatch.id,
        coordinates: directMatch.coordinates,
        pathCoordinates: directMatch.pathCoordinates,
        mappingType: isVerified ? 'VERIFIED' : 'SOURCE_MATCHED',
        classification: isVerified ? 'VERIFIED_MAPPING' : 'HIGH_CONFIDENCE_MATCH',
        confidence: 'HIGH',
        source: directMatch.provenance.sourceReference,
        provenance: directMatch.provenance,
        lastUpdated: new Date().toISOString(),
        isVerified,
      };
    }

    // Connect from-substation to to-substation coordinates
    const fromRef = this.bridge.getGeoReference(line.fromId);
    const toRef = this.bridge.getGeoReference(line.toId);

    if (fromRef && toRef) {
      const midpoint: GeoCoordinate = {
        latitude: (fromRef.coordinates.latitude + toRef.coordinates.latitude) / 2,
        longitude: (fromRef.coordinates.longitude + toRef.coordinates.longitude) / 2,
      };

      const path: GeoCoordinate[] = [fromRef.coordinates, midpoint, toRef.coordinates];

      return {
        electricalAssetId: line.id,
        geoEntityId: `geo-corridor-${line.id}`,
        coordinates: midpoint,
        pathCoordinates: path,
        mappingType: 'SPATIAL_INFERENCE',
        classification: 'INFERRED_MATCH',
        confidence: 'MEDIUM',
        source: 'Estimated corridor between mapped substations',
        provenance: {
          sourceType: 'MODELED',
          confidence: 'MEDIUM',
          sourceReference: `Synthesized transmission corridor between ${line.fromId} and ${line.toId}`,
          lastUpdated: new Date().toISOString(),
          isVerifiedRealWorld: false,
          methodologyNotes: 'Path connects endpoints of mapped substations. Preserved separately from circuit topology.',
        },
        lastUpdated: new Date().toISOString(),
        isVerified: false,
      };
    }

    return null;
  }

  // ─── Battery Mapping Logic ──────────────────────────────────────────

  private mapBattery(bat: Battery): ElectricalGeoReference | null {
    const directMatch = this.geoPowerAssets.find(
      (g) => g.electricalAssetId === bat.id || g.id === bat.id,
    );
    if (directMatch && isValidCoordinate(directMatch.coordinates)) {
      return {
        electricalAssetId: bat.id,
        geoEntityId: directMatch.id,
        coordinates: directMatch.coordinates,
        mappingType: 'SOURCE_MATCHED',
        classification: 'HIGH_CONFIDENCE_MATCH',
        confidence: 'HIGH',
        source: directMatch.provenance.sourceReference,
        provenance: directMatch.provenance,
        lastUpdated: new Date().toISOString(),
        isVerified: directMatch.provenance.isVerifiedRealWorld,
      };
    }

    const subRef = bat.connectedTo ? this.bridge.getGeoReference(bat.connectedTo) : undefined;
    if (subRef) {
      const batCoord: GeoCoordinate = {
        latitude: subRef.coordinates.latitude - 0.005,
        longitude: subRef.coordinates.longitude + 0.005,
      };
      return {
        electricalAssetId: bat.id,
        geoEntityId: `geo-inferred-bat-${bat.id}`,
        coordinates: batCoord,
        mappingType: 'SPATIAL_INFERENCE',
        classification: 'INFERRED_MATCH',
        confidence: 'LOW',
        source: 'Co-located battery storage inference',
        provenance: {
          sourceType: 'MODELED',
          confidence: 'LOW',
          sourceReference: `Co-located with substation ${bat.connectedTo}`,
          lastUpdated: new Date().toISOString(),
          isVerifiedRealWorld: false,
          methodologyNotes: 'Modeled within 500m of connected substation.',
        },
        lastUpdated: new Date().toISOString(),
        isVerified: false,
      };
    }

    return null;
  }

  // ─── Load Mapping Logic ─────────────────────────────────────────────

  private mapLoads(): void {
    for (const load of this.topology.loads) {
      const subRef = load.connectedTo ? this.bridge.getGeoReference(load.connectedTo) : undefined;

      let coord: GeoCoordinate | undefined;
      if (subRef) {
        // Scatter loads in proximity to connected substation based on 2D position or ID hash
        const hash = this.hashString(load.id);
        const radiusDelta = 0.01 + (hash % 15) * 0.002;
        const angle = ((hash % 360) * Math.PI) / 180;

        coord = {
          latitude: subRef.coordinates.latitude + radiusDelta * Math.sin(angle),
          longitude: subRef.coordinates.longitude + radiusDelta * Math.cos(angle),
        };
      } else if (isValidCoordinate(this.activeCity.centerCoordinates)) {
        coord = this.activeCity.centerCoordinates;
      }

      if (coord && isValidCoordinate(coord)) {
        const ref: ElectricalGeoReference = {
          electricalAssetId: load.id,
          geoEntityId: `geo-load-${load.id}`,
          coordinates: coord,
          mappingType: 'SPATIAL_INFERENCE',
          classification: 'INFERRED_MATCH',
          confidence: 'LOW',
          source: 'Spatial load positioning inference',
          provenance: {
            sourceType: 'MODELED',
            confidence: 'LOW',
            sourceReference: `Modeled load near substation ${load.connectedTo || 'none'}`,
            lastUpdated: new Date().toISOString(),
            isVerifiedRealWorld: false,
            methodologyNotes: 'Estimated spatial coordinate. Proximity does NOT prove electrical feeder path.',
          },
          lastUpdated: new Date().toISOString(),
          isVerified: false,
        };

        this.bridge.bindAssetToGeo(ref);
        load.geoRef = ref;
        load.geoEntityId = ref.geoEntityId;
      }
    }
  }

  // ─── Spatial Inspection Queries (Addressing Mission Objectives) ─────

  /**
   * "Which geographic region is associated with this substation?"
   */
  public getGeographicRegionForSubstation(substationId: string): EstimatedServiceRegion | undefined {
    return this.serviceRegions.find((r) => r.substationId === substationId);
  }

  /**
   * "Which geographic infrastructure is near this transmission asset?"
   */
  public getGeographicInfrastructureNearAsset(
    electricalAssetId: string,
    radiusMeters: number = 3000,
  ): (Building | CriticalInfrastructure | GeoPowerAsset)[] {
    const geoRef = this.bridge.getGeoReference(electricalAssetId);
    if (!geoRef) return [];

    const center = geoRef.coordinates;
    const results: (Building | CriticalInfrastructure | GeoPowerAsset)[] = [];

    // Check critical infrastructure
    for (const infra of this.criticalInfrastructure) {
      if (isValidCoordinate(infra.coordinates)) {
        const d = computeGeoDistanceMeters(center, infra.coordinates);
        if (d <= radiusMeters) results.push(infra);
      }
    }

    // Check buildings
    for (const bldg of this.buildings) {
      if (isValidCoordinate(bldg.coordinates)) {
        const d = computeGeoDistanceMeters(center, bldg.coordinates);
        if (d <= radiusMeters) results.push(bldg);
      }
    }

    // Check other geo power assets
    for (const power of this.geoPowerAssets) {
      if (power.electricalAssetId !== electricalAssetId && isValidCoordinate(power.coordinates)) {
        const d = computeGeoDistanceMeters(center, power.coordinates);
        if (d <= radiusMeters) results.push(power);
      }
    }

    return results;
  }

  /**
   * "Which load zones are spatially associated with this electrical asset?"
   */
  public getLoadZonesForElectricalAsset(assetId: string): SpatialLoadZone[] {
    return this.loadZones.filter(
      (z) => z.associatedElectricalAssetIds.includes(assetId) || z.associatedSubstationId === assetId,
    );
  }

  /**
   * "Which areas would potentially be affected if this asset fails?"
   * Interfaces non-destructively with electrical state and Task 13 cascade concepts
   * WITHOUT modifying simulation physics or rewriting Task 13.
   */
  public getPotentiallyAffectedAreasForFailure(failedAssetId: string): AffectedSpatialArea {
    const geoRef = this.bridge.getGeoReference(failedAssetId);
    const sub = this.topology.substations.find((s) => s.id === failedAssetId);
    const line = this.topology.transmissionLines.find((l) => l.id === failedAssetId);

    const assetName = sub?.name || line?.name || failedAssetId;
    const region = this.serviceRegions.find((r) => r.substationId === failedAssetId);

    // Identify affected loads: directly connected or within spatial proximity region
    const directlyConnectedLoads = this.topology.loads.filter((l) => l.connectedTo === failedAssetId);
    const regionLoadIds = new Set(region ? region.associatedLoadIds : []);
    const affectedLoads = this.topology.loads.filter(
      (l) => l.connectedTo === failedAssetId || regionLoadIds.has(l.id),
    );

    const affectedLoadIds = new Set(affectedLoads.map((l) => l.id));
    const affectedClusters = this.loadClusters.filter((c) =>
      c.memberLoadIds.some((id) => affectedLoadIds.has(id)) || c.assignedSubstationId === failedAssetId,
    );
    const affectedZones = this.loadZones.filter(
      (z) => z.associatedSubstationId === failedAssetId || z.associatedElectricalAssetIds.some((id) => affectedLoadIds.has(id)),
    );

    // Identify critical infrastructure within affected region
    const criticalImpacted: CriticalInfrastructure[] = [];
    if (region && region.boundaryPolygon) {
      for (const infra of this.criticalInfrastructure) {
        if (
          isValidCoordinate(infra.coordinates) &&
          ServiceRegionGenerator.isPointInPolygon(infra.coordinates, region.boundaryPolygon)
        ) {
          criticalImpacted.push(infra);
        }
      }
    }

    const unservedDemandMW = affectedLoads.reduce((sum, l) => sum + (l.demandMW || 0), 0);

    return {
      failedAssetId,
      failedAssetName: assetName,
      geographicLocation: geoRef?.coordinates,
      affectedRegion: region,
      affectedLoadZones: affectedZones,
      affectedClusters,
      affectedLoads,
      criticalInfrastructureImpacted: criticalImpacted,
      unservedDemandMW: Math.round(unservedDemandMW * 10) / 10,
      mappingType: geoRef?.mappingType || 'SPATIAL_INFERENCE',
      confidence: geoRef?.confidence || 'LOW',
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private hashString(s: string): number {
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
      hash = (hash << 5) - hash + s.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}
