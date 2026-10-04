import type {
  AssetStatus,
  GridTopology,
  Generator,
  Substation,
  TransmissionLine,
  Battery,
  Load,
} from '@/types';

export type VisualState =
  | 'NORMAL'
  | 'WARNING'
  | 'OVERLOADED'
  | 'FAILED'
  | 'ISOLATED'
  | 'RECOVERING'
  | 'OFFLINE';

export interface VisualTheme {
  primary: string;
  fill: string;
  glow: string;
  border: string;
  text: string;
  badgeBg: string;
}

export const STATE_THEMES: Record<VisualState, VisualTheme> = {
  NORMAL: {
    primary: '#00e5c8',
    fill: '#09232d',
    glow: 'rgba(0, 229, 200, 0.4)',
    border: '#00e5c8',
    text: '#e0edf5',
    badgeBg: 'rgba(0, 229, 200, 0.15)',
  },
  WARNING: {
    primary: '#f5a623',
    fill: '#291e0a',
    glow: 'rgba(245, 166, 35, 0.5)',
    border: '#f5a623',
    text: '#f5a623',
    badgeBg: 'rgba(245, 166, 35, 0.15)',
  },
  OVERLOADED: {
    primary: '#ff3b5c',
    fill: '#2b0c14',
    glow: 'rgba(255, 59, 92, 0.6)',
    border: '#ff3b5c',
    text: '#ff3b5c',
    badgeBg: 'rgba(255, 59, 92, 0.2)',
  },
  FAILED: {
    primary: '#ff3b5c',
    fill: '#1a050a',
    glow: 'rgba(255, 59, 92, 0.8)',
    border: '#ff3b5c',
    text: '#ff3b5c',
    badgeBg: 'rgba(255, 59, 92, 0.3)',
  },
  ISOLATED: {
    primary: '#5a7a8f',
    fill: '#081018',
    glow: 'none',
    border: '#3a5568',
    text: '#5a7a8f',
    badgeBg: 'rgba(90, 122, 143, 0.15)',
  },
  RECOVERING: {
    primary: '#3b9eff',
    fill: '#0d223a',
    glow: 'rgba(59, 158, 255, 0.5)',
    border: '#3b9eff',
    text: '#3b9eff',
    badgeBg: 'rgba(59, 158, 255, 0.2)',
  },
  OFFLINE: {
    primary: '#3a5568',
    fill: '#060b12',
    glow: 'none',
    border: '#1a3348',
    text: '#3a5568',
    badgeBg: 'rgba(58, 85, 104, 0.15)',
  },
};

export const ASSET_TYPE_COLORS = {
  solar: '#f5a623',
  wind: '#3b9eff',
  thermal: '#e0edf5',
  transmissionSub: '#00e5c8',
  distributionSub: '#00d68f',
  battery: '#a855f7',
  residential: '#38bdf8',
  commercial: '#818cf8',
  industrial: '#fb923c',
  evCharging: '#4ade80',
  ev_charging: '#4ade80',
  line: '#2563eb',
};

/**
 * Derives visual state from asset status and metrics
 */
export function deriveNodeVisualState(
  status: AssetStatus,
  extra?: { isConnected?: boolean; loadingPercent?: number; isRecovering?: boolean },
): VisualState {
  if (extra?.isRecovering) return 'RECOVERING';
  if (extra?.isConnected === false || status === 'ISOLATED') return 'ISOLATED';
  if (status === 'FAILED') return 'FAILED';
  if (status === 'OVERLOADED' || (extra?.loadingPercent !== undefined && extra.loadingPercent >= 100)) {
    return 'OVERLOADED';
  }
  if (status === 'WARNING' || (extra?.loadingPercent !== undefined && extra.loadingPercent >= 80)) {
    return 'WARNING';
  }
  if (status === 'OFFLINE') return 'OFFLINE';
  if (status === 'RECOVERING') return 'RECOVERING';
  return 'NORMAL';
}

/**
 * Derives visual state for a transmission line
 */
export function deriveLineVisualState(line: TransmissionLine): VisualState {
  if (line.status === 'FAILED') return 'FAILED';
  if (line.status === 'OVERLOADED' || line.loadingPercent >= 100) return 'OVERLOADED';
  if (line.status === 'WARNING' || line.loadingPercent >= 80) return 'WARNING';
  if (line.status === 'OFFLINE') return 'OFFLINE';
  return 'NORMAL';
}

export type SelectedAsset =
  | { kind: 'generator'; data: Generator }
  | { kind: 'substation'; data: Substation }
  | { kind: 'battery'; data: Battery }
  | { kind: 'load'; data: Load }
  | { kind: 'line'; data: TransmissionLine };

/**
 * Find position coordinates of any asset by ID
 */
export function getAssetPosition(
  id: string,
  topology: GridTopology,
): { x: number; y: number } | null {
  const sub = topology.substations.find((s) => s.id === id);
  if (sub) return sub.position;
  const gen = topology.generators.find((g) => g.id === id);
  if (gen) return gen.position;
  const bat = topology.batteries.find((b) => b.id === id);
  if (bat) return bat.position;
  const load = topology.loads.find((l) => l.id === id);
  if (load) return load.position;
  return null;
}

/**
 * Find connected assets for any asset
 */
export function getConnectedAssetIds(
  selected: SelectedAsset,
  topology: GridTopology,
): string[] {
  const connectedIds: string[] = [];

  switch (selected.kind) {
    case 'generator':
      connectedIds.push(...selected.data.connectedTo);
      break;

    case 'substation':
      connectedIds.push(...selected.data.connectedLines);
      connectedIds.push(...selected.data.connectedLoads);
      connectedIds.push(...selected.data.connectedGenerators);
      // Also include batteries connected to this substation
      for (const bat of topology.batteries) {
        if (bat.connectedTo === selected.data.id) connectedIds.push(bat.id);
      }
      break;

    case 'battery':
      connectedIds.push(selected.data.connectedTo);
      break;

    case 'load':
      connectedIds.push(selected.data.connectedTo);
      break;

    case 'line':
      connectedIds.push(selected.data.fromId, selected.data.toId);
      break;
  }

  return connectedIds;
}
