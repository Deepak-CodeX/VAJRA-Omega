// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — GeoEntity Registry & Spatial/Electrical Graph Separation
// ═══════════════════════════════════════════════════════════════════════
// Invariant:
// Geographic proximity and spatial containment NEVER automatically create
// electrical edges. The Spatial Graph and Electrical Graph are strictly decoupled.
// ═══════════════════════════════════════════════════════════════════════

import type {
  GeoEntity,
  GeoEntityType,
  GeoBoundingBox,
  GeoRelationship,
  ElectricalRelationship,
  DataProvenanceType,
} from '@/types/geo';
import { isCoordinateInBoundingBox, assertValidCoordinate } from './geoCoordinates';

export interface GeoProvenanceSummary {
  verifiedCount: number;
  modeledCount: number;
  syntheticCount: number;
  userDefinedCount: number;
}

export class GeoEntityRegistry {
  private entities = new Map<string, GeoEntity>();
  private spatialRelationships = new Map<string, GeoRelationship>();
  private electricalRelationships = new Map<string, ElectricalRelationship>();

  /**
   * Register or update a geographic entity.
   * Enforces coordinate validity and stable ID presence.
   */
  public registerEntity(entity: GeoEntity, allowOverwrite: boolean = false): void {
    if (!entity.id || typeof entity.id !== 'string') {
      throw new Error('Entity must have a non-empty string ID');
    }

    assertValidCoordinate(entity.coordinates, `Entity ${entity.name} (${entity.id})`);

    if (this.entities.has(entity.id) && !allowOverwrite) {
      throw new Error(`Duplicate entity detected with ID "${entity.id}". Set allowOverwrite=true to update.`);
    }

    this.entities.set(entity.id, entity);
  }

  public getEntity(id: string): GeoEntity | undefined {
    return this.entities.get(id);
  }

  public hasEntity(id: string): boolean {
    return this.entities.has(id);
  }

  public getAllEntities(): GeoEntity[] {
    return Array.from(this.entities.values());
  }

  public getEntitiesByType<T extends GeoEntity = GeoEntity>(type: GeoEntityType): T[] {
    return Array.from(this.entities.values()).filter((e) => e.entityType === type) as T[];
  }

  public getEntitiesInBounds(box: GeoBoundingBox): GeoEntity[] {
    return Array.from(this.entities.values()).filter((e) => isCoordinateInBoundingBox(e.coordinates, box));
  }

  public getEntitiesByProvenance(provenanceType: DataProvenanceType): GeoEntity[] {
    return Array.from(this.entities.values()).filter((e) => e.provenance.sourceType === provenanceType);
  }

  /**
   * Summarizes data provenance across all loaded entities.
   */
  public getProvenanceSummary(): GeoProvenanceSummary {
    let verifiedCount = 0;
    let modeledCount = 0;
    let syntheticCount = 0;
    let userDefinedCount = 0;

    for (const entity of this.entities.values()) {
      switch (entity.provenance.sourceType) {
        case 'VERIFIED_EXTERNAL':
          verifiedCount++;
          break;
        case 'MODELED':
          modeledCount++;
          break;
        case 'SYNTHETIC':
          syntheticCount++;
          break;
        case 'USER_DEFINED':
          userDefinedCount++;
          break;
      }
    }

    return {
      verifiedCount,
      modeledCount,
      syntheticCount,
      userDefinedCount,
    };
  }

  // ─── Spatial Relationship Graph ───────────────────────────────────

  public addSpatialRelationship(rel: GeoRelationship): void {
    if (!this.entities.has(rel.sourceEntityId)) {
      throw new Error(`Spatial relation source entity "${rel.sourceEntityId}" does not exist in registry.`);
    }
    if (!this.entities.has(rel.targetEntityId)) {
      throw new Error(`Spatial relation target entity "${rel.targetEntityId}" does not exist in registry.`);
    }
    this.spatialRelationships.set(rel.id, rel);
  }

  public getSpatialRelationships(entityId: string): GeoRelationship[] {
    return Array.from(this.spatialRelationships.values()).filter(
      (r) => r.sourceEntityId === entityId || r.targetEntityId === entityId,
    );
  }

  // ─── Electrical Relationship Graph ────────────────────────────────
  // Independent from spatial proximity.

  public addElectricalRelationship(rel: ElectricalRelationship): void {
    this.electricalRelationships.set(rel.id, rel);
  }

  public getElectricalRelationships(electricalAssetId: string): ElectricalRelationship[] {
    return Array.from(this.electricalRelationships.values()).filter(
      (r) => r.fromElectricalAssetId === electricalAssetId || r.toElectricalAssetId === electricalAssetId,
    );
  }

  /**
   * INVARIANT VERIFICATION:
   * Confirms whether two entities that have a spatial relationship
   * accidentally have an electrical relationship created without explicit declaration.
   */
  public hasElectricalConnection(fromAssetId: string, toAssetId: string): boolean {
    return Array.from(this.electricalRelationships.values()).some(
      (r) =>
        (r.fromElectricalAssetId === fromAssetId && r.toElectricalAssetId === toAssetId) ||
        (r.fromElectricalAssetId === toAssetId && r.toElectricalAssetId === fromAssetId),
    );
  }

  public clear(): void {
    this.entities.clear();
    this.spatialRelationships.clear();
    this.electricalRelationships.clear();
  }

  public count(): number {
    return this.entities.size;
  }
}
