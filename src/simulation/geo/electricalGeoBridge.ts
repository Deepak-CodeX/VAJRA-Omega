// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Electrical-Geographic Bridge Layer
// ═══════════════════════════════════════════════════════════════════════
// Establishes clean, non-destructive references between existing electrical
// simulation assets and geographic entities without duplicating state.
//
// Invariant:
// The simulation engine remains solely authoritative for all electrical physics
// (MW flows, voltages, faults, cascades, recoveries).
// The Geo-Twin provides spatial and physical world context.
// ═══════════════════════════════════════════════════════════════════════

import type {
  GridTopology,
  Generator,
  Substation,
  TransmissionLine,
  Battery,
  Load,
} from '@/types';
import type {
  GeoCoordinate,
  DataProvenance,
  ElectricalGeoReference,
  AssetMappingClassification,
  MappingType,
} from '@/types/geo';

export type { ElectricalGeoReference };

export interface FusedGeoElectricalAsset<T = Generator | Substation | TransmissionLine | Battery | Load> {
  electricalAsset: T;
  geoReference: ElectricalGeoReference;
  isVerifiedMapping: boolean;
}

export class ElectricalGeoBridge {
  private elecToGeo = new Map<string, ElectricalGeoReference>();
  private geoToElec = new Map<string, string>();

  /**
   * Bind an existing electrical asset to a geographic entity reference.
   */
  public bindAssetToGeo(reference: ElectricalGeoReference): void {
    if (!reference.electricalAssetId) {
      throw new Error('Cannot bind without electricalAssetId');
    }
    if (!reference.geoEntityId) {
      throw new Error('Cannot bind without geoEntityId');
    }

    this.elecToGeo.set(reference.electricalAssetId, reference);
    this.geoToElec.set(reference.geoEntityId, reference.electricalAssetId);
  }

  public getGeoReference(electricalAssetId: string): ElectricalGeoReference | undefined {
    return this.elecToGeo.get(electricalAssetId);
  }

  public getElectricalAssetId(geoEntityId: string): string | undefined {
    return this.geoToElec.get(geoEntityId);
  }

  public isAssetMapped(electricalAssetId: string): boolean {
    return this.elecToGeo.has(electricalAssetId);
  }

  public getMappedCount(): number {
    return this.elecToGeo.size;
  }

  public clear(): void {
    this.elecToGeo.clear();
    this.geoToElec.clear();
  }

  public getAllReferences(): ElectricalGeoReference[] {
    return Array.from(this.elecToGeo.values());
  }

  public getAllMappedElectricalIds(): string[] {
    return Array.from(this.elecToGeo.keys());
  }

  public getReferencesByClassification(classification: AssetMappingClassification): ElectricalGeoReference[] {
    return Array.from(this.elecToGeo.values()).filter((ref) => ref.classification === classification);
  }

  public getReferencesByMappingType(mappingType: MappingType): ElectricalGeoReference[] {
    return Array.from(this.elecToGeo.values()).filter((ref) => ref.mappingType === mappingType);
  }

  /**
   * Non-destructively fuses live simulation topology state with geographic coordinates.
   * If the asset is not mapped to geo, returns undefined.
   */
  public resolveFusedAsset(
    topology: GridTopology,
    electricalAssetId: string,
  ): FusedGeoElectricalAsset | undefined {
    const geoRef = this.getGeoReference(electricalAssetId);
    if (!geoRef) return undefined;

    // Search generators
    const gen = topology.generators.find((g) => g.id === electricalAssetId);
    if (gen) return { electricalAsset: gen, geoReference: geoRef, isVerifiedMapping: geoRef.isVerified };

    // Search substations
    const sub = topology.substations.find((s) => s.id === electricalAssetId);
    if (sub) return { electricalAsset: sub, geoReference: geoRef, isVerifiedMapping: geoRef.isVerified };

    // Search transmission lines
    const line = topology.transmissionLines.find((l) => l.id === electricalAssetId);
    if (line) return { electricalAsset: line, geoReference: geoRef, isVerifiedMapping: geoRef.isVerified };

    // Search batteries
    const bat = topology.batteries.find((b) => b.id === electricalAssetId);
    if (bat) return { electricalAsset: bat, geoReference: geoRef, isVerifiedMapping: geoRef.isVerified };

    // Search loads
    const load = topology.loads.find((l) => l.id === electricalAssetId);
    if (load) return { electricalAsset: load, geoReference: geoRef, isVerifiedMapping: geoRef.isVerified };

    return undefined;
  }
}
