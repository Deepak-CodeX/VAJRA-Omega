'use client';

import { useVajraStore } from '@/store/vajraStore';
import Panel from '@/components/ui/Panel';
import type { Anomaly, AnomalySeverity } from '@/types';

const severityOrder: Record<AnomalySeverity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  INFO: 2,
};

const severityColor: Record<AnomalySeverity, string> = {
  CRITICAL: '#ff3b5c',
  WARNING: '#f5a623',
  INFO: '#3b9eff',
};

const severityBg: Record<AnomalySeverity, string> = {
  CRITICAL: 'rgba(255, 59, 92, 0.08)',
  WARNING: 'rgba(245, 166, 35, 0.08)',
  INFO: 'rgba(59, 158, 255, 0.05)',
};

export default function AnomalyPanel() {
  const anomalies = useVajraStore((s) => s.anomalies);

  const active = anomalies
    .filter((a) => !a.resolved)
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const resolvedCount = anomalies.filter((a) => a.resolved).length;

  return (
    <Panel
      title="Anomalies"
      accent={active.some((a) => a.severity === 'CRITICAL') ? 'red' : active.length > 0 ? 'amber' : 'none'}
    >
      <div className="flex flex-col gap-1.5">
        {/* Counters */}
        <div className="mb-1 flex items-center gap-3 text-[9px]">
          <span className="text-[#ff3b5c]">
            {active.filter((a) => a.severity === 'CRITICAL').length} critical
          </span>
          <span className="text-[#f5a623]">
            {active.filter((a) => a.severity === 'WARNING').length} warning
          </span>
          <span className="text-[#3a5568]">{resolvedCount} resolved</span>
        </div>

        {active.length === 0 && (
          <div className="py-4 text-center text-[10px] text-[#3a5568]">
            No active anomalies
          </div>
        )}

        {active.map((anomaly: Anomaly) => (
          <div
            key={anomaly.id}
            className="flex items-start gap-2 rounded border px-2 py-1.5"
            style={{
              borderColor: `${severityColor[anomaly.severity]}30`,
              backgroundColor: severityBg[anomaly.severity],
            }}
          >
            <span
              className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: severityColor[anomaly.severity] }}
            />
            <div className="flex flex-col gap-0.5 overflow-hidden">
              <span
                className="text-[10px] font-medium"
                style={{ color: severityColor[anomaly.severity] }}
              >
                {anomaly.type.replace(/_/g, ' ')}
              </span>
              <span className="truncate text-[9px] text-[#5a7a8f]">{anomaly.message}</span>
              <span className="text-[8px] text-[#3a5568]">
                Detected at T+{anomaly.detectedAtTick}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
