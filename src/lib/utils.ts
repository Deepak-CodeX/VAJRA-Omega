// ═══════════════════════════════════════════════════════════════════════
// VAJRA-Ω — Utility Functions
// ═══════════════════════════════════════════════════════════════════════

/**
 * Deterministic PRNG — Park-Miller LCG.
 * Same seed always produces the same sequence.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed % 2147483647;
    if (this.state <= 0) this.state += 2147483646;
  }

  /** Returns a number in [0, 1) */
  next(): number {
    this.state = (this.state * 16807) % 2147483647;
    return (this.state - 1) / 2147483646;
  }

  /** Returns a number in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns an integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Returns true with probability p */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Pick random element from array */
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Shuffle array in place (Fisher-Yates) */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Gaussian random using Box-Muller, mean=0 stddev=1 */
  gaussian(): number {
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// ─── ID generation ──────────────────────────────────────────────────

let idCounter = 0;

export function generateId(prefix: string): string {
  idCounter++;
  return `${prefix}-${idCounter.toString().padStart(4, '0')}`;
}

export function resetIdCounter(): void {
  idCounter = 0;
}

// ─── Math helpers ───────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

export function distance2D(
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/** Map a value from one range to another */
export function mapRange(
  value: number,
  inMin: number, inMax: number,
  outMin: number, outMax: number,
): number {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

// ─── Time helpers ───────────────────────────────────────────────────

const TICKS_PER_MINUTE = 60; // 1 tick = 1 second

/** Convert ticks to a HH:MM:SS string (24-hour simulated time starting at 06:00) */
export function tickToTimestamp(tick: number): string {
  const totalSeconds = tick;
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  // Simulation starts at 06:00
  const displayHour = (6 + hours) % 24;
  return `${displayHour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/** Get simulated hour of day (0-23) from tick, starting at 06:00 */
export function tickToHourOfDay(tick: number): number {
  const hours = Math.floor(tick / 3600);
  return (6 + hours) % 24;
}

/** Get fractional hour of day for smooth curves */
export function tickToFractionalHour(tick: number): number {
  const totalSeconds = tick;
  const fractionalHour = totalSeconds / 3600;
  return (6 + fractionalHour) % 24;
}

// ─── Formatting ─────────────────────────────────────────────────────

export function formatMW(mw: number): string {
  if (Math.abs(mw) >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
  if (Math.abs(mw) >= 1) return `${mw.toFixed(1)} MW`;
  return `${(mw * 1000).toFixed(0)} kW`;
}

export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function formatHz(hz: number): string {
  return `${hz.toFixed(2)} Hz`;
}

// ─── Power grid helpers ─────────────────────────────────────────────

/**
 * Solar irradiance factor based on hour of day.
 * Bell curve peaking at noon (hour 12), zero at night.
 */
export function solarIrradianceFactor(hourOfDay: number): number {
  if (hourOfDay < 6 || hourOfDay > 18) return 0;
  // Gaussian centered at 12, sigma ≈ 2.5
  const x = (hourOfDay - 12) / 2.5;
  return Math.exp(-0.5 * x * x);
}

/**
 * Demand profile factor based on hour of day.
 * Two peaks: morning (8-9) and evening (18-20).
 */
export function demandProfileFactor(hourOfDay: number): number {
  // Base load (never below 0.4)
  const base = 0.4;
  // Morning peak
  const morningPeak = 0.25 * Math.exp(-0.5 * ((hourOfDay - 8.5) / 1.2) ** 2);
  // Evening peak (higher)
  const eveningPeak = 0.35 * Math.exp(-0.5 * ((hourOfDay - 19) / 1.5) ** 2);
  return base + morningPeak + eveningPeak;
}

/**
 * Transmission line loss factor.
 * Simplified: losses are proportional to I² ≈ (flow/capacity)² * a small constant.
 */
export function computeLineLoss(flowMW: number, capacityMW: number, lengthKm: number): number {
  if (capacityMW === 0) return 0;
  const loading = Math.abs(flowMW) / capacityMW;
  // Loss factor: ~0.5% per 100km at full load, quadratic with loading
  const lossRate = 0.005 * (lengthKm / 100);
  return Math.abs(flowMW) * lossRate * loading;
}

/**
 * Frequency deviation based on gen-demand imbalance.
 * ΔF ≈ -K * (demand - generation) / totalCapacity
 * Where K is droop constant (typically ~5 Hz per 100% load change).
 */
export function computeFrequencyDeviation(
  generationMW: number,
  demandMW: number,
  totalCapacityMW: number,
): number {
  if (totalCapacityMW === 0) return 0;
  const imbalanceFraction = (demandMW - generationMW) / totalCapacityMW;
  // Droop: 5 Hz for 100% imbalance → 0.05 Hz per 1% imbalance
  return -5 * imbalanceFraction;
}

/**
 * Voltage per-unit based on substation loading.
 * Higher loading = lower voltage (simplified).
 */
export function computeVoltagePU(loadingPercent: number): number {
  // At 0% loading: 1.05 PU, at 100% loading: 0.95 PU, at 120%: 0.90 PU
  return clamp(1.05 - 0.1 * (loadingPercent / 100), 0.85, 1.10);
}

// ─── Severity helpers ───────────────────────────────────────────────

import type { AnomalySeverity, AssetStatus } from '@/types';

export function severityColor(severity: AnomalySeverity): string {
  switch (severity) {
    case 'INFO': return 'var(--cyan)';
    case 'WARNING': return 'var(--amber)';
    case 'CRITICAL': return 'var(--red)';
  }
}

export function statusColor(status: AssetStatus): string {
  switch (status) {
    case 'ONLINE': return 'var(--green)';
    case 'WARNING': return 'var(--amber)';
    case 'OVERLOADED': return 'var(--amber)';
    case 'RECOVERING': return 'var(--blue)';
    case 'FAILED': return 'var(--red)';
    case 'ISOLATED': return 'var(--red)';
    case 'OFFLINE': return 'var(--dim)';
  }
}
