// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Power Infrastructure Data Providers
// ═══════════════════════════════════════════════════════════════════════
// Strict Provenance: Every provider explicitly declares its classification.
// Live telemetry returns DISCONNECTED unless an authentic SCADA/PMU feed exists.
// ═══════════════════════════════════════════════════════════════════════

import type { PowerAsset, DataClassification } from '@/types/powerAsset';
import { CANONICAL_POWER_ASSETS } from '@/data/canonicalCitiesData';

export interface IDataProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly sourceClassification: DataClassification;
  loadCityPowerAssets(cityId: string): Promise<PowerAsset[]>;
  isLiveFeedAvailable(): boolean;
}

export class CEAProvider implements IDataProvider {
  public readonly providerId = 'cea-transmission-provider';
  public readonly providerName = 'Central Electricity Authority (CEA) National Grid Registry';
  public readonly sourceClassification: DataClassification = 'CURRENT_PUBLIC';

  public async loadCityPowerAssets(cityId: string): Promise<PowerAsset[]> {
    const assets = CANONICAL_POWER_ASSETS[cityId] || [];
    return assets.filter(a => a.source.includes('CEA') || a.voltageKV && a.voltageKV >= 220);
  }

  public isLiveFeedAvailable(): boolean {
    return false; // Published monthly/quarterly reports, not live telemetry
  }
}

export class OSMProvider implements IDataProvider {
  public readonly providerId = 'osm-power-provider';
  public readonly providerName = 'OpenStreetMap & OpenInfraMap GIS Infrastructure Provider';
  public readonly sourceClassification: DataClassification = 'CURRENT_PUBLIC';

  public async loadCityPowerAssets(cityId: string): Promise<PowerAsset[]> {
    return CANONICAL_POWER_ASSETS[cityId] || [];
  }

  public isLiveFeedAvailable(): boolean {
    return false; // Vector map data, not live telemetry
  }
}

export class UtilityTelemetryProvider implements IDataProvider {
  public readonly providerId = 'utility-scada-pmu-stub';
  public readonly providerName = 'Utility SCADA / PMU Live Telemetry Interface';
  public readonly sourceClassification: DataClassification = 'VERIFIED_REAL';

  public async loadCityPowerAssets(_cityId: string): Promise<PowerAsset[]> {
    return []; // No fake utility SCADA data fabricated
  }

  public isLiveFeedAvailable(): boolean {
    return false; // Explicitly unlinked: "SCADA/PMU NOT CONNECTED"
  }

  public getConnectionStatus(): {
    connected: boolean;
    statusText: string;
    protocol: string;
  } {
    return {
      connected: false,
      statusText: 'DISCONNECTED — SIMULATION ENGINE ACTIVE',
      protocol: 'IEC 60870-5-104 / IEEE C37.118 (Awaiting Utility Integration)',
    };
  }
}
